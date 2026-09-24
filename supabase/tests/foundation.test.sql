-- Row-level security and constraint tests for 0001_foundation.sql.
-- Each block signs in as one user (JWT claims + the authenticated role) and asserts what they can and cannot do.

-- Seed (as the database owner) -------------------------------------------------
-- 0003 loads the 17 Karve Road programmes and 0007 gives them the owner's windows (D24); check, then start clean.
do $$ begin
  assert (select count(*) from public.programmes) = 17, 'Karve Road programmes loaded';
  assert (select count(*) from public.programmes where flexible) = 0, 'every programme has explicit windows (D24)';
  assert (select dropoff_from = '08:45' and dropoff_to = '09:00' and pickup_from = '13:00' and pickup_to = '13:15'
          from public.programmes where name = 'Jr KG · Half day'), 'Jr KG half day: the 15 minutes before and after';
  assert (select starts = '11:45' and ends = '17:30' and dropoff_from = '09:00' and dropoff_to = '11:45' and pickup_from = '17:30' and pickup_to = '19:00'
          from public.programmes where name = 'Nursery · 360°+'), '360°+: in school 11:45–17:30, drop-off from 9, pickup until 7';
  assert (select dropoff_from = '08:45' and dropoff_to = '09:00' and pickup_to = '19:00' from public.programmes where name = 'Learning Center'),
    'Learning Center: in at 8:45–9:00, collected any time until 7';
  assert (select pickup_from = '19:00' and pickup_to = '19:15' from public.programmes where name = 'After School Program'), 'After School pickup 7:00–7:15';
  -- D18: the classes are the levels, and every programme belongs to one (0011).
  assert (select string_agg(name, ',' order by sort) from public.classes) = 'Playgroup,Nursery,Jr KG,Sr KG,Learning Center,Preschool Readiness,After School', 'classes are the levels';
  assert (select c.name from public.programmes p join public.classes c on c.id = p.class_id where p.name = 'Nursery · 360°+') = 'Nursery', 'programme → level';
  assert (select c.name from public.programmes p join public.classes c on c.id = p.class_id where p.name = 'After School Program') = 'After School', 'standalone programme is its own class';
end $$;
delete from public.programmes;
-- The tests below use two levels under fixed ids: Jr KG (c001) and Learning Center (c002).
update public.classes set id = '00000000-0000-0000-0000-00000000c001' where name = 'Jr KG';
update public.classes set id = '00000000-0000-0000-0000-00000000c002' where name = 'Learning Center';
-- People are invited first (profiles), then sign in (auth.users); the trigger links them by email.
-- Test profiles reuse their auth ids, so the JWT subject below is also the profile id.
insert into public.profiles (id, full_name, email, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', 'admin@example.test', true),
  ('00000000-0000-0000-0000-0000000000c1', 'Core Team', 'core@example.test', true),
  ('00000000-0000-0000-0000-0000000000d1', 'Priya', 'priya@example.test', true),
  ('00000000-0000-0000-0000-0000000000e1', 'Parent A', 'parent.a@example.test', true),
  ('00000000-0000-0000-0000-0000000000e2', 'Parent B', 'parent.b@example.test', true),
  ('00000000-0000-0000-0000-0000000000f1', 'Former Admin', 'former.admin@example.test', true);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'core@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'priya@example.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'parent.a@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'Parent.B@Example.test'),
  ('00000000-0000-0000-0000-0000000000f1', 'former.admin@example.test');
insert into auth.sessions (user_id) values ('00000000-0000-0000-0000-0000000000f1');
insert into public.staff_roles values
  ('00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('00000000-0000-0000-0000-0000000000c1', 'core'),
  ('00000000-0000-0000-0000-0000000000d1', 'coordinator'),
  ('00000000-0000-0000-0000-0000000000f1', 'admin');
insert into public.programmes (id, name, class_id, weekdays, term_start, term_end, starts, ends, dropoff_from, dropoff_to, pickup_from, pickup_to) values
  ('00000000-0000-0000-0000-00000000b001', 'Jr KG · Half day', '00000000-0000-0000-0000-00000000c001', '{1,2,3,4,5}', '2026-06-01', '2027-03-31',
   '09:00', '13:00', '09:00', '09:30', '12:30', '13:00');
insert into public.programmes (id, name, class_id, weekdays, saturday_rule, starts, ends, flexible) values
  ('00000000-0000-0000-0000-00000000b002', 'Learning Center', '00000000-0000-0000-0000-00000000c002', '{1,2,3,4,5,6}', 'except_2nd_and_last', '09:00', '19:00', true);
insert into public.children (id, full_name, date_of_birth, class_id, programme_id) values
  ('00000000-0000-0000-0000-0000000c0001', 'Aarav Kulkarni', '2021-08-10', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001'),
  ('00000000-0000-0000-0000-0000000c0002', 'Meera Joshi', '2024-02-02', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000b002');
insert into public.guardianships values
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000000e1', 'Mother'),
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000000e2', 'Father');
insert into public.coordinator_classes values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000c001');
update public.profiles set active = false where email = 'former.admin@example.test';
do $$ begin
  assert (select count(*) from auth.sessions) = 0, 'deactivation ended the saved sessions';
  assert (select count(*) from public.profiles where user_id is not null) = 6, 'every invited person was linked on first sign-in (email case ignored)';
end $$;

-- Anonymous visitors: no access at all ------------------------------------------
set role anon;
do $$ begin
  perform 1 from public.children;
  raise exception 'FAIL: anon read children';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Parent A ---------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
set role authenticated;
do $$ declare n int; begin
  assert (select array_agg(full_name) from public.children) = '{"Aarav Kulkarni"}', 'parent sees only their own child';
  assert (select count(*) from public.profiles) = 1, 'parent sees only their own profile';
  assert (select count(*) from public.guardianships) = 1, 'parent sees only their own guardianship';
  assert (select count(*) from public.audit_log) = 0, 'parent cannot read the audit log';
  assert (select count(*) from public.programmes) = 2, 'parent can read programmes';

  update public.children set preferred_name = 'X';
  get diagnostics n = row_count;
  assert n = 0, 'parent cannot edit a child';

  update public.attendance set status = 'present';
  get diagnostics n = row_count;
  assert n = 0, 'parent cannot set attendance directly';
end $$;
do $$ begin
  insert into public.children (full_name, date_of_birth, class_id, programme_id)
  values ('Intruder', '2022-01-01', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001');
  raise exception 'FAIL: parent added a child';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.guardianships values ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000000e1', 'Mother');
  raise exception 'FAIL: parent linked themselves to another child';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Coordinator --------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.children) = 2, 'coordinator sees every child';
  assert (select count(*) from public.coordinator_classes) = 1, 'coordinator sees class assignments';
end $$;
do $$ begin
  insert into public.child_schedules values ('00000000-0000-0000-0000-0000000c0001', 1, '09:15', '12:45');
  raise exception 'FAIL: coordinator set a regular schedule';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.programmes set pickup_to = '13:00';
  if found then raise exception 'FAIL: coordinator changed a programme'; end if;
end $$;
reset role;

-- Core team ----------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
insert into public.child_schedules values
  ('00000000-0000-0000-0000-0000000c0001', 1, '09:15', '12:45'),
  ('00000000-0000-0000-0000-0000000c0002', 6, '10:00', '17:30');
do $$ begin
  insert into public.child_schedules values ('00000000-0000-0000-0000-0000000c0001', 2, '09:15', '13:15');
  raise exception 'FAIL: pickup outside the window was accepted';
exception when check_violation then null;
end $$;
do $$ begin
  insert into public.child_schedules values ('00000000-0000-0000-0000-0000000c0001', 6, '09:15', '12:45');
  raise exception 'FAIL: Saturday accepted for a Mon–Fri programme';
exception when check_violation then null;
end $$;
do $$ begin
  update public.programmes set starts = '08:30' where name = 'Learning Center';
  raise exception 'FAIL: programme before 9 AM accepted';
exception when check_violation then null;
end $$;
-- Windows may sit just outside the class (D24), but never outside the gate day 08:45–19:15.
do $$ begin
  update public.programmes set pickup_to = '19:30' where name = 'Jr KG · Half day';
  raise exception 'FAIL: pickup after the gate closes accepted';
exception when check_violation then null;
end $$;
do $$ begin
  update public.programmes set dropoff_from = '08:30' where name = 'Jr KG · Half day';
  raise exception 'FAIL: drop-off before the gate opens accepted';
exception when check_violation then null;
end $$;
-- The core team moves the pickup window; Aarav's 12:45 no longer fits and is listed (SCH-9).
update public.programmes set pickup_from = '12:50', pickup_to = '13:00' where name = 'Jr KG · Half day';
do $$ begin
  assert (select count(*) from public.schedules_outside_windows) = 1, 'schedule outside the new window is listed';
end $$;
insert into public.holidays values ('2026-10-20', 'Dussehra');
do $$ begin
  insert into public.children (full_name, date_of_birth, class_id, programme_id)
  values ('New Child', '2022-01-01', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001');
  raise exception 'FAIL: core team added a child';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.staff_roles values ('00000000-0000-0000-0000-0000000000c1', 'admin');
  raise exception 'FAIL: core team made themselves admin';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Admin --------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
insert into public.children (full_name, date_of_birth, class_id, programme_id)
values ('Kabir Shah', '2022-05-05', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000b002');
insert into public.staff_roles values ('00000000-0000-0000-0000-0000000000c1', 'coordinator');
update public.children set active = false where full_name = 'Kabir Shah';
do $$ begin
  assert (select count(*) from public.audit_log where actor = '00000000-0000-0000-0000-0000000000a1' and table_name = 'children') = 2,
    'admin changes are in the audit log';
  assert (select count(*) from public.audit_log where actor = '00000000-0000-0000-0000-0000000000c1' and table_name = 'programmes') = 1,
    'core team programme change is in the audit log';
end $$;
do $$ declare n int; begin
  delete from public.children;
  raise exception 'FAIL: children can be hard-deleted';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Deactivated admin (AUTH-3) --------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.children) = 0, 'deactivated admin sees nothing';
  assert (select count(*) from public.audit_log) = 0, 'deactivated admin cannot read the audit log';
end $$;
do $$ begin
  insert into public.classes (name) values ('Ghost class');
  raise exception 'FAIL: deactivated admin wrote data';
exception when insufficient_privilege then null;
end $$;
reset role;
