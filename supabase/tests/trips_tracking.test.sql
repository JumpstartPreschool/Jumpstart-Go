-- Location and third-person links (0008). Runs after trips.test.sql, with its people:
-- Aarav c0001 (Jr KG half day, pickup 12:30–13:00) and Parent A e1; Meera c0002 (Learning Center) and Parent B e2;
-- d1 coordinator. Friday 25 Sep 2026, so nothing from the earlier Thursday tests is in the way.

-- Start from the test Jr KG half day with pickup 12:30–13:00 (earlier tests move it).
update public.programmes set pickup_from = '12:30', pickup_to = '13:00' where id = '00000000-0000-0000-0000-00000000b001';
set app.now = '2026-09-25 12:20:00+05:30';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
set role authenticated;

-- Parent A sends Aarav's pickup to a driver.
do $$
declare r jsonb;
begin
  r := public.invite_collector('00000000-0000-0000-0000-0000000c0001', 20, ' Ramesh Pawar ', '+919812345678', 'Driver');
  assert length(r ->> 'token') >= 30 and r ->> 'code' ~ '^[0-9]{4}$', 'token and 4-digit code returned once';
  assert (select traveller_kind = 'third_person' and traveller_name = 'Ramesh Pawar' from public.trips where id = (r ->> 'trip_id')::uuid), 'the trip names the driver';
  assert public.collector_code((r ->> 'trip_id')::uuid) = r ->> 'code', 'the parent can read the code again';
  perform set_config('test.token', r ->> 'token', false);
  perform set_config('test.code', r ->> 'code', false);
  perform set_config('test.trip', r ->> 'trip_id', false);
end $$;
do $$ begin
  perform public.invite_collector('00000000-0000-0000-0000-0000000c0001', 20, 'R', '+919812345678', 'Driver');
  raise exception 'FAIL: one-letter name';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'name_required%', sqlerrm;
end $$;
do $$ begin
  perform public.invite_collector('00000000-0000-0000-0000-0000000c0001', 20, 'Ramesh Pawar', '98123', 'Driver');
  raise exception 'FAIL: bad phone';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'phone_required%', sqlerrm;
end $$;
reset role;
-- The trip began a few minutes ago on the test clock (created_at comes from the real clock).
update public.trips set created_at = app.clock() - interval '5 minutes' where id = current_setting('test.trip')::uuid;

-- Someone else's parent can't.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$ begin
  perform public.invite_collector('00000000-0000-0000-0000-0000000c0001', 20, 'Stranger', '+919812345678', 'Friend');
  raise exception 'FAIL: another child''s parent sent a link';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  assert public.collector_code(current_setting('test.trip')::uuid) is null, 'no code for someone else''s child';
end $$;
reset role;

-- The driver's phone, not signed in.
set request.jwt.claims to '';
set role anon;
do $$
declare s jsonb;
begin
  s := public.link_open(current_setting('test.token'));
  assert s ->> 'child' = 'Aarav' and s ->> 'collector' = 'Ramesh Pawar' and s ->> 'code' is null and not (s ->> 'confirmed')::boolean, 'opening only reads';
  s := public.link_confirm(current_setting('test.token'), repeat('a', 40));
  assert s ->> 'code' = current_setting('test.code'), 'confirmed phone gets the code';
end $$;
do $$ begin
  perform public.link_open('not-a-real-token');
  raise exception 'FAIL: made-up token opened';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'link_expired%', sqlerrm;
end $$;
do $$ begin
  perform public.link_confirm(current_setting('test.token'), repeat('b', 40));
  raise exception 'FAIL: a second phone confirmed';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'in_use%', sqlerrm;
end $$;
do $$ begin
  perform public.link_status(current_setting('test.token'), repeat('b', 40));
  raise exception 'FAIL: status for the wrong phone';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'link_expired%', sqlerrm;
end $$;

-- Location: good points kept, a jump, an inaccurate fix and a future fix skipped; a coarse fix kept but marked.
do $$
declare n int;
begin
  n := public.link_share(current_setting('test.token'), repeat('a', 40), jsonb_build_array(
    jsonb_build_object('lat', 18.5110, 'lng', 73.8290, 'accuracy', 12, 'fix_at', '2026-09-25 12:18:00+05:30'),
    jsonb_build_object('lat', 18.5100, 'lng', 73.8300, 'accuracy', 10, 'fix_at', '2026-09-25 12:19:00+05:30'),
    jsonb_build_object('lat', 18.6000, 'lng', 73.9000, 'accuracy', 10, 'fix_at', '2026-09-25 12:19:10+05:30'),
    jsonb_build_object('lat', 18.5101, 'lng', 73.8301, 'accuracy', 900, 'fix_at', '2026-09-25 12:19:20+05:30'),
    jsonb_build_object('lat', 18.5095, 'lng', 73.8305, 'accuracy', 150, 'fix_at', '2026-09-25 12:19:30+05:30'),
    jsonb_build_object('lat', 18.5102, 'lng', 73.8302, 'accuracy', 10, 'fix_at', '2026-09-25 12:30:00+05:30')));
  assert n = 3, format('accepted %s of 6', n);
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.trip_points where trip_id = current_setting('test.trip')::uuid and coarse) = 1, 'coarse point marked';
  assert (select sharing from public.trips where id = current_setting('test.trip')::uuid), 'trip shows sharing';
end $$;

-- Parent B sees none of it; the coordinator sees it until handover.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.trip_points where trip_id = current_setting('test.trip')::uuid) = 0, 'not another parent''s';
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$
declare
  r jsonb;
  wrong text := lpad(((current_setting('test.code')::int + 1) % 10000)::text, 4, '0');
begin
  assert (select count(*) from public.trip_points where trip_id = current_setting('test.trip')::uuid) = 3, 'staff see the trip before handover';
  r := public.gate_handover_code(current_setting('test.trip')::uuid, wrong);
  assert not (r ->> 'ok')::boolean and (r ->> 'tries_left')::int = 2, 'wrong code counted';
  r := public.gate_handover_code(current_setting('test.trip')::uuid, current_setting('test.code'));
  assert (r ->> 'ok')::boolean, 'right code hands over';
  assert (select status = 'handed_over' and handed_to_name = 'Ramesh Pawar' from public.trips where id = current_setting('test.trip')::uuid), 'recorded';
end $$;
reset role;

-- On the way home: the parent still sees new points; staff don't.
set app.now = '2026-09-25 12:30:00+05:30';
set request.jwt.claims to '';
set role anon;
do $$ begin
  assert public.link_share(current_setting('test.token'), repeat('a', 40),
    jsonb_build_array(jsonb_build_object('lat', 18.5080, 'lng', 73.8330, 'accuracy', 10, 'fix_at', '2026-09-25 12:29:50+05:30'))) = 1, 'way home tracked';
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.trip_points where trip_id = current_setting('test.trip')::uuid) = 3, 'staff stop seeing points at handover';
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.trip_points where trip_id = current_setting('test.trip')::uuid) = 4, 'the parent sees the way home';
end $$;
reset role;
set request.jwt.claims to '';
set role anon;
do $$ begin
  perform public.link_home(current_setting('test.token'), repeat('a', 40));
  perform public.link_open(current_setting('test.token'));
  raise exception 'FAIL: link alive after reaching home';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'link_expired%', sqlerrm;
end $$;
reset role;

-- Parent B: a new link replaces the old; three wrong codes lock it; cancelling kills the link.
-- trips.test.sql marks Meera absent on this day; she is back.
delete from public.attendance where child_id = '00000000-0000-0000-0000-0000000c0002' and day = '2026-09-25';
set app.now = '2026-09-25 16:00:00+05:30';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$
declare a jsonb; b jsonb;
begin
  a := public.invite_collector('00000000-0000-0000-0000-0000000c0002', 20, 'Lata Joshi', '+971501234567', 'Aunt');
  b := public.invite_collector('00000000-0000-0000-0000-0000000c0002', 20, 'Lata Joshi', '+971501234567', 'Aunt');
  perform set_config('test.old', a ->> 'token', false);
  perform set_config('test.token2', b ->> 'token', false);
  perform set_config('test.trip2', b ->> 'trip_id', false);
  perform set_config('test.code2', b ->> 'code', false);
end $$;
reset role;
set request.jwt.claims to '';
set role anon;
do $$ begin
  perform public.link_open(current_setting('test.old'));
  raise exception 'FAIL: replaced link still works';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'link_expired%', sqlerrm;
end $$;
do $$ begin assert public.link_open(current_setting('test.token2')) ->> 'collector' = 'Lata Joshi', 'new link works'; end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$
declare
  r jsonb;
  wrong text := lpad(((current_setting('test.code2')::int + 1) % 10000)::text, 4, '0');
begin
  perform public.gate_handover_code(current_setting('test.trip2')::uuid, wrong);
  perform public.gate_handover_code(current_setting('test.trip2')::uuid, wrong);
  r := public.gate_handover_code(current_setting('test.trip2')::uuid, wrong);
  assert (r ->> 'locked')::boolean, 'locked after three wrong codes';
  r := public.gate_handover_code(current_setting('test.trip2')::uuid, current_setting('test.code2'));
  assert not (r ->> 'ok')::boolean and (r ->> 'locked')::boolean, 'even the right code is refused once locked';
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$ begin perform public.cancel_trip(current_setting('test.trip2')::uuid); end $$;
reset role;
set request.jwt.claims to '';
set role anon;
do $$ begin
  perform public.link_open(current_setting('test.token2'));
  raise exception 'FAIL: link works after cancelling';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'link_expired%', sqlerrm;
end $$;
reset role;

-- A guardian shares their own location; nobody else can on their trip.
set app.now = '2026-09-25 10:00:00+05:30';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$
declare t public.trips;
begin
  t := public.start_trip('00000000-0000-0000-0000-0000000c0002', 'dropoff', 10);
  perform set_config('test.trip3', t.id::text, false);
end $$;
reset role;
update public.trips set created_at = app.clock() - interval '1 minute' where id = current_setting('test.trip3')::uuid;
set role authenticated;
do $$ begin
  assert public.share_location(current_setting('test.trip3')::uuid,
    jsonb_build_array(jsonb_build_object('lat', 18.5000, 'lng', 73.8200, 'accuracy', 8, 'fix_at', '2026-09-25 09:59:40+05:30'))) = 1, 'guardian point kept';
  perform public.stop_sharing(current_setting('test.trip3')::uuid);
  assert not (select sharing from public.trips where id = current_setting('test.trip3')::uuid), 'sharing stopped';
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
set role authenticated;
do $$ begin
  perform public.share_location(current_setting('test.trip3')::uuid,
    jsonb_build_array(jsonb_build_object('lat', 18.5, 'lng', 73.82, 'accuracy', 8, 'fix_at', '2026-09-25 09:59:50+05:30')));
  raise exception 'FAIL: someone else shared on the trip';
exception when insufficient_privilege then null;
end $$;
reset role;
