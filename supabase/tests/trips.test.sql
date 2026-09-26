-- "I'm on my way" (0006). Uses the people and programmes seeded by foundation.test.sql:
-- Aarav c0001 (Jr KG · Half day, pickup 12:30–13:00, Mon–Fri) with Parent A e1 (Mother, also a coordinator after roles.test.sql);
-- Meera c0002 (Learning Center, flexible 09:00–19:00, Mon–Sat except 2nd and last Saturday) with Parent B e2 (Father);
-- d1 coordinator, c1 core team. The clock is pinned: 24 Sep 2026 is a Thursday.

-- Earlier tests edit the windows; start from the website's Jr KG half day (pickup 12:30–13:00).
update public.programmes set dropoff_from = '09:00', dropoff_to = '09:30', pickup_from = '12:30', pickup_to = '13:00'
  where id = '00000000-0000-0000-0000-00000000b001';

set app.now = '2026-09-24 12:10:00+05:30';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
set role authenticated;
do $$
declare t public.trips;
begin
  t := public.start_trip('00000000-0000-0000-0000-0000000c0001', 'pickup', 20);
  assert t.status = 'en_route' and not t.off_schedule and t.day = '2026-09-24', 'on time, inside the window';
  assert (t.arrive_at at time zone 'Asia/Kolkata')::time = '12:30', 'arrives in 20 minutes';
  assert t.traveller_name = 'Parent A' and t.traveller_relation = 'Mother', 'names who is coming';
end $$;

-- Early (12:20, before the 12:30 window) needs a reason, then updates the same open trip and flags it.
do $$ begin
  perform public.start_trip('00000000-0000-0000-0000-0000000c0001', 'pickup', 10);
  raise exception 'FAIL: early pickup without a reason';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'reason_required%', sqlerrm;
end $$;
do $$
declare t public.trips;
begin
  perform public.gate_step((select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c0001'), 'acknowledge');
  t := public.start_trip('00000000-0000-0000-0000-0000000c0001', 'pickup', 10, '  Doctor''s visit ');
  assert t.off_schedule and t.reason = 'Doctor''s visit', 'flagged with the reason';
  assert t.acknowledged_at is null, 'a new time is announced again';
  assert (select count(*) from public.trips where child_id = '00000000-0000-0000-0000-0000000c0001') = 1, 'one open trip per child and direction';
end $$;

-- Not someone else's child.
do $$ begin
  perform public.start_trip('00000000-0000-0000-0000-0000000c0002', 'pickup', 20);
  raise exception 'FAIL: parent started a trip for another family''s child';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Parent B brings Meera (flexible programme: any time in 09:00–19:00).
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$
declare t public.trips;
begin
  t := public.start_trip('00000000-0000-0000-0000-0000000c0002', 'dropoff', 5);
  assert not t.off_schedule and t.traveller_relation = 'Father', 'flexible drop-off';
  assert (select count(*) from public.trips) = 1, 'a parent sees only their own children''s trips';
end $$;
do $$ begin
  insert into public.trips (child_id, direction, day, arrive_at, created_by, traveller_name)
  values ('00000000-0000-0000-0000-0000000c0002', 'pickup', '2026-09-24', now(), '00000000-0000-0000-0000-0000000000e2', 'x');
  raise exception 'FAIL: direct insert allowed';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.gate_step((select id from public.trips limit 1), 'close');
  raise exception 'FAIL: parent used a gate step';
exception when insufficient_privilege then null;
end $$;
-- Parent B cancels the drop-off.
do $$
declare t public.trips;
begin
  t := public.cancel_trip((select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c0002'));
  assert t.status = 'cancelled' and t.closed_at is not null, 'cancelled';
end $$;
reset role;

-- The gate day (08:45–19:15, D24) and school days.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
-- 0026: the gate hours and school days no longer block a trip; a time outside the window still asks why.
set app.now = '2026-09-24 18:50:00+05:30';
do $$ begin
  perform public.start_trip('00000000-0000-0000-0000-0000000c0002', 'pickup', 30);
  raise exception 'FAIL: a pickup outside the window went through without a reason';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'reason_required%', sqlerrm;
end $$;
set app.now = '2026-09-24 08:30:00+05:30';
do $$ begin
  perform public.start_trip('00000000-0000-0000-0000-0000000c0002', 'dropoff', 10);
  raise exception 'FAIL: a drop-off outside the window went through without a reason';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'reason_required%', sqlerrm;
end $$;
-- A trip still can't roll past midnight into tomorrow.
set app.now = '2026-09-24 23:50:00+05:30';
do $$ begin
  perform public.start_trip('00000000-0000-0000-0000-0000000c0002', 'pickup', 30);
  raise exception 'FAIL: a trip past midnight';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'outside_hours%', sqlerrm;
end $$;
-- The last Saturday (no Learning Center that day): a trip works anyway.
set app.now = '2026-09-26 10:00:00+05:30';
do $$
declare t public.trips;
begin
  t := public.start_trip('00000000-0000-0000-0000-0000000c0002', 'dropoff', 10);
  assert t.day = '2026-09-26', 'trip booked on a non-school day';
end $$;
set app.now = '2026-09-19 10:00:00+05:30';  -- 3rd Saturday: the Learning Center is open
do $$ begin
  perform public.start_trip('00000000-0000-0000-0000-0000000c0002', 'dropoff', 10);
end $$;
reset role;

-- A child marked absent can't be announced.
insert into public.attendance (child_id, day, status) values ('00000000-0000-0000-0000-0000000c0002', '2026-09-25', 'absent');
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
set app.now = '2026-09-25 10:00:00+05:30';
do $$ begin
  perform public.start_trip('00000000-0000-0000-0000-0000000c0002', 'pickup', 30);
  raise exception 'FAIL: absent child announced';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'not_coming%', sqlerrm;
end $$;
reset role;

-- The core team can't run the gate without the Coordinator role (foundation.test.sql gave c1 one).
delete from public.staff_roles where profile_id = '00000000-0000-0000-0000-0000000000c1' and role = 'coordinator';
set app.now = '2026-09-24 12:12:00+05:30';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  perform public.gate_step((select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c0001' and status = 'en_route'), 'ready');
  raise exception 'FAIL: core team used a gate step';
exception when insufficient_privilege then null;
end $$;
reset role;

-- The coordinator acknowledges, gets Aarav ready, and hands him over, only to a registered guardian.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$
declare
  trip uuid := (select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c0001' and status = 'en_route');
  t public.trips;
begin
  t := public.gate_step(trip, 'acknowledge');
  assert t.acknowledged_by = '00000000-0000-0000-0000-0000000000d1', 'acknowledged';
  t := public.gate_step(trip, 'ready');
  assert t.ready_at is not null, 'ready';
  begin
    perform public.gate_step(trip, 'close', '00000000-0000-0000-0000-0000000000e2');
    raise exception 'FAIL: handed to someone who is not a guardian';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  t := public.gate_step(trip, 'close', '00000000-0000-0000-0000-0000000000e1');
  assert t.status = 'handed_over' and t.handed_to = '00000000-0000-0000-0000-0000000000e1', 'handed over';
  assert (select checked_out_at is not null and status = 'present' from public.attendance
          where child_id = '00000000-0000-0000-0000-0000000c0001' and day = '2026-09-24'), 'attendance records the pickup';
  begin
    perform public.gate_step(trip, 'acknowledge');
    raise exception 'FAIL: step on a finished trip';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

-- Collected: no second pickup the same day.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
set role authenticated;
do $$ begin
  perform public.start_trip('00000000-0000-0000-0000-0000000c0001', 'pickup', 20);
  raise exception 'FAIL: second pickup after handover';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'already_done%', sqlerrm;
end $$;
reset role;

set role anon;
do $$ begin
  perform public.start_trip('00000000-0000-0000-0000-0000000c0001', 'pickup', 20);
  raise exception 'FAIL: anon started a trip';
exception when insufficient_privilege then null;
end $$;
reset role;
reset app.now;
