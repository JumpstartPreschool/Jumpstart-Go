-- Email sign-in provisioning: the on-screen code stays removed, a new email on a person
-- follows to their sign-in (a temporary password is dropped, their own is kept), invited emails and phones link. Its own people, so earlier tests can't change the outcome:
--   A  Anita, admin                      M  Meera, parent with an email and a mobile, already signed in by phone
--   N  Neel, parent with a mobile only   R  Rohan, parent invited with an email, never signed in
--   X  Xavier, turned off, on a temporary password
-- Existing accounts are loaded with triggers off, as if made before this migration.
-- Rolled back at the end. Earlier tests' people now all have a mobile (0039), so they are set aside here with their emails
-- blanked (triggers off); only the people above have an email.
begin;
set session_replication_role = replica;
update public.profiles set email = null;
insert into auth.users (id, phone, email, encrypted_password) values
  ('00000000-0000-0000-0000-0000000e0a01', '919811100001', null, ''),
  ('00000000-0000-0000-0000-0000000e0a02', '919811100002', null, ''),
  ('00000000-0000-0000-0000-0000000e0a05', '919811100005', 'xavier@example.test', '$2a$old');
insert into public.profiles (id, user_id, full_name, email, phone, active, app_access, email_sign_in) values
  ('00000000-0000-0000-0000-0000000e0b01', '00000000-0000-0000-0000-0000000e0a01', 'Anita Admin', 'anita@example.test', '+919811100001', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000e0b02', '00000000-0000-0000-0000-0000000e0a02', 'Meera Shah', 'meera.shah@example.test', '+919811100002', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000e0b03', null, 'Neel Rao', null, '+919811100003', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000e0b04', null, 'Rohan Iyer', 'rohan@example.test', '+919811100004', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000e0b05', '00000000-0000-0000-0000-0000000e0a05', 'Xavier Old', 'xavier@example.test', '+919811100005', false, true, 'temporary');
insert into public.staff_roles (profile_id, role) values ('00000000-0000-0000-0000-0000000e0b01', 'admin');
set session_replication_role = origin;

-- The on-screen code is gone.
do $$ begin
  assert to_regprocedure('public.request_screen_otp(text)') is null, 'request_screen_otp still exists';
  assert to_regprocedure('public.verify_screen_otp(text,text)') is null, 'verify_screen_otp still exists';
  assert to_regclass('app.screen_otps') is null, 'screen_otps still exists';
end $$;

-- The 0041 pattern is gone: no pattern table, no pattern functions, and 'pattern' is no longer a password state.
do $$ begin
  assert to_regclass('public.password_pattern') is null, 'password_pattern still exists';
  assert to_regprocedure('public.admin_save_password_pattern(text)') is null, 'old admin_save_password_pattern still exists';
  assert to_regprocedure('public.admin_password_target(uuid)') is null, 'admin_password_target still exists';
  assert to_regprocedure('public.mark_email_sign_in(uuid,uuid,text)') is null, 'mark_email_sign_in still exists';
  begin
    update public.profiles set email_sign_in = 'pattern' where id = '00000000-0000-0000-0000-0000000e0b02';
    raise exception 'pattern is still an allowed state';
  exception when check_violation then null;
  end;
end $$;

-- whoami tells the app she has a temporary password, so it asks her to choose her own.
update public.profiles set email_sign_in = 'temporary', temp_password_expires_at = now() + interval '1 day'
  where id = '00000000-0000-0000-0000-0000000e0b02';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000e0a02"}';
set role authenticated;
do $$ begin
  assert (public.whoami() ->> 'email_sign_in') = 'temporary', 'whoami says temporary';
  assert (public.whoami() ->> 'email') = 'meera.shah@example.test', 'whoami has the email';
  assert (public.whoami() ->> 'temp_password_expires_at') is not null, 'whoami has the expiry';
end $$;
reset role;

-- She chooses her own: Supabase Auth writes the new hash (no admin issue in progress) and she moves to 'own'.
update auth.users set encrypted_password = '$2a$mine' where id = '00000000-0000-0000-0000-0000000e0a02';
do $$ begin
  assert (select email_sign_in from public.profiles where id = '00000000-0000-0000-0000-0000000e0b02') = 'own', 'Meera on own';
  assert (select temp_password_expires_at from public.profiles where id = '00000000-0000-0000-0000-0000000e0b02') is null, 'expiry cleared';
end $$;

-- A new email on someone with a temporary password: sign-in email follows, the old password is removed.
update public.profiles set email_sign_in = 'temporary' where id = '00000000-0000-0000-0000-0000000e0b02';
update public.profiles set email = 'meera@example.test' where id = '00000000-0000-0000-0000-0000000e0b02';
do $$ begin
  assert (select email from auth.users where id = '00000000-0000-0000-0000-0000000e0a02') = 'meera@example.test', 'auth email follows';
  assert (select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000e0a02') = '', 'temporary password removed';
  assert (select email_sign_in from public.profiles where id = '00000000-0000-0000-0000-0000000e0b02') = 'none', 'back to none';
end $$;

-- A new email on someone with their own password keeps the password.
update public.profiles set email_sign_in = 'own' where id = '00000000-0000-0000-0000-0000000e0b02';
update auth.users set encrypted_password = '$2a$mine' where id = '00000000-0000-0000-0000-0000000e0a02';
update public.profiles set email = 'meera.s@example.test' where id = '00000000-0000-0000-0000-0000000e0b02';
do $$ begin
  assert (select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000e0a02') = '$2a$mine', 'own password kept';
  assert (select email_sign_in from public.profiles where id = '00000000-0000-0000-0000-0000000e0b02') = 'own', 'still own';
end $$;

-- Nobody can claim Rohan's invited email from the sign-up form; the school's function can.
do $$ begin
  begin
    insert into auth.users (email) values ('rohan@example.test');
    raise exception 'a sign-up claimed an invited email';
  exception when raise_exception then
    if sqlerrm not like 'not_invited%' then raise; end if;
  end;
end $$;
insert into auth.users (id, email, raw_app_meta_data) values ('00000000-0000-0000-0000-0000000e0a04', 'rohan@example.test', '{"provisioned":"school"}');
do $$ begin
  assert (select user_id from public.profiles where id = '00000000-0000-0000-0000-0000000e0b04') = '00000000-0000-0000-0000-0000000e0a04', 'Rohan linked';
end $$;

-- A first WhatsApp-code sign-in still makes Neel's account by his mobile.
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000e0a03', '919811100003');
do $$ begin
  assert (select user_id from public.profiles where id = '00000000-0000-0000-0000-0000000e0b03') = '00000000-0000-0000-0000-0000000e0a03', 'Neel linked by phone';
end $$;

rollback;
