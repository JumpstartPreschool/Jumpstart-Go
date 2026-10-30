-- 0011: classes are levels (D18), family and parents abroad (D26), two admins only (D27), the PRO team's desk (D25).
-- Uses the people from foundation.test.sql: a1 admin, c1 core, d1 coordinator, e1 and e2 parents; Aarav c0001 (Jr KG
-- half day, class c001 Jr KG) and Meera c0002 (Learning Center, c002). Monday 28 Sep 2026.
insert into public.profiles (id, full_name, email, phone) values ('00000000-0000-0000-0000-0000000000b1', 'Front Desk', 'desk@example.test', '+919000000008');
insert into auth.users (id, email, raw_app_meta_data) values ('00000000-0000-0000-0000-0000000000b1', 'desk@example.test', '{"provisioned":"school"}');
insert into public.staff_roles values ('00000000-0000-0000-0000-0000000000b1', 'pro');
set app.now = '2026-09-28 10:00:00+05:30';

-- Admin: the class follows the programme; family, abroad and international numbers; admins are locked.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$
declare
  gran uuid;
  kid uuid;
begin
  gran := public.admin_add_person('Asha Kulkarni', null, '+971501112233');
  kid := public.admin_add_child('Tara Kulkarni', null, '2022-02-02', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000b001',
    jsonb_build_array(jsonb_build_object('guardian_id', '00000000-0000-0000-0000-0000000000e1', 'relation', 'Mother'),
                      jsonb_build_object('guardian_id', gran, 'relation', 'Grandmother (mother''s side)', 'kind', 'family')));
  assert (select class_id = '00000000-0000-0000-0000-00000000c001' from public.children where id = kid), 'class comes from the programme, not the form';
  assert (select kind = 'family' from public.guardianships where child_id = kid and guardian_id = gran), 'family recorded';
  assert (select kind = 'parent' from public.guardianships where child_id = kid and guardian_id = '00000000-0000-0000-0000-0000000000e1'), 'parent by default';
  update public.profiles set abroad = true where id = '00000000-0000-0000-0000-0000000000e1';
  update public.children set class_id = '00000000-0000-0000-0000-00000000c002' where id = kid;
  assert (select class_id = '00000000-0000-0000-0000-00000000c001' from public.children where id = kid), 'class can''t be set apart from the programme';
end $$;
do $$ begin
  insert into public.classes (name, sort) values ('Sunflowers', 9);
  raise exception 'FAIL: a class group was added';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.staff_roles values ('00000000-0000-0000-0000-0000000000c1', 'admin');
  raise exception 'FAIL: the admin made someone else an admin';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  delete from public.staff_roles where profile_id = '00000000-0000-0000-0000-0000000000a1' and role = 'admin';
  raise exception 'FAIL: an admin role was removed in the app';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000a1';
  raise exception 'FAIL: an admin was switched off in the app';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  -- Giving the PRO role is the admin's to do.
  insert into public.staff_roles values ('00000000-0000-0000-0000-0000000000e2', 'pro');
  delete from public.staff_roles where profile_id = '00000000-0000-0000-0000-0000000000e2' and role = 'pro';
end $$;
reset role;

-- The front desk: sees the day, never locations; logs a call for a parent; can't book as themselves.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1"}';
set role authenticated;
do $$
declare t public.trips;
begin
  assert (select count(*) from public.children) >= 3, 'front desk sees the children';
  assert (select count(*) from public.guardianships where child_id = '00000000-0000-0000-0000-0000000c0002') = 1, 'and their families';
  assert (select count(*) from public.trip_points) = 0, 'but no locations';
  assert (select count(*) from public.staff_roles where profile_id <> '00000000-0000-0000-0000-0000000000b1') = 0, 'or anyone else''s roles';
  t := public.log_call_trip('00000000-0000-0000-0000-0000000c0002', 'pickup', 30, '00000000-0000-0000-0000-0000000000e2');
  assert t.created_by = '00000000-0000-0000-0000-0000000000e2' and t.traveller_name = 'Parent B' and t.traveller_relation = 'Father', 'booked for the father';
  assert t.phoned_in_by = '00000000-0000-0000-0000-0000000000b1', 'marked phoned in, by the desk';
end $$;
do $$ begin
  perform public.log_call_trip('00000000-0000-0000-0000-0000000c0002', 'dropoff', 10, '00000000-0000-0000-0000-0000000000e1');
  raise exception 'FAIL: booked for someone who isn''t family';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'guardian_required%', sqlerrm;
end $$;
do $$ begin
  perform public.start_trip('00000000-0000-0000-0000-0000000c0002', 'dropoff', 10);
  raise exception 'FAIL: the desk booked as themselves';
exception when insufficient_privilege then null;
end $$;
reset role;

-- The father taps "I'm on my way" himself: it's his now, no longer marked phoned in.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$
declare t public.trips;
begin
  t := public.start_trip('00000000-0000-0000-0000-0000000c0002', 'pickup', 20);
  assert t.phoned_in_by is null and t.created_by = '00000000-0000-0000-0000-0000000000e2', 'his own tap';
end $$;
reset role;

-- Nobody signed out can log a call.
set request.jwt.claims to '';
set role anon;
do $$ begin
  perform public.log_call_trip('00000000-0000-0000-0000-0000000c0002', 'pickup', 20, '00000000-0000-0000-0000-0000000000e2');
  raise exception 'FAIL: logged a call without signing in';
exception when insufficient_privilege then null;
end $$;
reset role;
