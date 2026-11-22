-- 0012: child-first records, app access apart from the record. Uses the people from foundation.test.sql (a1 admin,
-- d1 coordinator, Aarav c0001 with Parent A e1, programmes b001 Jr KG and b002 Learning Center).
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$
declare
  kid uuid;
  mum uuid;
  aunt uuid;
begin
  -- Nobody who lives in India: refused, and nothing is saved.
  begin
    perform public.admin_save_child('{"full_name":"Zoya Rao","date_of_birth":"2022-03-03","programme_id":"00000000-0000-0000-0000-00000000b001"}',
      '[{"full_name":"Nisha Rao","email":"nisha@example.test","relation":"Mother","kind":"parent","abroad":true}]');
    raise exception 'FAIL: saved with only a parent abroad';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'collector_required%', sqlerrm;
  end;
  assert not exists (select 1 from public.profiles where email = 'nisha@example.test'), 'nothing saved when refused';

  -- The mother abroad with the app, and an aunt here without it: saved together.
  kid := public.admin_save_child('{"full_name":"Zoya Rao","preferred_name":"Zo","date_of_birth":"2022-03-03","programme_id":"00000000-0000-0000-0000-00000000b002"}',
    '[{"full_name":"Nisha Rao","email":"Nisha@Example.test","phone":"+14155550123","relation":"Mother","kind":"parent","abroad":true},
      {"full_name":"Kavita Rao","phone":"+919812300000","relation":"Aunt, father''s side","kind":"family","app_access":false},
      {"id":"00000000-0000-0000-0000-0000000000e1","relation":"Family friend","kind":"family"}]');
  select id into mum from public.profiles where email = 'nisha@example.test';
  select id into aunt from public.profiles where full_name = 'Kavita Rao';
  assert (select class_id = '00000000-0000-0000-0000-00000000c002' from public.children where id = kid), 'Learning Center';
  assert (select abroad and app_access from public.profiles where id = mum), 'mother abroad, with the app';
  assert (select not app_access from public.profiles where id = aunt), 'aunt kept as a contact';
  assert (select count(*) from public.guardianships where child_id = kid) = 3, 'three on the record, one linked';

  -- App access for someone new needs a mobile (person_for_record, 0039:161).
  begin
    perform public.admin_add_guardian(kid, '{"full_name":"Ravi Rao","relation":"Uncle","kind":"family"}');
    raise exception 'FAIL: app access without a mobile';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'phone_required%', sqlerrm;
  end;

  -- Removing people: fine until the last one.
  delete from public.guardianships where child_id = kid and guardian_id = '00000000-0000-0000-0000-0000000000e1';
  delete from public.guardianships where child_id = kid and guardian_id = aunt;
  begin
    delete from public.guardianships where child_id = kid and guardian_id = mum;
    raise exception 'FAIL: removed the last person';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'last_guardian%', sqlerrm;
  end;

  -- Access off: still on the record (the gate can hand over), but can't sign in.
  update public.profiles set app_access = false where id = mum;
  assert not public.phone_login_allowed('+14155550123'), 'no sign-in without app access';
  assert (select active from public.profiles where id = mum), 'still on the record';
  update public.profiles set app_access = true where id = mum;

  -- Zoya leaves: off the lists, and her mother (no other child here) loses app access.
  perform public.admin_child_left(kid);
  assert (select not active from public.children where id = kid), 'left';
  assert (select not app_access from public.profiles where id = mum), 'mother has no other child here';
  assert (select app_access from public.profiles where id = '00000000-0000-0000-0000-0000000000e1'), 'Parent A keeps access (Aarav)';

  -- An admin's app access can't be switched off either.
  begin
    update public.profiles set app_access = false where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FAIL: switched off an admin''s app access';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The gate still hands over to a relative without the app.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.profiles where full_name = 'Kavita Rao' and active) = 1, 'the coordinator sees the aunt';
end $$;
reset role;

-- A coordinator can't save children.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$ begin
  perform public.admin_save_child('{"full_name":"Intruder Kid","date_of_birth":"2022-01-01","programme_id":"00000000-0000-0000-0000-00000000b001"}',
    '[{"id":"00000000-0000-0000-0000-0000000000e1","relation":"Mother"}]');
  raise exception 'FAIL: a coordinator added a child';
exception when insufficient_privilege then null;
end $$;
reset role;
