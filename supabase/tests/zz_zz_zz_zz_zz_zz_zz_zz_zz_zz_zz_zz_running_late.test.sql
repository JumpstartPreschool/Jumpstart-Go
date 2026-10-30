-- Running late (0043). Its own people: S Sneha (mother, makes the change), R Raj (father, wants to hear about changes),
-- U Usha (mother of another child), K Kiran (Center Coordinator covering the class). The clock is pinned to 1:00 PM.
set app.now = '2026-10-05 13:00:00+05:30';
set session_replication_role = replica;
insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-000000010a01', '919833300001'), ('00000000-0000-0000-0000-000000010a02', '919833300002'),
  ('00000000-0000-0000-0000-000000010a03', '919833300003'), ('00000000-0000-0000-0000-000000010a04', '919833300004');
insert into public.profiles (id, user_id, full_name, phone, active, app_access, notify_family) values
  ('00000000-0000-0000-0000-000000010b01', '00000000-0000-0000-0000-000000010a01', 'Sneha Sharma', '+919833300001', true, true, true),
  ('00000000-0000-0000-0000-000000010b02', '00000000-0000-0000-0000-000000010a02', 'Raj Sharma', '+919833300002', true, true, true),
  ('00000000-0000-0000-0000-000000010b03', '00000000-0000-0000-0000-000000010a03', 'Usha Iyer', '+919833300003', true, true, true),
  ('00000000-0000-0000-0000-000000010b04', '00000000-0000-0000-0000-000000010a04', 'Kiran Patil', '+919833300004', true, true, true);
insert into public.staff_roles (profile_id, role) values ('00000000-0000-0000-0000-000000010b04', 'coordinator');
insert into public.children (id, full_name, date_of_birth, class_id, programme_id)
  select '00000000-0000-0000-0000-000000010c01', 'Aarav Sharma', '2022-01-01', p.class_id, p.id from public.programmes p where p.class_id is not null order by p.name limit 1;
insert into public.children (id, full_name, date_of_birth, class_id, programme_id)
  select '00000000-0000-0000-0000-000000010c02', 'Isha Iyer', '2022-01-01', p.class_id, p.id from public.programmes p where p.class_id is not null order by p.name limit 1;
insert into public.guardianships (child_id, guardian_id, relation) values
  ('00000000-0000-0000-0000-000000010c01', '00000000-0000-0000-0000-000000010b01', 'Mother'),
  ('00000000-0000-0000-0000-000000010c01', '00000000-0000-0000-0000-000000010b02', 'Father'),
  ('00000000-0000-0000-0000-000000010c02', '00000000-0000-0000-0000-000000010b03', 'Mother');
insert into public.coordinator_classes (profile_id, class_id) select '00000000-0000-0000-0000-000000010b04', class_id from public.children where id = '00000000-0000-0000-0000-000000010c01';
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  select id, 'https://web.push.apple.com/' || id, repeat('p', 60), repeat('a', 20) from public.profiles where id::text like '00000000-0000-0000-0000-000000010b0%';
-- Sneha is on her way, arriving 1:10 PM.
insert into public.trips (id, child_id, direction, day, arrive_at, created_by, traveller_name, traveller_relation, acknowledged_at, acknowledged_by)
values ('00000000-0000-0000-0000-000000010d01', '00000000-0000-0000-0000-000000010c01', 'pickup', '2026-10-05', '2026-10-05 13:10:00+05:30',
        '00000000-0000-0000-0000-000000010b01', 'Sneha Sharma', 'Mother', '2026-10-05 13:02:00+05:30', '00000000-0000-0000-0000-000000010b04');
set session_replication_role = origin;
delete from app.push_outbox;

-- Another child's mother can't touch it; nor can someone signed out.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000010a03"}';
set role authenticated;
do $$ begin
  begin
    perform public.running_late('00000000-0000-0000-0000-000000010d01', 10);
    raise exception 'another family changed the trip';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Sneha: +10 minutes, with a note. The real arrival time moves; the gate's acknowledgement is reset so it's heard again.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000010a01"}';
set role authenticated;
do $$
declare t public.trips;
begin
  t := public.running_late('00000000-0000-0000-0000-000000010d01', 10, null, '  Traffic near school  ');
  assert t.arrive_at = '2026-10-05 13:20:00+05:30', format('arrive_at %s', t.arrive_at);
  assert t.late_from = '2026-10-05 13:10:00+05:30' and t.late_note = 'Traffic near school', 'history and note kept';
  assert t.late_by = '00000000-0000-0000-0000-000000010b01' and t.late_at is not null, 'who and when';
  assert t.acknowledged_at is null and t.status = 'en_route', 'heard again';
  -- Again, with a custom time: only the latest counts, on the same trip.
  t := public.running_late('00000000-0000-0000-0000-000000010d01', null, '2026-10-05 13:35:00+05:30');
  assert t.arrive_at = '2026-10-05 13:35:00+05:30' and t.late_from = '2026-10-05 13:20:00+05:30' and t.late_note is null, 'latest wins';
  assert (select count(*) from public.trips where child_id = '00000000-0000-0000-0000-000000010c01') = 1, 'still one trip';
end $$;
reset role;

-- Who was told: the gate team ("delayed") and Raj, never Sneha about her own change.
do $$ begin
  assert exists (select 1 from app.push_outbox where profile_id = '00000000-0000-0000-0000-000000010b04' and title = 'Aarav pickup delayed' and body = 'Mother is now arriving about 1:35 PM.'), 'gate told';
  assert exists (select 1 from app.push_outbox where profile_id = '00000000-0000-0000-0000-000000010b02' and title = 'Aarav''s pickup time changed' and body = 'Sneha is now arriving about 1:35 PM.'), 'father told';
  assert not exists (select 1 from app.push_outbox where profile_id = '00000000-0000-0000-0000-000000010b01'), 'not told about her own change';
  assert not exists (select 1 from app.push_outbox where profile_id = '00000000-0000-0000-0000-000000010b03'), 'other family not told';
  assert (select count(*) from public.audit_log where table_name = 'trips' and new_row ->> 'id' = '00000000-0000-0000-0000-000000010d01' and new_row ->> 'late_at' is not null) >= 2, 'each update audited';
end $$;
-- Raj turned off "when the other parent changes something": not told next time.
update public.profiles set notify_family = false where id = '00000000-0000-0000-0000-000000010b02';
delete from app.push_outbox;

-- Refused: an earlier time, a choice off the list, a past time, after midnight, too far ahead, a long note, both or
-- neither of minutes and time.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000010a01"}';
set role authenticated;
do $$
declare bad record;
begin
  for bad in select * from (values
    (null::int, '2026-10-05 13:30:00+05:30'::timestamptz, null::text, 'not_later%'),
    (20, null, null, 'bad_time%'),
    (null, '2026-10-05 12:30:00+05:30', null, 'not_later%'),
    (null, '2026-10-06 00:10:00+05:30', null, 'outside_hours%'),
    (null, '2026-10-05 17:30:00+05:30', null, 'too_far%'),
    (5, null, repeat('x', 121), 'note_too_long%'),
    (5, '2026-10-05 14:00:00+05:30', null, 'bad_time%'),
    (null, null, null, 'bad_time%')) v(m, at, note, expected) loop
    begin
      perform public.running_late('00000000-0000-0000-0000-000000010d01', bad.m, bad.at, bad.note);
      raise exception 'accepted %', bad;
    exception when sqlstate 'P0001' then
      if sqlerrm not like bad.expected then raise exception 'expected % got %', bad.expected, sqlerrm; end if;
    end;
  end loop;
  -- +5 still works, and Raj (who turned family changes off) hears nothing.
  perform public.running_late('00000000-0000-0000-0000-000000010d01', 5);
end $$;
reset role;
do $$ begin
  assert (select arrive_at from public.trips where id = '00000000-0000-0000-0000-000000010d01') = '2026-10-05 13:40:00+05:30', '+5 from 1:35';
  assert not exists (select 1 from app.push_outbox where profile_id = '00000000-0000-0000-0000-000000010b02'), 'preference respected';
end $$;

-- A plain new time (Change time, through start_trip) ends "running late" on the same trip.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000010a01"}';
set role authenticated;
do $$
declare t public.trips;
begin
  t := public.start_trip('00000000-0000-0000-0000-000000010c01', 'pickup', 25, 'Change of plan');
  assert t.id = '00000000-0000-0000-0000-000000010d01' and t.late_at is null and t.late_from is null and t.late_note is null, 'no longer late';
end $$;
reset role;

-- At most 6 in 10 minutes for a trip (three so far).
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000010a01"}';
set role authenticated;
do $$ begin
  perform public.running_late('00000000-0000-0000-0000-000000010d01', 5);
  perform public.running_late('00000000-0000-0000-0000-000000010d01', 5);
  perform public.running_late('00000000-0000-0000-0000-000000010d01', 5);
  begin
    perform public.running_late('00000000-0000-0000-0000-000000010d01', 5);
    raise exception 'a seventh late update went through';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'rate_limited%' then raise; end if;
  end;
end $$;
reset role;

-- Once they've arrived, or once the trip is over, it can't be changed.
update public.trips set arrived_at = app.clock() where id = '00000000-0000-0000-0000-000000010d01';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000010a02"}';
set role authenticated;
do $$ begin
  begin
    perform public.running_late('00000000-0000-0000-0000-000000010d01', 5);
    raise exception 'changed after arriving';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'already_here%' then raise; end if;
  end;
end $$;
reset role;
update public.trips set status = 'cancelled', closed_at = app.clock() where id = '00000000-0000-0000-0000-000000010d01';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000010a02"}';
set role authenticated;
do $$ begin
  begin
    perform public.running_late('00000000-0000-0000-0000-000000010d01', 5);
    raise exception 'changed a cancelled trip';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'trip_closed%' then raise; end if;
  end;
end $$;
reset role;
reset app.now;
