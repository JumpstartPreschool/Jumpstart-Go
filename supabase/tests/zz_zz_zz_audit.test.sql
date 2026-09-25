-- 0021: fixes from the production audit.
-- People from foundation.test.sql: c1 core. Programme b001, child c0001.

-- 1. The core team can't write programmes, attendance, regular times or holidays directly (only through functions).
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  update public.programmes set name = 'Renamed' where id = '00000000-0000-0000-0000-00000000b001';
  raise exception 'FAIL: the core team renamed a programme directly';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.attendance (child_id, day, status) values ('00000000-0000-0000-0000-0000000c0001', '2026-10-01', 'absent');
  raise exception 'FAIL: the core team wrote attendance directly';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 2. Sign-in codes: the eleventh request in an hour for one email is refused (0023: 10 an hour).
do $$
declare e text := (select email from public.profiles where active and app_access and email is not null limit 1);
declare i int;
begin
  delete from app.throttle_log where key = 'login:' || lower(e);
  for i in 1..10 loop assert public.login_allowed(e), 'allowed ' || i; end loop;
  begin
    perform public.login_allowed(e);
    raise exception 'FAIL: an eleventh code request in an hour';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'rate_limited%', sqlerrm;
  end;
  assert not public.login_allowed('nobody@example.com'), 'unknown emails are still just refused';
end $$;

-- 3. A trip changed without a sign-in (a collector's link) is limited to 6 changes an hour.
set request.jwt.claims to '{}';  -- no sign-in, as when a link page calls in
do $$
declare t uuid := (select id from public.trips order by created_at limit 1);
declare i int;
begin
  assert t is not null, 'a trip exists';
  delete from app.throttle_log where key = 'link:' || t;
  for i in 1..6 loop update public.trips set arrive_at = arrive_at + interval '1 minute' where id = t; end loop;
  begin
    update public.trips set arrive_at = arrive_at + interval '1 minute' where id = t;
    raise exception 'FAIL: a seventh change from a link in an hour';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'rate_limited%', sqlerrm;
  end;
end $$;

-- 4. Retention (D9): trips older than 30 days go with their location; the audit log keeps a year.
do $$
declare t uuid := (select id from public.trips order by created_at limit 1);
begin
  update public.trips set day = (now() at time zone 'Asia/Kolkata')::date - 31 where id = t;
  insert into public.audit_log (at, action, table_name) values (now() - interval '400 days', 'update', 'settings');
  insert into public.attendance (child_id, day, status) values ('00000000-0000-0000-0000-0000000c0001', current_date - 800, 'present'),
    ('00000000-0000-0000-0000-0000000c0001', current_date - 200, 'present') on conflict do nothing;
  perform app.purge_old_records();
  assert not exists (select 1 from public.trips where id = t), 'old trip removed';
  assert not exists (select 1 from public.trip_points where trip_id = t), 'its location removed';
  assert not exists (select 1 from public.audit_log where at < now() - interval '1 year'), 'old audit rows removed';
  assert exists (select 1 from public.audit_log), 'recent audit rows kept';
  assert not exists (select 1 from public.attendance where day = current_date - 800), 'attendance older than last academic year removed';
  assert exists (select 1 from public.attendance where day = current_date - 200), 'last academic year kept';
end $$;
