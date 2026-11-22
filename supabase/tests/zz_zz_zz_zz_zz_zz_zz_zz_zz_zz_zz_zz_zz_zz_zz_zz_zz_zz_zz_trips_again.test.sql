-- 0050: any number of drop-offs and pickups a day, never twice in a row; attendance follows; demo sign-in codes.
-- Its own people and child:  M  Meera, Center Coordinator of Jr KG     N  Nisha, parent of Advik (Jr KG)
insert into public.profiles (id, full_name, active, phone) values
  ('00000000-0000-0000-0000-00000000bb01', 'Meera Gate', true, '+919811100001'),
  ('00000000-0000-0000-0000-00000000bb02', 'Nisha Parent', true, '+919811100002');
insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000bb01', '919811100001'), ('00000000-0000-0000-0000-00000000bb02', '919811100002');
update public.profiles set user_id = id where id in ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000bb02');
insert into public.staff_roles values ('00000000-0000-0000-0000-00000000bb01', 'coordinator');
insert into public.coordinator_classes values ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000c001');
insert into public.children (id, full_name, date_of_birth, class_id, programme_id) values
  ('00000000-0000-0000-0000-0000000c00bb', 'Advik Rao', '2021-07-01', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001');
insert into public.guardianships values ('00000000-0000-0000-0000-0000000c00bb', '00000000-0000-0000-0000-00000000bb02', 'Mother');

create function pg_temp.as_who(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p)::text, false)
$$;
create function pg_temp.trip(dir public.trip_direction) returns uuid language plpgsql as $$
begin
  perform pg_temp.as_who('00000000-0000-0000-0000-00000000bb02');
  return (public.start_trip('00000000-0000-0000-0000-0000000c00bb', dir, 0, 'Testing')).id;
end $$;
create function pg_temp.gate(t uuid) returns void language plpgsql as $$
begin
  perform pg_temp.as_who('00000000-0000-0000-0000-00000000bb01');
  perform public.gate_step(t, 'close', case when (select direction from public.trips where id = t) = 'pickup' then '00000000-0000-0000-0000-00000000bb02'::uuid end);
end $$;

create function pg_temp.refused(dir public.trip_direction, expect text) returns void language plpgsql as $$
begin
  perform pg_temp.trip(dir);
  raise exception 'FAIL: % allowed twice in a row', dir;
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like expect, sqlerrm;
end $$;
-- Drop-off, pickup, back again, pickup again (each its own request, as in the app): allowed whenever it can happen next.
set role authenticated;
select pg_temp.gate(pg_temp.trip('dropoff'));
select pg_temp.refused('dropoff', 'already_done: This child is already at school.%');
select pg_temp.gate(pg_temp.trip('pickup'));
select pg_temp.refused('pickup', 'already_done: This child has already been collected.%');
reset role;
do $$ begin
  assert (select checked_out_at is not null from public.attendance where child_id = '00000000-0000-0000-0000-0000000c00bb' and day = app.today()), 'gone home';
end $$;
set role authenticated;
select pg_temp.gate(pg_temp.trip('dropoff'));
reset role;
do $$ begin
  assert (select checked_out_at is null and checked_in_at is not null from public.attendance where child_id = '00000000-0000-0000-0000-0000000c00bb' and day = app.today()), 'back at school';
end $$;
set role authenticated;
select pg_temp.gate(pg_temp.trip('pickup'));
reset role;
do $$ begin
  assert (select count(*) from public.trips where child_id = '00000000-0000-0000-0000-0000000c00bb' and status in ('checked_in', 'handed_over')) = 4, 'two of each today';
  assert app.last_handover('00000000-0000-0000-0000-0000000c00bb', app.today()) = 'pickup', 'home again';
end $$;
-- Today's time can be changed after a handover too.
do $$
declare t time := date_trunc('minute', (app.clock() at time zone 'Asia/Kolkata')::time + interval '10 minutes');
begin
  -- A day's time must be in school hours, so this runs only while there is still one left today.
  if t between '09:00' and '19:00' then
    perform app.set_day_time('00000000-0000-0000-0000-0000000c00bb', 'dropoff', t, 'Testing', '00000000-0000-0000-0000-00000000bb02');
  end if;
end $$;

-- Walk-in at the gate follows the same rule.
set role authenticated;
do $$ begin
  perform pg_temp.as_who('00000000-0000-0000-0000-00000000bb01');
  perform public.gate_walk_in('00000000-0000-0000-0000-0000000c00bb', 'dropoff');
  begin
    perform public.gate_walk_in('00000000-0000-0000-0000-0000000c00bb', 'dropoff');
    raise exception 'FAIL: walked in twice';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'already_done%', sqlerrm;
  end;
end $$;
reset role;

-- Demo codes: kept only for a "… Demo" parent on a demo number, read back for 10 minutes, never for anyone else.
update public.profiles set phone = '+9198111000' || right(phone, 2) where phone in ('+919000000008', '+919000000009');
insert into public.profiles (full_name, phone) values ('Priya Demo', '+919000000009');
insert into public.profiles (full_name, phone) values ('Real Person', '+919000000008');
do $$ begin
  assert public.demo_code_keep('919000000009', '482913'), 'demo number kept';
  assert not public.demo_code_keep('919000000008', '111111'), 'someone real on a demo number: sent as usual';
  assert not public.demo_code_keep('919811100002', '222222'), 'a normal number: sent as usual';
end $$;
set role anon;
do $$ begin
  assert public.demo_code('+919000000009') = '482913', 'the sign-in screen reads it';
  assert public.demo_code('+919000000008') is null, 'nothing for someone real';
  assert public.demo_code('+919811100002') is null, 'nothing for a normal number';
end $$;
reset role;
update app.demo_codes set made_at = now() - interval '11 minutes';
set role anon;
do $$ begin assert public.demo_code('+919000000009') is null, 'expired after 10 minutes'; end $$;
do $$ begin
  perform public.demo_code_keep('919000000009', '000000');
  raise exception 'FAIL: anyone could store a code';
exception when insufficient_privilege then null;
end $$;
reset role;
