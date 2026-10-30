-- Admin people functions (0004): only the admin can use them, and each is all-or-nothing.

-- The admin adds a staff member with two roles, a parent, and a child linked to that parent.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$
declare
  staff uuid;
  parent uuid;
  child uuid;
begin
  staff := public.admin_add_person('  Asha Gate  ', 'Asha@Example.test', '+919000000021', '{core,coordinator}');
  assert (select full_name from public.profiles where id = staff) = 'Asha Gate', 'name trimmed';
  assert (select email from public.profiles where id = staff) = 'asha@example.test', 'email lower-cased';
  assert (select count(*) from public.staff_roles where profile_id = staff) = 2, 'both roles saved';

  parent := public.admin_add_person('Kiran Rao', null, '+919812345678');
  child := public.admin_add_child('Tara Rao', 'Tara', '2022-03-04', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000b002',
    jsonb_build_array(jsonb_build_object('guardian_id', parent, 'relation', 'Father')));
  assert (select count(*) from public.guardianships where child_id = child) = 1, 'guardian linked';
end $$;

-- All-or-nothing: a bad guardian leaves no half-saved child behind.
do $$ begin
  perform public.admin_add_child('Ghost Child', null, '2022-01-01', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000b002',
    '[{"guardian_id": "00000000-0000-0000-0000-00000000dead", "relation": "Mother"}]');
  raise exception 'FAIL: child saved with an unknown guardian';
exception when foreign_key_violation then null;
end $$;
do $$ begin
  assert not exists (select 1 from public.children where full_name = 'Ghost Child'), 'no half-saved child';
end $$;
do $$ begin
  perform public.admin_add_child('No Guardian', null, '2022-01-01', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000b002', '[]');
  raise exception 'FAIL: child saved without guardians';
exception when check_violation then null;
end $$;
do $$ begin
  perform public.admin_add_child('Future Child', null, current_date + 30, '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000b002',
    '[{"guardian_id": "00000000-0000-0000-0000-0000000000e1", "relation": "Mother"}]');
  raise exception 'FAIL: future date of birth accepted';
exception when check_violation then null;
end $$;
do $$ begin
  perform public.admin_add_person('No Mobile', 'nomobile@example.test', null);
  raise exception 'FAIL: person added without a mobile (0039)';
exception when raise_exception then
  if sqlerrm not like 'phone_required%' then raise; end if;
end $$;
do $$ begin
  perform public.admin_add_person('Dup', 'asha@example.test', '+919000000022');
  raise exception 'FAIL: duplicate email accepted';
exception when unique_violation then null;
end $$;
reset role;

-- The core team cannot add people or children through these functions either.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  perform public.admin_add_person('Sneaky', 'sneaky@example.test', '+919000000023', '{admin}');
  raise exception 'FAIL: core team added a person';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Nobody signed in cannot call them at all.
set role anon;
do $$ begin
  perform public.admin_add_person('Anon', 'anon@example.test', '+919000000024');
  raise exception 'FAIL: anon added a person';
exception when insufficient_privilege then null;
end $$;
reset role;
