-- 0055 (D58): a parent can send someone else to drop a child off, not only to collect. Meera (c0002) with her father,
-- Parent B (e2); Gauri (ee09) is a center coordinator. Monday 2 Nov 2026.
insert into public.profiles (id, full_name, active, phone) values ('00000000-0000-0000-0000-00000000ee09', 'Gauri Gate', true, '+919811600001');
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-00000000ee09', '919811600001');
update public.profiles set user_id = id where id = '00000000-0000-0000-0000-00000000ee09';
insert into public.staff_roles values ('00000000-0000-0000-0000-00000000ee09', 'coordinator');
set app.now = '2026-11-02 09:00:00+05:30';

-- 1. The father sends a driver to drop Meera off: a drop-off trip, from someone with a link.
set role authenticated;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
do $$
declare r jsonb; t public.trips;
begin
  r := public.invite_collector('00000000-0000-0000-0000-0000000c0002', 15, 'Suresh Jadhav', '+919812300099', 'Driver', null, 'dropoff');
  select * into t from public.trips where id = (r ->> 'trip_id')::uuid;
  assert t.direction = 'dropoff' and t.traveller_kind = 'third_person' and t.traveller_name = 'Suresh Jadhav', 'a drop-off by someone else';
  perform set_config('test.drop_token', r ->> 'token', false);
  perform set_config('test.drop_trip', r ->> 'trip_id', false);
end $$;
-- Without saying which, it's a pickup, as before.
do $$
declare r jsonb;
begin
  r := public.invite_collector('00000000-0000-0000-0000-0000000c0002', 400, 'Too Late', '+919812300098', 'Driver');
  raise exception 'FAIL: a trip three hours away was accepted';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;

-- 2. At the gate: no code for a drop-off. The code check refuses it; checking in works as for anyone.
select pg_catalog.set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee09"}', false);
do $$ begin
  perform public.gate_handover_code(current_setting('test.drop_trip')::uuid, '0000');
  raise exception 'FAIL: the code check took a drop-off';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like '%isn''t waiting for a code%', sqlerrm;
end $$;
do $$
declare t public.trips;
begin
  t := public.gate_step(current_setting('test.drop_trip')::uuid, 'close');
  assert t.status = 'checked_in', 'checked in without a code';
end $$;
reset role;

-- 3. The link still opens for a few minutes after the check-in, so the driver sees it; then it ends.
do $$ begin
  assert (select (public.link_open(current_setting('test.drop_token')) ->> 'status') = 'checked_in'), 'the driver sees the check-in';
end $$;
set app.now = '2026-11-02 09:40:00+05:30';
do $$ begin
  perform public.link_open(current_setting('test.drop_token'));
  raise exception 'FAIL: the link stayed open after the drop-off';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'link_expired%', sqlerrm;
end $$;

-- 4. A pickup by someone else still needs the code.
set role authenticated;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
do $$
declare r jsonb;
begin
  r := public.invite_collector('00000000-0000-0000-0000-0000000c0002', 30, 'Suresh Jadhav', '+919812300099', 'Driver', null, 'pickup');
  perform set_config('test.pick_trip', r ->> 'trip_id', false);
end $$;
select pg_catalog.set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ee09"}', false);
do $$ begin
  perform public.gate_step(current_setting('test.pick_trip')::uuid, 'close', null);
  raise exception 'FAIL: a pickup by someone else was handed over without the code';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'code_required%', sqlerrm;
end $$;
reset role;
