-- 0063 and the 0062 audit fixes. Sunita (cc01, Center Leader) from gate_on_duty.test.sql; admin a1 and parent e1 from
-- foundation.test.sql; Riya (62a1) from attendance_reports.test.sql.
delete from app.gate_duty;
create function pg_temp.as_who(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p)::text, false)
$$;

-- An app from before 0061 (no p_start) still starts and ends duty as it did; today's app never does either.
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-00000000cc01');
do $$ begin
  perform public.gate_heartbeat(true);
  assert public.my_duty() ->> 'status' = 'active', 'an old app starting its heartbeat starts duty';
  perform public.gate_heartbeat(false);
  assert public.my_duty() is null, 'and leaving its duty screen ends it, as before 0061';
  perform public.gate_heartbeat(true, false);
  assert public.my_duty() is null, 'today''s heartbeat never starts duty';
  perform public.set_duty('active', null);
  perform public.gate_heartbeat(false, false);
  assert public.my_duty() ->> 'status' = 'active', 'nor ends it';
end $$;
reset role;
delete from app.gate_duty;

-- Gate alerts: a paused person is still told when everyone else on the team has no device to be told on.
do $$ declare kid uuid; team uuid[]; begin
  select c.id into kid from public.children c where cardinality(app.coordinators_for(c.id)) >= 2 limit 1;
  team := app.coordinators_for(kid);
  update public.profiles set active = true, app_access = true where id = any (team);
  insert into public.device_tokens (profile_id, platform, token) values (team[1], 'android', 'audit-' || team[1]::text) on conflict (token) do nothing;
  delete from public.device_tokens where profile_id = any (team[2:]);
  delete from public.push_subscriptions where profile_id = any (team[2:]);
  insert into app.gate_duty (profile_id, status) values (team[1], 'paused');
  assert team[1] = any (app.gate_team_for(kid)), 'the only reachable person is told although paused: ' || app.gate_team_for(kid)::text;
  -- With a reachable colleague, the paused person is skipped.
  insert into public.device_tokens (profile_id, platform, token) values (team[2], 'android', 'audit-' || team[2]::text);
  assert app.gate_team_for(kid) = array[team[2]], 'reachable colleague only: ' || app.gate_team_for(kid)::text;
end $$;
delete from app.gate_duty;

-- An admin's correction is the admin's: a parent's earlier report doesn't put the parent's name on it.
select set_config('app.now', '2026-03-09 10:00:00+05:30', false);
insert into public.attendance (child_id, day, status, checked_in_at, reported_by) values
  ('00000000-0000-0000-0000-0000000062a1', '2026-03-06', 'present', '2026-03-06 09:02+05:30', '00000000-0000-0000-0000-0000000000e1')
on conflict (child_id, day) do update set status = 'present', checked_in_at = excluded.checked_in_at, reported_by = excluded.reported_by;
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform public.correct_attendance('00000000-0000-0000-0000-0000000062a1', '2026-03-06', '{"status": "absent", "dropoff_at": null}', 'Check-in was a mis-tap', gen_random_uuid());
end $$;
reset role;
do $$ begin
  assert (select reported_by from public.attendance where child_id = '00000000-0000-0000-0000-0000000062a1' and day = '2026-03-06') = '00000000-0000-0000-0000-0000000000a1', 'reported by the admin';
end $$;
select set_config('app.now', '', false);
