-- 0036: the person collecting says "I've arrived" from the link page. 
-- Rolled back, so later tests see nothing changed.
begin;
-- Meera c0002, Parent B e2 (foundation and trips_tracking tests); a fresh link for Lata, confirmed on phone 'c'.
set app.now = '2026-09-25 17:00:00+05:30';
delete from public.trips where child_id = '00000000-0000-0000-0000-0000000c0002';
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
set request.jwt.claims to '';
set role anon;
select public.link_confirm(current_setting('test.ltoken'), repeat('c', 40), '4567') is not null as confirmed;
do $$
declare s jsonb;
declare first text;
begin
  s := public.link_arrive(current_setting('test.ltoken'), repeat('c', 40));
  first := s ->> 'arrived_at';
  assert first is not null, 'arrived';
  assert s ->> 'code' ~ '^[0-9]{4}$', 'the page still has its gate code';
  assert public.link_arrive(current_setting('test.ltoken'), repeat('c', 40)) ->> 'arrived_at' = first, 'a second tap keeps the first time';
  assert public.link_status(current_setting('test.ltoken'), repeat('c', 40)) ->> 'arrived_at' = first, 'the link page shows it';
end $$;
do $$ begin
  perform public.link_arrive(current_setting('test.ltoken'), repeat('d', 40));
  raise exception 'FAIL: another phone said the collector arrived';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'link_expired%', sqlerrm;
end $$;
reset role;
do $$ begin
  assert (select arrived_at is not null from public.trips where id = current_setting('test.ltrip')::uuid), 'the gate sees the arrival';
end $$;
rollback;
