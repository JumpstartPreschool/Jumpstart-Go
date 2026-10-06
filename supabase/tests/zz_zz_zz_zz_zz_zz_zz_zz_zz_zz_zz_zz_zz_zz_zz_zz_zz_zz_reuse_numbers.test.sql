-- 0049: a removed person's mobile can be given again; a parent can also be staff; a parent re-linked by mobile gets app
-- access back. Then the demo sign-ins are added and removed for good. Admin a1 from foundation.test.sql.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$
declare
  prog uuid := (select id from public.programmes where active order by name limit 1);
  old_staff uuid;
  new_staff uuid;
  mum uuid;
  kid uuid;
begin
  -- A staff member is turned off; someone new gets their mobile, which moves to them.
  old_staff := public.admin_add_person('Rohan Joshi', null, '9812300001', '{pro}');
  update public.profiles set active = false where id = old_staff;
  new_staff := public.admin_add_person('Sanjay Patil', null, '98123 00001', '{pro}');
  assert (select phone from public.profiles where id = new_staff) = '+919812300001', 'the new person has the number';
  assert (select phone is null and not app_access from public.profiles where id = old_staff), 'the old person no longer has it';

  -- A parent is also staff: one person, both roles.
  kid := public.admin_save_child(format('{"full_name":"Tara Kulkarni","date_of_birth":"2022-03-03","programme_id":"%s"}', prog)::jsonb,
    '[{"full_name":"Sneha Kulkarni","phone":"+919812300002","app_access":true,"relation":"Mother","kind":"parent"}]');
  mum := (select id from public.profiles where phone = '+919812300002');
  insert into public.staff_roles (profile_id, role) values (mum, 'coordinator');
  assert (select count(*) from public.staff_roles where profile_id = mum) = 1, 'the parent is a coordinator too';

  -- Her child leaves: app access off, number kept. Re-added for a new child by her mobile: linked, access back on.
  perform public.admin_child_left(kid);
  delete from public.staff_roles where profile_id = mum;
  perform public.admin_child_left(public.admin_save_child(format('{"full_name":"Kiran Kulkarni","date_of_birth":"2023-01-05","programme_id":"%s"}', prog)::jsonb,
    format('[{"id":"%s","relation":"Mother","kind":"parent"}]', mum)::jsonb));
  assert not (select app_access from public.profiles where id = mum), 'access off once no child is here';
  kid := public.admin_save_child(format('{"full_name":"Ishaan Kulkarni","date_of_birth":"2023-06-01","programme_id":"%s"}', prog)::jsonb,
    format('[{"id":"%s","relation":"Mother","kind":"parent","app_access":true}]', mum)::jsonb);
  assert (select app_access from public.profiles where id = mum), 're-linked by mobile: access back on';
  assert (select count(*) from public.profiles where phone = '+919812300002') = 1, 'still one person';

  -- Editing someone onto a removed person's number works too.
  update public.profiles set active = false where id = new_staff;
  perform public.admin_update_person(old_staff, null, '{"full_name":"Rohan Joshi","phone":"+919812300001","app_access":true}');
  update public.profiles set active = true where id = old_staff;
  assert (select phone from public.profiles where id = old_staff) = '+919812300001', 'number moved back on edit';
  assert (select phone is null from public.profiles where id = new_staff), 'and left the turned-off person';
end $$;
reset role;

-- Demo sign-ins: refused while anyone real has a demo number (the fixtures use +91 90000 000xx).
do $$ begin
  assert exists (select 1 from public.profiles where phone = '+919000000001'), 'fixture admin on a demo number';
end $$;
\set ON_ERROR_STOP off
\ir ../../scripts/demo/add-demo-logins.sql
\set ON_ERROR_STOP on
rollback;
do $$ begin
  assert (select count(*) from public.children where full_name like '% Demo') = 0, 'nothing added beside a staff number';
end $$;
update public.profiles set phone = '+9198111111' || right(phone, 2) where phone ~ '^\+9190000000(0[1-9]|10)$';
\ir ../../scripts/demo/add-demo-logins.sql
\ir ../../scripts/demo/add-demo-logins.sql
do $$ begin
  assert (select count(*) from public.profiles where phone ~ '^\+9190000000(0[1-9]|10)$' and active and app_access) = 10, 'ten demo parents';
  assert (select count(*) from public.children where full_name like '% Demo' and active) = 10, 'ten demo children, once';
  assert (select count(*) from public.guardianships g join public.profiles p on p.id = g.guardian_id where p.phone ~ '^\+9190000000(0[1-9]|10)$') = 10, 'each with a parent';
  assert public.phone_login_allowed('+919000000007'), 'a demo number may sign in';
end $$;
\ir ../../scripts/demo/remove-demo-logins.sql
do $$ begin
  assert (select count(*) from public.profiles where phone ~ '^\+9190000000(0[1-9]|10)$') = 0, 'demo parents gone';
  assert (select count(*) from public.children where full_name like '% Demo') = 0, 'demo children gone';
  assert exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'the admin untouched';
end $$;
