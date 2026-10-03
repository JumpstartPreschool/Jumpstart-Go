-- Email and password sign-in with the admin's pattern (0041). Its own people, so earlier tests can't change the outcome:
--   A  Anita, admin                      M  Meera, parent with an email and a mobile, already signed in by phone
--   N  Neel, parent with a mobile only   R  Rohan, parent invited with an email, never signed in
--   X  Xavier, turned off, still on an old pattern password
-- Existing accounts are loaded with triggers off, as if made before this migration.
set session_replication_role = replica;
insert into auth.users (id, phone, email, encrypted_password) values
  ('00000000-0000-0000-0000-0000000e0a01', '919811100001', null, ''),
  ('00000000-0000-0000-0000-0000000e0a02', '919811100002', null, ''),
  ('00000000-0000-0000-0000-0000000e0a05', '919811100005', 'xavier@example.test', '$2a$old');
insert into public.profiles (id, user_id, full_name, email, phone, active, app_access, email_sign_in) values
  ('00000000-0000-0000-0000-0000000e0b01', '00000000-0000-0000-0000-0000000e0a01', 'Anita Admin', 'anita@example.test', '+919811100001', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000e0b02', '00000000-0000-0000-0000-0000000e0a02', 'Meera Shah', 'meera.shah@example.test', '+919811100002', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000e0b03', null, 'Neel Rao', null, '+919811100003', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000e0b04', null, 'Rohan Iyer', 'rohan@example.test', '+919811100004', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000e0b05', '00000000-0000-0000-0000-0000000e0a05', 'Xavier Old', 'xavier@example.test', '+919811100005', false, true, 'pattern');
insert into public.staff_roles (profile_id, role) values ('00000000-0000-0000-0000-0000000e0b01', 'admin');
set session_replication_role = origin;

-- The on-screen code is gone.
do $$ begin
  assert to_regprocedure('public.request_screen_otp(text)') is null, 'request_screen_otp still exists';
  assert to_regprocedure('public.verify_screen_otp(text,text)') is null, 'verify_screen_otp still exists';
  assert to_regclass('app.screen_otps') is null, 'screen_otps still exists';
end $$;

-- A parent can't change the pattern, can't read it, and can't mark passwords.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000e0a02"}';
set role authenticated;
do $$ begin
  begin
    perform public.admin_save_password_pattern('{First}@{domain}#2026');
    raise exception 'a parent saved the pattern';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mark_email_sign_in('00000000-0000-0000-0000-0000000e0b02', null, 'pattern');
    raise exception 'a parent marked a password';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The admin saves the pattern: everyone with an email and app access is set; Xavier (turned off) is cleared;
-- Neel (no email) and Anita (staff: never a pattern password, even with an email) are left alone.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000e0a01"}';
set role authenticated;
do $$
declare t jsonb;
begin
  t := public.admin_save_password_pattern('  {First}@{domain}#2026 ');
  assert jsonb_array_length(t) = 3, format('expected 3 targets, got %s', t);
  assert (select count(*) from jsonb_array_elements(t) e where e ->> 'action' = 'set') = 2, 'two to set';
  assert (select e ->> 'action' from jsonb_array_elements(t) e where e ->> 'full_name' = 'Xavier Old') = 'clear', 'Xavier cleared';
  assert not exists (select 1 from jsonb_array_elements(t) e where e ->> 'full_name' in ('Neel Rao', 'Anita Admin')), 'no email or staff, no target';
  assert (select pattern from public.password_pattern) = '{First}@{domain}#2026', 'admin reads the trimmed pattern';
  assert (public.admin_password_target('00000000-0000-0000-0000-0000000e0b04') -> 'target' ->> 'email') = 'rohan@example.test', 'one person';
  begin
    perform public.admin_password_target('00000000-0000-0000-0000-0000000e0b01');
    raise exception 'reset worked for the admin';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.admin_password_target('00000000-0000-0000-0000-0000000e0b03');
    raise exception 'reset worked for someone with no email';
  exception when sqlstate 'P0001' then null;
  end;
end $$;
reset role;

-- A parent sees no pattern row.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000e0a02"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.password_pattern) = 0, 'a parent read the pattern';
end $$;
reset role;

-- The function (service role) sets Meera's password, then marks it: she ends on 'pattern'.
update auth.users set encrypted_password = '$2a$pattern' where id = '00000000-0000-0000-0000-0000000e0a02';
select public.mark_email_sign_in('00000000-0000-0000-0000-0000000e0b02', '00000000-0000-0000-0000-0000000e0a02', 'pattern');
do $$ begin
  assert (select email_sign_in from public.profiles where id = '00000000-0000-0000-0000-0000000e0b02') = 'pattern', 'Meera on pattern';
end $$;

-- whoami tells the app she should choose her own password.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000e0a02"}';
set role authenticated;
do $$ begin
  assert (public.whoami() ->> 'email_sign_in') = 'pattern', 'whoami says pattern';
  assert (public.whoami() ->> 'email') = 'meera.shah@example.test', 'whoami has the email';
end $$;
reset role;

-- She chooses her own: Supabase Auth writes the new hash and she moves to 'own'.
update auth.users set encrypted_password = '$2a$mine' where id = '00000000-0000-0000-0000-0000000e0a02';
do $$ begin
  assert (select email_sign_in from public.profiles where id = '00000000-0000-0000-0000-0000000e0b02') = 'own', 'Meera on own';
end $$;

-- A new email on someone with a pattern password: sign-in email follows, the old password is removed.
update public.profiles set email_sign_in = 'pattern' where id = '00000000-0000-0000-0000-0000000e0b02';
update public.profiles set email = 'meera@example.test' where id = '00000000-0000-0000-0000-0000000e0b02';
do $$ begin
  assert (select email from auth.users where id = '00000000-0000-0000-0000-0000000e0a02') = 'meera@example.test', 'auth email follows';
  assert (select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000e0a02') = '', 'old pattern password removed';
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
