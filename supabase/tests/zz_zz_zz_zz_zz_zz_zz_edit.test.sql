-- 0029: the admin edits someone's details. Its own parent (g7), signed in, on Meera's record (c0002).
insert into public.profiles (id, full_name, email, phone) values ('00000000-0000-0000-0000-0000000000a7', 'Edit Parent', 'edit.parent@example.test', '+919000000009');
insert into auth.users (id, email, raw_app_meta_data) values ('00000000-0000-0000-0000-0000000000a7', 'edit.parent@example.test', '{"provisioned":"school"}');
insert into public.guardianships values ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000000a7', 'Mother');

-- 1. Only the admin: the head office is refused.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  perform public.admin_update_person('00000000-0000-0000-0000-0000000000a7', null, '{"full_name":"Not Allowed","email":"x@example.test"}');
  raise exception 'FAIL: head office edited a person';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 2. The admin changes name, email, mobile and relation; the sign-in moves to the new email.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$ begin
  perform public.admin_update_person('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000c0002',
    '{"full_name":"  Edited   Mehta ","email":"New.Mail@Example.test","phone":"+919812300007","app_access":true,"relation":"Grandmother","kind":"family"}');
end $$;
reset role;
do $$ begin
  assert (select full_name = 'Edited Mehta' and email = 'new.mail@example.test' and phone = '+919812300007' from public.profiles where id = '00000000-0000-0000-0000-0000000000a7'), 'details saved';
  assert (select email = 'new.mail@example.test' from auth.users where id = '00000000-0000-0000-0000-0000000000a7'), 'sign-in follows the new email';
  assert (select relation = 'Grandmother' and kind = 'family' from public.guardianships where guardian_id = '00000000-0000-0000-0000-0000000000a7'), 'relation saved';
end $$;

-- 3. Mistakes are refused in words: someone else's email, app access without a mobile (0039:224), no contact at all.
set role authenticated;
do $$
declare bad jsonb;
begin
  foreach bad in array array[
    '{"full_name":"Edited Mehta","email":"admin@example.test","phone":"+919812300007","app_access":true}'::jsonb,
    '{"full_name":"Edited Mehta","phone":"+919000000001","app_access":true}'::jsonb,
    '{"full_name":"Edited Mehta","email":"edited@example.test","app_access":true}'::jsonb,
    '{"full_name":"Edited Mehta","app_access":false}'::jsonb
  ] loop
    begin
      perform public.admin_update_person('00000000-0000-0000-0000-0000000000a7', null, bad);
      raise exception 'FAIL: accepted %', bad;
    exception when raise_exception then
      if sqlerrm like 'FAIL%' then raise; end if;
      assert sqlerrm ~ '^(taken|phone_required|contact_required):', sqlerrm;
    end;
  end loop;
end $$;
reset role;
