-- Several programmes per child (0053, D56). Kabir is in Jr KG · Half day (b001, Mon–Fri, the main programme, so his
-- class), and the admin adds the Learning Center (b002, Mon–Sat except the 2nd and last Saturday). 3 Oct 2026 is the
-- first Saturday of the month: no Jr KG, but the Learning Center is open.
insert into public.profiles (id, full_name, active, phone) values
  ('00000000-0000-0000-0000-00000000ee01', 'Kavya Parent', true, '+919811400001'),
  ('00000000-0000-0000-0000-00000000ee02', 'Other Parent', true, '+919811400002');
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-00000000ee01', '919811400001'), ('00000000-0000-0000-0000-00000000ee02', '919811400002');
update public.profiles set user_id = id where id in ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-00000000ee02');
insert into public.children (id, full_name, date_of_birth, class_id, programme_id) values
  ('00000000-0000-0000-0000-0000000c00ee', 'Kabir Deshpande', '2021-07-01', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001');
insert into public.guardianships values ('00000000-0000-0000-0000-0000000c00ee', '00000000-0000-0000-0000-00000000ee01', 'Mother');
insert into public.programmes (id, name, class_id, weekdays, starts, ends, dropoff_from, dropoff_to, pickup_from, pickup_to) values
  ('00000000-0000-0000-0000-00000000b0ee', 'Sr KG · Test plan', '00000000-0000-0000-0000-00000000c001', '{1,2,3,4,5}', '09:00', '13:00', '08:45', '09:00', '13:00', '13:15');

create function pg_temp.as_who(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p)::text, false)
$$;
set app.now = '2026-10-03 10:00:00+05:30';

-- 1. Only the admin sets programmes.
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-0000000000c1');
do $$ begin
  perform public.admin_set_programmes('00000000-0000-0000-0000-0000000c00ee', '00000000-0000-0000-0000-00000000b001', array['00000000-0000-0000-0000-00000000b002']::uuid[]);
  raise exception 'FAIL: the core team set programmes';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.child_programmes values ('00000000-0000-0000-0000-0000000c00ee', '00000000-0000-0000-0000-00000000b002');
  raise exception 'FAIL: wrote child_programmes directly';
exception when insufficient_privilege then null;
end $$;

-- 2. The admin adds the Learning Center; the main programme, and so the class, stay as they were.
select pg_temp.as_who('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform public.admin_set_programmes('00000000-0000-0000-0000-0000000c00ee', '00000000-0000-0000-0000-00000000b001',
    array['00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000b001']::uuid[]);
  assert (select count(*) from public.child_programmes where child_id = '00000000-0000-0000-0000-0000000c00ee') = 1, 'one extra; the main and a repeat are skipped';
  assert (select programme_id = '00000000-0000-0000-0000-00000000b001' and class_id = '00000000-0000-0000-0000-00000000c001'
          from public.children where id = '00000000-0000-0000-0000-0000000c00ee'), 'main programme and class unchanged';
end $$;

-- 3. One class programme per child: a second one can't be an extra.
do $$ begin
  perform public.admin_set_programmes('00000000-0000-0000-0000-0000000c00ee', '00000000-0000-0000-0000-00000000b001', array['00000000-0000-0000-0000-00000000b0ee']::uuid[]);
  raise exception 'FAIL: two class programmes';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'one_class%', sqlerrm;
end $$;
reset role;

-- 4. The family sees the child's programmes; another family doesn't.
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-00000000ee01');
do $$ begin
  assert (select count(*) from public.child_programmes) = 1, 'the parent sees the extra';
end $$;
select pg_temp.as_who('00000000-0000-0000-0000-00000000ee02');
do $$ begin
  assert (select count(*) from public.child_programmes) = 0, 'another parent sees nothing';
end $$;

-- 5. School days are any programme's days: a Learning Center Saturday counts, and absence can be reported for it.
select pg_temp.as_who('00000000-0000-0000-0000-00000000ee01');
do $$ begin
  assert public.report_absence_range('00000000-0000-0000-0000-0000000c00ee', '2026-10-03', '2026-10-03', 'Family event') = 1, 'Saturday is a school day';
end $$;
reset role;
delete from public.attendance where child_id = '00000000-0000-0000-0000-0000000c00ee';

-- 6. Regular times cover every programme's days (Monday to Saturday), at any time in the gate's day.
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-0000000000c1');
do $$ begin
  perform public.set_regular_times('00000000-0000-0000-0000-0000000c00ee', '09:00', '18:30');
  assert (select array_agg(weekday order by weekday) from public.child_schedules where child_id = '00000000-0000-0000-0000-0000000c00ee') = '{1,2,3,4,5,6}', 'Monday to Saturday';
end $$;

-- 7. The parent says they're coming at any time; nothing is flagged or asks why.
select pg_temp.as_who('00000000-0000-0000-0000-00000000ee01');
do $$
declare t public.trips;
begin
  t := public.start_trip('00000000-0000-0000-0000-0000000c00ee', 'dropoff', 120);
  assert not t.off_schedule and t.reason is null, 'drop-off at noon, no window, no reason';
  perform public.cancel_trip(t.id);
end $$;

-- 8. Making the extra the main programme moves it out of the extras; dropping the extras empties them.
select pg_temp.as_who('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform public.admin_set_programmes('00000000-0000-0000-0000-0000000c00ee', '00000000-0000-0000-0000-00000000b002', array['00000000-0000-0000-0000-00000000b002']::uuid[]);
  assert (select class_id = '00000000-0000-0000-0000-00000000c002' from public.children where id = '00000000-0000-0000-0000-0000000c00ee'), 'the class follows the main programme';
  assert (select count(*) from public.child_programmes where child_id = '00000000-0000-0000-0000-0000000c00ee') = 0, 'no extra left';
  perform public.admin_set_programmes('00000000-0000-0000-0000-0000000c00ee', '00000000-0000-0000-0000-00000000b001', '{}');
  assert (select count(*) from public.child_programmes where child_id = '00000000-0000-0000-0000-0000000c00ee') = 0, 'still none';
end $$;
reset role;
