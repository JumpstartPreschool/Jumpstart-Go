-- 0056 (D59): no "called" name for a child. Earlier tests saved "Zo" for Zoya; it was cleared, and a new one never sticks.
do $$ begin
  assert not exists (select 1 from public.children where preferred_name is not null), 'no child has a called name';
end $$;
update public.children set preferred_name = 'Aaru' where id = '00000000-0000-0000-0000-0000000c0001';
do $$ begin
  assert (select preferred_name is null from public.children where id = '00000000-0000-0000-0000-0000000c0001'), 'a direct update is dropped';
end $$;
set role authenticated;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
do $$
declare kid uuid;
begin
  kid := public.admin_save_child('{"full_name":"Reyansh Joshi","preferred_name":"Rey","date_of_birth":"2022-05-05","programme_id":"00000000-0000-0000-0000-00000000b002"}',
    '[{"full_name":"Pooja Joshi","phone":"+919812700001","relation":"Mother","kind":"parent"}]');
  assert (select preferred_name is null from public.children where id = kid), 'Add child keeps no called name';
end $$;
reset role;
