-- 0022: bulk import. People from foundation.test.sql: a1 admin, c1 core, d1 coordinator, e1 parent of Aarav.
-- Programme b001 (Jr KG · Half day).

-- 1. Coordinators and parents can't import.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$ begin
  perform public.import_child('{"full_name":"Tara Iyer","date_of_birth":"2022-03-04","programme_id":"00000000-0000-0000-0000-00000000b001"}',
    '[{"full_name":"Lakshmi Iyer","relation":"Mother","kind":"parent","email":"lakshmi@example.com","phone":"+919811111111"}]');
  raise exception 'FAIL: a coordinator imported a child';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 2. The core team imports a child with a new parent and a family member without an email (no app access).
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$
declare kid uuid;
begin
  kid := public.import_child('{"full_name":"Tara Iyer","date_of_birth":"2022-03-04","programme_id":"00000000-0000-0000-0000-00000000b001"}',
    '[{"full_name":"Lakshmi Iyer","relation":"Mother","kind":"parent","email":"Lakshmi@Example.com","phone":"+919811111111","app_access":true},
      {"full_name":"Ravi Iyer","relation":"Grandfather","kind":"family","phone":"+919822222222","app_access":false}]');
  assert (select class_id = '00000000-0000-0000-0000-00000000c001' from public.children where id = kid), 'class follows the programme';
  assert (select count(*) from public.guardianships where child_id = kid) = 2, 'two people on the record';
  assert (select app_access and email = 'lakshmi@example.com' from public.profiles where phone = '+919811111111'), 'parent has app access, email lower-cased';
  assert (select not app_access from public.profiles where phone = '+919822222222'), 'family with app_access off has no app access';

  -- 3. A brother: the same mother (matched by mobile, 0039:326) is linked, not duplicated.
  kid := public.import_child('{"full_name":"Arjun Iyer","date_of_birth":"2021-01-10","programme_id":"00000000-0000-0000-0000-00000000b001"}',
    '[{"full_name":"Lakshmi I.","relation":"Mother","kind":"parent","email":"lakshmi@example.com","phone":"+919811111111","app_access":true}]');
  assert (select count(*) from public.profiles where lower(email) = 'lakshmi@example.com') = 1, 'no duplicate parent';
  assert (select count(*) from public.guardianships g join public.profiles p on p.id = g.guardian_id where p.email = 'lakshmi@example.com') = 2, 'mother of both';
  assert (select full_name from public.profiles where email = 'lakshmi@example.com') = 'Lakshmi Iyer', 'existing details kept';

  -- 4. The same child twice is refused, in words.
  begin
    perform public.import_child('{"full_name":"tara iyer","date_of_birth":"2022-03-04","programme_id":"00000000-0000-0000-0000-00000000b001"}',
      '[{"full_name":"Someone Else","relation":"Mother","kind":"parent","email":"else@example.com","phone":"+919000000031","app_access":true}]');
    raise exception 'FAIL: the same child imported twice';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'duplicate%', sqlerrm;
  end;

  -- 5. A mobile that belongs to someone already here wins over a different email (0039 matches by mobile only; the
  -- person_conflict check of 0022/0028 is gone): the existing person is linked, nothing is duplicated or changed.
  kid := public.import_child('{"full_name":"Meena Rao","date_of_birth":"2022-05-05","programme_id":"00000000-0000-0000-0000-00000000b001"}',
    '[{"full_name":"Mixed Up","relation":"Mother","kind":"parent","email":"mixed@example.com","phone":"+919822222222","app_access":true}]');
  assert (select count(*) from public.profiles where phone = '+919822222222') = 1, 'one person per mobile';
  assert not exists (select 1 from public.profiles where email = 'mixed@example.com'), 'the existing person keeps their own details';
  assert (select count(*) from public.guardianships where child_id = kid and guardian_id = (select id from public.profiles where phone = '+919822222222')) = 1, 'linked to the existing person';

  -- 6. The usual rules still apply (a programme is required).
  begin
    perform public.import_child('{"full_name":"No Programme","date_of_birth":"2022-05-05","programme_id":"00000000-0000-0000-0000-000000000000"}',
      '[{"full_name":"Some Parent","relation":"Mother","kind":"parent","email":"some@example.com","phone":"+919000000032","app_access":true}]');
    raise exception 'FAIL: no programme accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'programme_required%', sqlerrm;
  end;
end $$;

-- 7. The core team still can't remove a child.
do $$ begin
  perform public.admin_child_left((select id from public.children where full_name = 'Tara Iyer'));
  assert (select active from public.children where full_name = 'Tara Iyer'), 'FAIL: core team removed a child';
exception when insufficient_privilege or raise_exception then null;
end $$;
reset role;
do $$ begin
  assert (select active from public.children where full_name = 'Tara Iyer'), 'Tara still on the list';
  assert exists (select 1 from public.audit_log where table_name = 'children' and new_row ->> 'full_name' = 'Tara Iyer'), 'import audited';
end $$;

-- 0025: boy or girl is saved when given, and nothing else is accepted.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$
declare kid uuid;
begin
  kid := public.import_child('{"full_name":"Diya Menon","date_of_birth":"2022-07-07","programme_id":"00000000-0000-0000-0000-00000000b001","gender":"girl"}',
    '[{"full_name":"Asha Menon","relation":"Mother","kind":"parent","email":"asha@example.com","phone":"+919000000033","app_access":true}]');
  assert (select gender = 'girl' from public.children where id = kid), 'gender saved';
  begin
    perform public.import_child('{"full_name":"Odd Value","date_of_birth":"2022-07-08","programme_id":"00000000-0000-0000-0000-00000000b001","gender":"x"}',
      '[{"full_name":"Some One","relation":"Mother","kind":"parent","email":"someone2@example.com","phone":"+919000000034","app_access":true}]');
    raise exception 'FAIL: an unknown gender accepted';
  exception when check_violation then null;
  end;
end $$;
reset role;
