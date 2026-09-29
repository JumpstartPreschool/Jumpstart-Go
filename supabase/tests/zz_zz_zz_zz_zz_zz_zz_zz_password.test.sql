-- 0033 and 0034: password sign-in, email codes only for a first sign-in or a reset. People from foundation.test.sql: c1 core. Rolled back, so later tests see nothing changed.
begin;

-- 0. No password yet: a first-sign-in code is allowed; a made-up purpose never is.
do $$ begin
  assert public.login_allowed('Core@Example.test', 'first'), 'first code allowed before a password exists';
  assert not public.login_allowed('core@example.test', 'login'), 'unknown purpose refused';
  assert not public.login_allowed('stranger@example.test', 'reset'), 'unknown email refused';
end $$;

-- 1. whoami says whether the person has set a password; nobody else's password state is visible.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  assert (public.whoami() ->> 'has_password')::boolean = false, 'no password yet after email-code sign-in';
end $$;
reset role;

update auth.users set encrypted_password = '$2a$10$hash' where id = '00000000-0000-0000-0000-0000000000c1';
set role authenticated;
do $$ begin
  assert (public.whoami() ->> 'has_password')::boolean, 'password set';
  begin
    perform app.has_password();
    raise exception 'FAIL: app.has_password callable directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 1b. With a password: no first-sign-in code (saves an email), but Forgot password still sends one.
do $$ begin
  assert not public.login_allowed('core@example.test', 'first'), 'first code refused once a password is set';
  assert public.login_allowed('core@example.test', 'reset'), 'reset code still allowed';
  assert public.login_allowed('core@example.test'), 'old one-argument call still allows a code';
end $$;

-- 2. App access turned off: whoami reports the account as not active, so the app shows "Access turned off".
set request.jwt.claims to '{}';
update public.profiles set app_access = false where user_id = '00000000-0000-0000-0000-0000000000c1';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  assert not (public.whoami() ->> 'active')::boolean, 'app access off reads as not active';
  assert app.me() is null, 'row-level security still refuses them';
end $$;
reset role;

rollback;
