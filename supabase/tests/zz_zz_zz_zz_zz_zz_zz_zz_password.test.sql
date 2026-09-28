-- 0033: password sign-in. People from foundation.test.sql: c1 core. Rolled back, so later tests see nothing changed.
begin;

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
