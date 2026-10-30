-- 0009: the collector's Running late, and the newest point per trip. Runs after trips_tracking.test.sql:
-- Meera c0002 and Parent B e2, Parent A e1, coordinator d1, Friday 25 Sep 2026 (Meera's earlier pickup was cancelled).
set app.now = '2026-09-25 17:00:00+05:30';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.invite_collector('00000000-0000-0000-0000-0000000c0002', 20, 'Lata Joshi', '+971501234567', 'Aunt', 'Running late');
  perform set_config('test.ltoken', r ->> 'token', false);
  perform set_config('test.ltrip', r ->> 'trip_id', false);
end $$;
reset role;
update public.trips set created_at = app.clock() - interval '1 minute' where id = current_setting('test.ltrip')::uuid;

set request.jwt.claims to '';
set role anon;
do $$
declare s jsonb;
begin
  perform public.link_confirm(current_setting('test.ltoken'), repeat('c', 40), '4567');
  s := public.link_late(current_setting('test.ltoken'), repeat('c', 40), 30);
  assert (s ->> 'arrive_at')::timestamptz = '2026-09-25 17:50:00+05:30', format('20 + 30 minutes: %s', s ->> 'arrive_at');
  assert public.link_share(current_setting('test.ltoken'), repeat('c', 40), jsonb_build_array(
    jsonb_build_object('lat', 18.5200, 'lng', 73.8200, 'accuracy', 15, 'fix_at', '2026-09-25 16:59:40+05:30'),
    jsonb_build_object('lat', 18.5190, 'lng', 73.8210, 'accuracy', 15, 'fix_at', '2026-09-25 16:59:55+05:30'))) = 2, 'points kept';
end $$;
do $$ begin
  perform public.link_late(current_setting('test.ltoken'), repeat('c', 40), 45);
  raise exception 'FAIL: 45 minutes accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'bad_minutes%', sqlerrm;
end $$;
do $$ begin
  perform public.link_late(current_setting('test.ltoken'), repeat('d', 40), 10);
  raise exception 'FAIL: another phone moved the time';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'link_expired%', sqlerrm;
end $$;
do $$ begin
  perform public.latest_points(array[current_setting('test.ltrip')::uuid]);
  raise exception 'FAIL: anon read points';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 0026: past the gate's usual closing time is fine, flagged as late; past midnight is still refused.
set app.now = '2026-09-25 23:50:00+05:30';
set role anon;
do $$ begin
  perform public.link_late(current_setting('test.ltoken'), repeat('c', 40), 30);
  raise exception 'FAIL: arrival after midnight accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'outside_hours%', sqlerrm;
end $$;
reset role;

-- The newest point: the parent who sent the link sees it; the coordinator doesn't (0024, D38).
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$ begin
  assert (select lat from public.latest_points(array[current_setting('test.ltrip')::uuid])) = 18.5190, 'parent sees the newest point';
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.latest_points(array[current_setting('test.ltrip')::uuid])) = 0, 'the school never sees location';
end $$;
reset role;

-- Parent B moves the time of the pickup Lata is doing: Lata stays the one collecting, with the same link.
set app.now = '2026-09-25 17:10:00+05:30';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$ begin
  perform public.start_trip('00000000-0000-0000-0000-0000000c0002', 'pickup', 45, 'Running late');
  assert (select traveller_kind = 'third_person' and traveller_name = 'Lata Joshi' from public.trips where id = current_setting('test.ltrip')::uuid), 'still Lata';
end $$;
reset role;
set request.jwt.claims to '';
set role anon;
do $$ begin
  assert (public.link_status(current_setting('test.ltoken'), repeat('c', 40)) ->> 'arrive_at')::timestamptz = '2026-09-25 17:55:00+05:30', 'link shows the new time';
end $$;
reset role;
