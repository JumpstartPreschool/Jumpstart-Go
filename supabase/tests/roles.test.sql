-- Coordinator role and class assignments (0005). Uses the people and classes seeded by foundation.test.sql:
-- a1 admin, c1 core team, d1 Priya (coordinator of Sunflowers c001), e1 and e2 parents, f1 turned off.

-- The core team makes Parent B a coordinator of Tulips, and moves Priya from Sunflowers to Tulips.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  perform public.set_coordinator('00000000-0000-0000-0000-0000000000e2', '{00000000-0000-0000-0000-00000000c002}');
  assert exists (select 1 from public.staff_roles where profile_id = '00000000-0000-0000-0000-0000000000e2' and role = 'coordinator'), 'role given';
  assert (select array_agg(class_id) from public.coordinator_classes where profile_id = '00000000-0000-0000-0000-0000000000e2')
    = '{00000000-0000-0000-0000-00000000c002}', 'class assigned';

  perform public.set_coordinator('00000000-0000-0000-0000-0000000000d1', '{00000000-0000-0000-0000-00000000c002}');
  assert (select array_agg(class_id) from public.coordinator_classes where profile_id = '00000000-0000-0000-0000-0000000000d1')
    = '{00000000-0000-0000-0000-00000000c002}', 'classes replaced, not added to';

  -- Calling it again changes nothing.
  perform public.set_coordinator('00000000-0000-0000-0000-0000000000d1', '{00000000-0000-0000-0000-00000000c002}');
  assert (select count(*) from public.coordinator_classes where profile_id = '00000000-0000-0000-0000-0000000000d1') = 1, 'idempotent';
end $$;

-- ...but cannot give Admin or Core team, or take the admin's role away.
do $$ begin
  insert into public.staff_roles values ('00000000-0000-0000-0000-0000000000e1', 'admin');
  raise exception 'FAIL: core team gave the admin role';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.staff_roles values ('00000000-0000-0000-0000-0000000000c1', 'admin');
  raise exception 'FAIL: core team made itself admin';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.staff_roles values ('00000000-0000-0000-0000-0000000000e1', 'core');
  raise exception 'FAIL: core team gave the core role';
exception when insufficient_privilege then null;
end $$;
delete from public.staff_roles where role in ('admin', 'core');

-- Classes only for coordinators; someone whose access is off can't be made one.
do $$ begin
  insert into public.coordinator_classes values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c001');
  raise exception 'FAIL: class given to someone who is not a coordinator';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
do $$ begin
  perform public.set_coordinator('00000000-0000-0000-0000-0000000000f1', '{}');
  raise exception 'FAIL: turned-off person made a coordinator';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;

-- Removing the role removes that person's classes with it.
delete from public.staff_roles where profile_id = '00000000-0000-0000-0000-0000000000e2' and role = 'coordinator';
do $$ begin
  assert not exists (select 1 from public.coordinator_classes where profile_id = '00000000-0000-0000-0000-0000000000e2'), 'classes removed with the role';
end $$;
reset role;

do $$ begin
  assert (select count(*) from public.staff_roles where role = 'admin') = 2, 'admin roles untouched by the core team';
  assert exists (select 1 from public.staff_roles where profile_id = '00000000-0000-0000-0000-0000000000c1' and role = 'core'), 'core role untouched';
end $$;

-- Coordinators and parents cannot change roles or classes.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$ begin
  perform public.set_coordinator('00000000-0000-0000-0000-0000000000e1', '{00000000-0000-0000-0000-00000000c001}');
  raise exception 'FAIL: coordinator gave the coordinator role';
exception when insufficient_privilege then null;
end $$;
delete from public.coordinator_classes;
reset role;
do $$ begin
  assert exists (select 1 from public.coordinator_classes where profile_id = '00000000-0000-0000-0000-0000000000d1'), 'coordinator could not remove classes';
end $$;

set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
set role authenticated;
do $$ begin
  perform public.set_coordinator('00000000-0000-0000-0000-0000000000e1', '{}');
  raise exception 'FAIL: parent made themselves a coordinator';
exception when insufficient_privilege then null;
end $$;
reset role;

-- The admin can do all of it too.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$ begin
  perform public.set_coordinator('00000000-0000-0000-0000-0000000000e1', '{00000000-0000-0000-0000-00000000c001,00000000-0000-0000-0000-00000000c002}');
  assert (select count(*) from public.coordinator_classes where profile_id = '00000000-0000-0000-0000-0000000000e1') = 2, 'admin assigned two classes';
end $$;
reset role;

set role anon;
do $$ begin
  perform public.set_coordinator('00000000-0000-0000-0000-0000000000e1', '{}');
  raise exception 'FAIL: anon called set_coordinator';
exception when insufficient_privilege then null;
end $$;
reset role;
