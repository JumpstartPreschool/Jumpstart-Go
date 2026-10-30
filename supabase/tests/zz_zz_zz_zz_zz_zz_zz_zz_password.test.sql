-- 0033 and 0034 password sign-in, as left by 0039 (email codes, login_allowed and has_password dropped; sign-in is by mobile
-- code) and 0041 (email and password with the admin's pattern, covered in the email_password test).
-- People from foundation.test.sql: c1 core. Rolled back, so later tests see nothing changed.
begin;

-- 0. The email-code checks are gone; nothing can be asked "may this email get a code".
do $$ begin
  assert to_regprocedure('public.login_allowed(text)') is null, 'login_allowed(text) still exists';
  assert to_regprocedure('public.login_allowed(text,text)') is null, 'login_allowed(text,text) still exists';
  assert to_regprocedure('app.has_password()') is null, 'app.has_password still exists';
end $$;

-- 1. whoami no longer reports password state.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  assert not (public.whoami() ? 'has_password'), 'whoami still reports has_password';
end $$;
reset role;

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
