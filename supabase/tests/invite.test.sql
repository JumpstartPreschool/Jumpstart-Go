-- Invite-only login (0002): refusal of strangers, the login check, whoami and consent.

-- Someone the admin never added cannot get an account, even calling Supabase Auth directly.
do $$ begin
  insert into auth.users (email) values ('stranger@example.test');
  raise exception 'FAIL: an uninvited email got an account';
exception when raise_exception then
  if sqlerrm not like 'not_invited%' then raise; end if;
end $$;

-- A deactivated person cannot sign up again either.
insert into public.profiles (full_name, email, active, phone) values ('Left School', 'left@example.test', false, '+919000000007');
do $$ begin
  insert into auth.users (email) values ('left@example.test');
  raise exception 'FAIL: a deactivated person got an account';
exception when raise_exception then
  if sqlerrm not like 'not_invited%' then raise; end if;
end $$;

-- Phone invites match Supabase's phone format (no leading +).
insert into public.profiles (full_name, phone) values ('Phone Parent', '+919876543210');
insert into auth.users (phone) values ('919876543210');
do $$ begin
  assert (select user_id is not null from public.profiles where phone = '+919876543210'), 'phone invite linked';
end $$;

-- The login screen's check (phone_login_allowed, 0039), as an anonymous visitor.
set role anon;
do $$ begin
  assert public.phone_login_allowed('+91 90000 00001'), 'registered mobile allowed (formatting ignored)';
  assert public.phone_login_allowed('9000000001'), 'bare ten-digit mobile allowed as +91';
  assert not public.phone_login_allowed('+919999999999'), 'unknown mobile refused';
  assert not public.phone_login_allowed('+919000000006'), 'deactivated person refused';
  assert not public.phone_login_allowed(''), 'empty input refused';
  assert not public.phone_login_allowed('admin@example.test'), 'an email is not a mobile';
end $$;
do $$ begin
  perform public.whoami();
  raise exception 'FAIL: anon called whoami';
exception when insufficient_privilege then null;
end $$;
reset role;

-- whoami and consent for a parent.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
set role authenticated;
do $$ declare w jsonb := public.whoami(); begin
  assert w ->> 'full_name' = 'Parent A', 'whoami names the parent';
  assert w -> 'roles' = '[]'::jsonb, 'a parent has no staff roles';
  assert (w ->> 'children')::int = 1, 'the parent has one child';
  assert w ->> 'consent_version' is null, 'no consent yet';
end $$;
select public.accept_consent('2026-09-24');
do $$ begin
  assert public.whoami() ->> 'consent_version' = '2026-09-24', 'consent recorded';
end $$;
do $$ begin
  perform public.accept_consent('yes please');
  raise exception 'FAIL: malformed consent version accepted';
exception when check_violation then null;
end $$;
reset role;

-- whoami for staff lists their roles; a deactivated person gets no roles.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  assert public.whoami() -> 'roles' = '["core", "coordinator"]'::jsonb, 'core team member holds both roles, in role order';
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1"}';
set role authenticated;
do $$ begin
  assert (public.whoami() ->> 'active')::boolean = false, 'deactivated person is marked inactive';
  assert not app.is_active(), 'deactivated person has no access';
end $$;
reset role;
