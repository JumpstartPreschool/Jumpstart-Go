-- 0045: running_late's expected time, arrive_trip on the app clock, and the gate announcement save (cap, reset, reminder).
-- Its own people: S Sneha (mother), A Asha (admin).
set app.now = '2026-10-05 13:00:00+05:30';
set session_replication_role = replica;
insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-000000020a01', '919844400001'), ('00000000-0000-0000-0000-000000020a02', '919844400002');
insert into public.profiles (id, user_id, full_name, phone, active, app_access, notify_family) values
  ('00000000-0000-0000-0000-000000020b01', '00000000-0000-0000-0000-000000020a01', 'Sneha Rao', '+919844400001', true, true, true),
  ('00000000-0000-0000-0000-000000020b02', '00000000-0000-0000-0000-000000020a02', 'Asha Admin', '+919844400002', true, true, true);
insert into public.staff_roles (profile_id, role) values ('00000000-0000-0000-0000-000000020b02', 'admin');
insert into public.children (id, full_name, date_of_birth, class_id, programme_id)
  select '00000000-0000-0000-0000-000000020c01', 'Veer Rao', '2022-01-01', p.class_id, p.id from public.programmes p where p.class_id is not null order by p.name limit 1;
insert into public.guardianships (child_id, guardian_id, relation) values ('00000000-0000-0000-0000-000000020c01', '00000000-0000-0000-0000-000000020b01', 'Mother');
insert into public.trips (id, child_id, direction, day, arrive_at, created_by, traveller_name, traveller_relation)
values ('00000000-0000-0000-0000-000000020d01', '00000000-0000-0000-0000-000000020c01', 'pickup', '2026-10-05', '2026-10-05 13:10:00+05:30',
        '00000000-0000-0000-0000-000000020b01', 'Sneha Rao', 'Mother');
set session_replication_role = origin;

-- Running late with the time the parent saw: it works once, and the same tap sent again is refused, not added twice.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000020a01"}';
set role authenticated;
do $$
declare t public.trips;
begin
  t := public.running_late('00000000-0000-0000-0000-000000020d01', 10, null, null, '2026-10-05 13:10:00+05:30');
  assert t.arrive_at = '2026-10-05 13:20:00+05:30', format('+10 once: %s', t.arrive_at);
  begin
    perform public.running_late('00000000-0000-0000-0000-000000020d01', 10, null, null, '2026-10-05 13:10:00+05:30');
    raise exception 'the retry added another 10 minutes';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'stale: The time changed.%' then raise; end if;
  end;
  assert (select arrive_at from public.trips where id = '00000000-0000-0000-0000-000000020d01') = '2026-10-05 13:20:00+05:30', 'time unchanged by the refused retry';
  -- The four-argument call (the app before this version) and the current time as expected both still work.
  t := public.running_late('00000000-0000-0000-0000-000000020d01', 5);
  assert t.arrive_at = '2026-10-05 13:25:00+05:30', 'old call shape works';
  t := public.running_late('00000000-0000-0000-0000-000000020d01', 5, null, null, '2026-10-05 13:25:00+05:30');
  assert t.arrive_at = '2026-10-05 13:30:00+05:30', 'current time as expected works';
end $$;

-- Arriving is stamped with the app clock (1:00 PM here, not the real time), once.
do $$
declare t public.trips;
begin
  t := public.arrive_trip('00000000-0000-0000-0000-000000020d01');
  assert t.arrived_at = '2026-10-05 13:00:00+05:30' and t.updated_at = '2026-10-05 13:00:00+05:30', format('arrived_at %s', t.arrived_at);
  assert (public.arrive_trip('00000000-0000-0000-0000-000000020d01')).arrived_at = '2026-10-05 13:00:00+05:30', 'the second tap changes nothing';
end $$;
reset role;

-- Other tests' wording changes are in the same day's log: start this one empty.
delete from app.throttle_log where key = 'gate-words';

-- Gate announcements: only the admin; the reminder is every 2, 3 or 5 minutes.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000020a02"}';
set role authenticated;
do $$
declare bad text;
begin
  foreach bad in array array['{"reminder_min": 1}', '{"reminder_min": 0}', '{"reminder_min": 4}', '{"early_min": 10, "ready_min": 10}', '{"early_min": 12}'] loop
    begin
      perform public.admin_save_gate_announcements(bad::jsonb);
      raise exception 'saved %', bad;
    exception when sqlstate 'P0001' then
      if sqlerrm not like 'bad_timing%' then raise exception '% gave %', bad, sqlerrm; end if;
    end;
  end loop;
  -- The timing order is said as the order, and a reminder as the reminder.
  begin
    perform public.admin_save_gate_announcements('{"early_min": 10, "ready_min": 10}'::jsonb);
  exception when sqlstate 'P0001' then
    assert sqlerrm like '%early announcement must come before%', sqlerrm;
  end;
  begin
    perform public.admin_save_gate_announcements('{"reminder_min": 1}'::jsonb);
  exception when sqlstate 'P0001' then
    assert sqlerrm like '%every 2, 3 or 5 minutes%', sqlerrm;
  end;
  assert (public.admin_save_gate_announcements('{"reminder_min": 3}'::jsonb)).reminder_min = 3, 'a listed reminder saves';
end $$;

-- 20 wording changes a day, and going back to the defaults is always allowed and never counted.
do $$
declare i int; r public.gate_announcement_settings;
begin
  for i in 1..20 loop
    perform public.admin_save_gate_announcements(jsonb_build_object('opening_new', 'Hello number ' || i || '.'));
  end loop;
  begin
    perform public.admin_save_gate_announcements('{"opening_new": "One more please."}'::jsonb);
    raise exception 'a 21st change went through';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'too_many_changes: The wording can change 20 times a day%' then raise; end if;
  end;
  -- A timing change alone is not a wording change, even at the cap.
  r := public.admin_save_gate_announcements('{"opening_new": "Hello number 20.", "early_min": 20}'::jsonb);
  assert r.early_min = 20 and r.opening_new = 'Hello number 20.', 'timings still change at the cap';
  -- Reset: all wordings back to the default, at the cap.
  r := public.admin_save_gate_announcements('{}'::jsonb);
  assert r.opening_new is null and r.early_min = 15 and r.reminder_min = 2, 'reset to defaults at the cap';
end $$;
reset role;
do $$ begin
  assert (select count(*) from app.throttle_log where key = 'gate-words') = 20, 'the reset was not counted';
end $$;
reset app.now;
