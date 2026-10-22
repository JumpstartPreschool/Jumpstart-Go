-- 0061: duty changes only by an explicit, authorised set_duty. Sunita (cc01, Center Leader) and Rekha (cc02, a parent)
-- from gate_on_duty.test.sql; Asha (59a01) and Bina (59a02) coordinators from push_delivery.test.sql.
delete from app.gate_duty;
create function pg_temp.as_who(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p)::text, false)
$$;
create function pg_temp.v() returns int language sql as $$ select (public.my_duty() ->> 'version')::int $$;

set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-00000000cc01');
do $$ declare d json; begin
  assert public.my_duty() is null, 'off duty to begin with';
  d := public.set_duty('active', null);
  assert d ->> 'status' = 'active' and (d ->> 'version')::int = 1, 'started: ' || d::text;
  -- A repeated tap or a retry changes nothing.
  assert (public.set_duty('active', null) ->> 'version')::int = 1, 'start is idempotent';
end $$;

-- 1-7, 15: lifecycle signals (backgrounded, locked, offline, reloaded, WebSocket gone) only ever reach the heartbeat.
do $$ begin
  perform public.gate_heartbeat(false, false);   -- app switched, sound paused, screen closed
  perform public.gate_heartbeat(true, false);    -- back
  assert public.my_duty() ->> 'status' = 'active', 'still active after the app lifecycle';
  assert pg_temp.v() = 1, 'and unchanged';
end $$;
reset role;
-- Hours later and on another day, with no heartbeat at all (device restarted, PWA killed): still active.
update app.gate_duty set seen_at = now() - interval '30 hours', started_at = now() - interval '30 hours';
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-00000000cc01');
do $$ begin
  perform public.gate_heartbeat(true, false);
  assert public.my_duty() ->> 'status' = 'active', 'nothing ends duty automatically';
  assert (public.my_duty() ->> 'started_at')::timestamptz < now() - interval '1 day', 'and its start is kept';
end $$;

-- 9, 10: pause and resume only on request, and they persist.
do $$ declare d json; begin
  d := public.set_duty('paused', pg_temp.v(), 'Lunch');
  assert d ->> 'status' = 'paused' and d ->> 'change_reason' = 'Lunch' and d ->> 'paused_at' is not null, 'paused: ' || d::text;
  perform public.gate_heartbeat(true, false);
  assert public.my_duty() ->> 'status' = 'paused', 'a heartbeat never resumes';
  assert not ('00000000-0000-0000-0000-00000000cc01'::uuid = any (public.gate_heartbeat(true, false))), 'paused is not heard';
  d := public.set_duty('active', pg_temp.v());
  assert d ->> 'status' = 'active' and d ->> 'resumed_at' is not null and (d ->> 'version')::int = 3, 'resumed: ' || d::text;
end $$;

-- 11, 12: a second device with an older view can't overwrite a newer change; the same request twice is harmless.
do $$ declare stale int := pg_temp.v(); begin
  perform public.set_duty('paused', stale);           -- device A pauses
  assert public.set_duty('paused', stale) ->> 'status' = 'paused', 'device B asking the same thing is fine';
  begin
    perform public.set_duty('active', stale);         -- device B, still showing Active, taps Resume with its old view
    raise exception 'FAIL: a stale device overwrote a newer change';
  exception when sqlstate 'P0001' then
    assert sqlerrm like 'duty_conflict%', sqlerrm;
  end;
  assert public.my_duty() ->> 'status' = 'paused', 'the newer change stands';
end $$;

-- 13: nobody else can change it, and only the gate team has a duty.
select pg_temp.as_who('00000000-0000-0000-0000-00000000cc02');
do $$ begin
  perform public.set_duty('active', null);
  raise exception 'FAIL: a parent went on duty';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.my_duty();
  raise exception 'FAIL: a parent read a duty';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform 1 from app.gate_duty;
  raise exception 'FAIL: the duty table is readable';
exception when insufficient_privilege then null;
end $$;
select pg_temp.as_who('00000000-0000-0000-0000-00000000cc01');
do $$ begin
  begin perform public.set_duty('sleeping', pg_temp.v()); raise exception 'FAIL: unknown status';
  exception when sqlstate '22023' then null; end;
  -- 14: signing out and in again changes nothing on the server; the same person reads the same duty.
  assert public.my_duty() ->> 'status' = 'paused', 'restored after signing in again';
end $$;

-- An app from before 0061 still starts duty with its first heartbeat; this app never does, so an ended duty stays ended.
do $$ begin
  assert public.set_duty('off', pg_temp.v()) is null, 'ended';
  perform public.gate_heartbeat(true, false);
  assert public.my_duty() is null, 'a heartbeat from this app does not start duty';
  perform public.gate_heartbeat(false);
  assert public.my_duty() is null, 'an old app leaving the screen does not start duty';
  perform public.gate_heartbeat(true);
  assert public.my_duty() ->> 'status' = 'active', 'an old app checking in does';
  begin perform public.set_duty('paused', 99); raise exception 'FAIL: stale pause';
  exception when sqlstate 'P0001' then null; end;
  assert public.set_duty('off', pg_temp.v()) is null, 'ended again';
  begin perform public.set_duty('paused', null); raise exception 'FAIL: paused without starting';
  exception when sqlstate 'P0001' then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.audit_log where table_name = 'gate_duty' and actor = '00000000-0000-0000-0000-00000000cc01') >= 6, 'every change is in the audit log';
end $$;

-- Routing: a paused person is skipped while someone else on the child's team can be told; never everyone skipped.
delete from app.gate_duty;
do $$ declare kid uuid; team uuid[]; begin
  select c.id into kid from public.children c where cardinality(app.coordinators_for(c.id)) >= 2 limit 1;
  team := app.coordinators_for(kid);
  -- Everyone on the team can be reached (0063 counts only people an alert can reach).
  update public.profiles set active = true, app_access = true where id = any (team);
  insert into public.device_tokens (profile_id, platform, token) select x, 'android', 'route-' || x::text from unnest(team) x on conflict (token) do nothing;
  insert into app.gate_duty (profile_id, status) values (team[1], 'paused');
  assert not (team[1] = any (app.gate_team_for(kid))) and cardinality(app.gate_team_for(kid)) = cardinality(team) - 1, 'paused person skipped';
  insert into app.gate_duty (profile_id, status) select x, 'paused' from unnest(team[2:]) x on conflict (profile_id) do nothing;
  assert app.gate_team_for(kid) @> team and cardinality(app.gate_team_for(kid)) = cardinality(team), 'all paused: all told';
end $$;
delete from app.gate_duty;
