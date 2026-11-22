-- Temporary passwords from the admin's pattern (0048, D55). Its own people, so earlier tests can't change the outcome:
--   A  Anita, admin                     M  Meera, parent with her own password        N  Neel, parent with no email
--   R  Rohan, parent with no app access D  Dev, core and coordinator                  E  Eve, pro
--   C  Carla, core                      G  Gus, parent (the password trigger)         H  Hal, parent with no account yet
--   I  Ivy, parent (reused passwords)   J  Jo, parent (the access token hook)         Z  Zed, parent, turned off
-- Existing accounts are loaded with triggers off. Earlier tests' people are set aside with their emails blanked, so only
-- the people above have an email. Rolled back at the end.
begin;
set session_replication_role = replica;
update public.profiles set email = null;
insert into auth.users (id, phone, email, encrypted_password) values
  ('00000000-0000-0000-0000-0000000d0a01', '919811200001', 'anita@example.test', ''),
  ('00000000-0000-0000-0000-0000000d0a03', '919811200003', 'meera.shah@example.test', '$2a$mine'),
  ('00000000-0000-0000-0000-0000000d0a07', '919811200007', 'dev@example.test', ''),
  ('00000000-0000-0000-0000-0000000d0a10', '919811200010', 'gus@example.test', ''),
  ('00000000-0000-0000-0000-0000000d0a11', '919811200011', 'hal@example.test', ''),
  ('00000000-0000-0000-0000-0000000d0a12', '919811200012', 'ivy@example.test', ''),
  ('00000000-0000-0000-0000-0000000d0a13', '919811200013', 'jo@example.test', ''),
  ('00000000-0000-0000-0000-0000000d0a14', '919811200014', 'zed@example.test', '$2a$zed');
insert into public.profiles (id, user_id, full_name, email, phone, active, app_access, email_sign_in) values
  ('00000000-0000-0000-0000-0000000d0b01', '00000000-0000-0000-0000-0000000d0a01', 'Anita Admin', 'anita@example.test', '+919811200001', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000d0b03', '00000000-0000-0000-0000-0000000d0a03', 'Meera Shah', 'meera.shah@example.test', '+919811200003', true, true, 'own'),
  ('00000000-0000-0000-0000-0000000d0b04', null, 'Neel Rao', null, '+919811200004', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000d0b05', null, 'Rohan Iyer', 'rohan@example.test', '+919811200005', true, false, 'none'),
  ('00000000-0000-0000-0000-0000000d0b07', '00000000-0000-0000-0000-0000000d0a07', 'Dev Core', 'dev@example.test', '+919811200007', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000d0b08', null, 'Eve Pro', 'eve@example.test', '+919811200008', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000d0b09', null, 'Carla Core', 'carla@example.test', '+919811200009', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000d0b10', '00000000-0000-0000-0000-0000000d0a10', 'Gus Parent', 'gus@example.test', '+919811200010', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000d0b11', null, 'Hal Parent', 'hal@example.test', '+919811200011', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000d0b12', '00000000-0000-0000-0000-0000000d0a12', 'Ivy Parent', 'ivy@example.test', '+919811200012', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000d0b13', '00000000-0000-0000-0000-0000000d0a13', 'Jo Parent', 'jo@example.test', '+919811200013', true, true, 'none'),
  ('00000000-0000-0000-0000-0000000d0b14', '00000000-0000-0000-0000-0000000d0a14', 'Zed Old', 'zed@example.test', '+919811200014', false, true, 'own');
insert into public.staff_roles (profile_id, role) values
  ('00000000-0000-0000-0000-0000000d0b01', 'admin'),
  ('00000000-0000-0000-0000-0000000d0b07', 'core'), ('00000000-0000-0000-0000-0000000d0b07', 'coordinator'),
  ('00000000-0000-0000-0000-0000000d0b08', 'pro'),
  ('00000000-0000-0000-0000-0000000d0b09', 'core');
set session_replication_role = origin;

-- 1. The rules and the recommended pattern are there from the start --------------------------------------------------------
do $$
declare pol public.password_policy;
begin
  assert (select count(*) from public.password_policy) = 1, 'one policy row';
  select * into pol from public.password_policy;
  assert (pol.min_length, pol.max_length, pol.temp_expiry_hours, pol.reuse_count, pol.max_failed, pol.lock_minutes) = (10, 64, 48, 5, 5, 15), 'default numbers';
  assert pol.require_upper and pol.require_lower and pol.require_number and pol.require_special, 'default classes are all required';
  assert (select blocks from public.password_patterns where scope = 'default')
    = '[{"type":"EMAIL_FIRST","n":4},{"type":"RANDOM_UPPER","n":2},{"type":"RANDOM_NUMBER","n":4},{"type":"RANDOM_SPECIAL","n":1}]'::jsonb,
    'the recommended pattern is the default';
  assert (select count(*) from public.password_patterns) = 1, 'only the default pattern exists';
  assert app.pattern_problem((select blocks from public.password_patterns where scope = 'default'), pol) is null, 'the default pattern passes the default rules';
end $$;

-- 2. Only the admin: nobody else can save, issue or turn off, or read patterns ----------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000d0a03"}';
set role authenticated;
do $$ begin
  begin
    perform public.admin_save_password_pattern('default', '[{"type":"RANDOM_LETTER","n":12}]');
    raise exception 'a parent saved a pattern';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_save_password_policy('{"min_length":12}');
    raise exception 'a parent saved the rules';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_begin_temp_password('00000000-0000-0000-0000-0000000d0b10');
    raise exception 'a parent issued a temporary password';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_email_sign_in_off('00000000-0000-0000-0000-0000000d0b10');
    raise exception 'a parent turned off email sign-in';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.password_patterns) = 0, 'a parent read the patterns';
  assert (select count(*) from public.password_policy) = 1, 'a parent can read the rules (the choose-password screen shows them)';
end $$;
reset role;

set role anon;
do $$ begin
  begin
    perform public.admin_begin_temp_password('00000000-0000-0000-0000-0000000d0b10');
    raise exception 'anon issued a temporary password';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.password_reused('00000000-0000-0000-0000-0000000d0a03', 'x', 5);
    raise exception 'anon checked a password';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.finish_temp_password('00000000-0000-0000-0000-0000000d0b10', '00000000-0000-0000-0000-0000000d0a10');
    raise exception 'anon finished a temporary password';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 3. The database refuses what the pattern builder refuses -----------------------------------------------------------------
do $$
declare
  pol public.password_policy;
  function_check text;
begin
  select * into pol from public.password_policy;
  assert app.pattern_problem('[{"type":"EMAIL_FIRST","n":4},{"type":"RANDOM_UPPER","n":2},{"type":"RANDOM_NUMBER","n":4},{"type":"RANDOM_SPECIAL","n":1}]', pol) is null, 'recommended accepted';
  assert app.pattern_problem('[]', pol) = 'Add at least one block.', 'empty';
  assert app.pattern_problem('{"type":"RANDOM_UPPER","n":8}', pol) = 'Add at least one block.', 'not an array';
  assert app.pattern_problem('[{"type":"EMAIL_FIRST","n":12}]', pol) like 'Add a random block%', 'no random block';
  assert app.pattern_problem('[{"type":"FIXED_TEXT","text":"Jumpstart2026!"},{"type":"EMAIL_FIRST","n":2}]', pol) like 'Add a random block%', 'fixed text alone is not random';
  assert app.pattern_problem('[{"type":"EMAIL_FIRST","n":9},{"type":"RANDOM_NUMBER","n":1}]', pol) like 'The random part is too small: about 3 bits%', 'under 24 bits';
  assert app.pattern_problem('[{"type":"RANDOM_UPPER","n":6}]', pol) = 'Passwords would be only 6 characters; the rules need at least 10.', 'too short';
  assert app.pattern_problem('[{"type":"RANDOM_LETTER","n":16},{"type":"RANDOM_LETTER","n":16},{"type":"RANDOM_LETTER","n":16},{"type":"RANDOM_LETTER","n":16},{"type":"RANDOM_LETTER","n":16}]', pol)
    = 'Passwords would be 80 characters; the rules allow at most 64.', 'too long';
  assert app.pattern_problem('[{"type":"EMAIL_FIRST","n":4},{"type":"RANDOM_LOWER","n":6},{"type":"RANDOM_NUMBER","n":4},{"type":"RANDOM_SPECIAL","n":1}]', pol) like 'The rules need a capital%', 'no capital';
  assert app.pattern_problem('[{"type":"RANDOM_UPPER","n":6},{"type":"RANDOM_NUMBER","n":4},{"type":"RANDOM_SPECIAL","n":1}]', pol) like 'The rules need a small letter%', 'no small letter';
  assert app.pattern_problem('[{"type":"EMAIL_FIRST","n":4},{"type":"RANDOM_UPPER","n":6},{"type":"RANDOM_SPECIAL","n":1}]', pol) like 'The rules need a digit%', 'no digit';
  assert app.pattern_problem('[{"type":"EMAIL_FIRST","n":4},{"type":"RANDOM_UPPER","n":2},{"type":"RANDOM_NUMBER","n":6}]', pol) like 'The rules need a symbol%', 'no symbol';
  assert app.pattern_problem('[{"type":"RANDOM_LETTER","n":8},{"type":"RANDOM_NUMBER","n":3},{"type":"RANDOM_SPECIAL","n":1}]', pol) like 'The rules need a capital%', 'random letters do not guarantee a capital';
  assert app.pattern_problem('[{"type":"EMAIL_FIRST","n":4},{"type":"RANDOM_UPPER","n":2},{"type":"RANDOM_NUMBER","n":6},{"type":"FIXED_TEXT","text":"#"}]', pol) is null, 'a symbol in fixed text counts';
  assert app.pattern_problem('[{"type":"RANDOM_UPPER","n":0}]', pol) like 'Choose 1 to 16%', 'n of 0';
  assert app.pattern_problem('[{"type":"RANDOM_UPPER","n":17}]', pol) like 'Choose 1 to 16%', 'n over 16';
  assert app.pattern_problem('[{"type":"RANDOM_UPPER","n":"3"}]', pol) like 'Choose 1 to 16%', 'n as text';
  assert app.pattern_problem('[{"type":"RANDOM_UPPER","n":1.5}]', pol) like 'Choose 1 to 16%', 'n not whole';
  assert app.pattern_problem('[{"type":"NOPE","n":3}]', pol) like '%isn''t one the pattern knows%', 'unknown block';
  assert app.pattern_problem('[{"type":"FIXED_TEXT","text":"a b"},{"type":"RANDOM_UPPER","n":8}]', pol) like 'Fixed text needs 1 to 16%', 'fixed text with a space';
  assert app.pattern_problem('[{"type":"FIXED_TEXT","text":"aaaaaaaaaaaaaaaaa"},{"type":"RANDOM_UPPER","n":8}]', pol) like 'Fixed text needs 1 to 16%', 'fixed text over 16';
  assert app.pattern_problem('[{"type":"RANDOM_UPPER","n":1},{"type":"RANDOM_UPPER","n":1},{"type":"RANDOM_UPPER","n":1},{"type":"RANDOM_UPPER","n":1},{"type":"RANDOM_UPPER","n":1},{"type":"RANDOM_UPPER","n":1},{"type":"RANDOM_UPPER","n":1},{"type":"RANDOM_UPPER","n":1},{"type":"RANDOM_UPPER","n":1},{"type":"RANDOM_UPPER","n":1},{"type":"RANDOM_UPPER","n":1},{"type":"RANDOM_UPPER","n":1},{"type":"RANDOM_UPPER","n":1}]', pol)
    = 'Use at most 12 blocks.', 'thirteen blocks';
  -- a rule the school switches off is not checked
  pol.require_special := false;
  assert app.pattern_problem('[{"type":"EMAIL_FIRST","n":4},{"type":"RANDOM_UPPER","n":2},{"type":"RANDOM_NUMBER","n":6}]', pol) is null, 'symbol not required';
end $$;

-- 4. The admin saves patterns and rules; nobody's password changes ---------------------------------------------------------
create temp table before_hashes as select id, encrypted_password from auth.users;
create temp table before_states as select id, email_sign_in, temp_password_expires_at from public.profiles;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000d0a01"}';
set role authenticated;
do $$
declare
  fam jsonb := '[{"type":"EMAIL_FIRST","n":3},{"type":"RANDOM_UPPER","n":3},{"type":"RANDOM_NUMBER","n":4},{"type":"RANDOM_SPECIAL","n":1}]';
begin
  perform public.admin_save_password_pattern('family', fam);
  assert (select blocks from public.password_patterns where scope = 'family') = fam, 'family saved';
  assert (select count(*) from public.password_patterns) = 2, 'the admin reads the patterns';
  perform public.admin_save_password_pattern('default', '[{"type":"EMAIL_FIRST","n":4},{"type":"RANDOM_UPPER","n":3},{"type":"RANDOM_NUMBER","n":4},{"type":"RANDOM_SPECIAL","n":1}]');
  assert (select jsonb_array_length(blocks) from public.password_patterns where scope = 'default') = 4, 'default replaced';
  perform public.admin_save_password_pattern('default', '[{"type":"EMAIL_FIRST","n":4},{"type":"RANDOM_UPPER","n":2},{"type":"RANDOM_NUMBER","n":4},{"type":"RANDOM_SPECIAL","n":1}]');
  begin
    perform public.admin_save_password_pattern('core', '[{"type":"EMAIL_FIRST","n":8}]');
    raise exception 'a pattern with no random part was saved';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'weak_pattern:%' then raise; end if;
  end;
  begin
    perform public.admin_save_password_pattern('everyone', fam);
    raise exception 'a made-up scope was saved';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'bad_scope:%' then raise; end if;
  end;
  begin
    perform public.admin_save_password_pattern('default', null);
    raise exception 'the default pattern was removed';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'bad_scope:%' then raise; end if;
  end;
  perform public.admin_save_password_pattern('family', null);
  assert not exists (select 1 from public.password_patterns where scope = 'family'), 'family removed';
  assert exists (select 1 from public.password_patterns where scope = 'default'), 'default kept';

  -- the rules: refused when a saved pattern (11 characters) would break them, and left as they were
  begin
    perform public.admin_save_password_policy('{"min_length":12}');
    raise exception 'rules that break the default pattern were saved';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'weak_pattern: The default pattern:%' then raise; end if;
  end;
  assert (select min_length from public.password_policy) = 10, 'rules unchanged after a refusal';
  begin
    perform public.admin_save_password_policy('{"require_special":true,"min_length":"abc"}');
    raise exception 'text was saved as a number';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'bad_policy:%' then raise; end if;
  end;
  begin
    perform public.admin_save_password_policy('{"min_length":5}');
    raise exception 'a 5 character minimum was saved';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'bad_policy:%' then raise; end if;
  end;
  perform public.admin_save_password_policy('{"max_failed":3,"lock_minutes":30,"temp_expiry_hours":24}');
  assert (select (max_failed, lock_minutes, temp_expiry_hours, min_length) from public.password_policy) = (3, 30, 24, 10), 'valid rules saved, the others kept';
  assert (select changed_by from public.password_policy) = '00000000-0000-0000-0000-0000000d0b01', 'who changed the rules';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from auth.users u join before_hashes b using (id) where u.encrypted_password is distinct from b.encrypted_password), 'saving patterns or rules changed a password';
  assert not exists (select 1 from public.profiles p join before_states b using (id)
    where (p.email_sign_in, p.temp_password_expires_at) is distinct from (b.email_sign_in, b.temp_password_expires_at)), 'saving patterns or rules changed someone''s password state';
end $$;
update public.password_policy set temp_expiry_hours = 48; -- back to the default expiry for the rest

-- 5. Issuing: the admin's checks, then the person's pattern and the rules -------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000d0a01"}';
set role authenticated;
do $$
declare r jsonb;
begin
  begin
    perform public.admin_begin_temp_password('00000000-0000-0000-0000-0000000d0b01');
    raise exception 'an admin issued their own temporary password';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'self:%' then raise; end if;
  end;
  begin
    perform public.admin_begin_temp_password('00000000-0000-0000-0000-0000000d0b04');
    raise exception 'issued for someone with no email';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'no_email:%' then raise; end if;
  end;
  begin
    perform public.admin_begin_temp_password('00000000-0000-0000-0000-0000000d0b05');
    raise exception 'issued for someone with no app access';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'no_access:%' then raise; end if;
  end;
  begin
    perform public.admin_begin_temp_password('00000000-0000-0000-0000-0000000d0b14');
    raise exception 'issued for someone turned off';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'no_access:%' then raise; end if;
  end;
  begin
    perform public.admin_begin_temp_password('00000000-0000-0000-0000-00000000dead');
    raise exception 'issued for someone who does not exist';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'no_access:%' then raise; end if;
  end;
  assert not exists (select 1 from public.profiles where password_pending_at is not null), 'a refusal marked someone as pending';

  r := public.admin_begin_temp_password('00000000-0000-0000-0000-0000000d0b03');
  assert r ->> 'profile_id' = '00000000-0000-0000-0000-0000000d0b03', 'profile';
  assert r ->> 'user_id' = '00000000-0000-0000-0000-0000000d0a03', 'user';
  assert r ->> 'email' = 'meera.shah@example.test', 'email';
  assert r ->> 'full_name' = 'Meera Shah', 'name';
  assert jsonb_array_length(r -> 'blocks') = 4 and r -> 'blocks' -> 0 ->> 'type' = 'EMAIL_FIRST', 'her pattern is the default';
  assert (r -> 'policy' ->> 'min_length')::int = 10 and (r -> 'policy' ->> 'max_failed')::int = 3, 'the rules come with it';
  assert not (r -> 'policy' ? 'id') and not (r -> 'policy' ? 'changed_by'), 'only the rules, no bookkeeping';
  assert not (r::text ~* 'mine'), 'no password hash in the answer';
  assert (select password_pending_at from public.profiles where id = '00000000-0000-0000-0000-0000000d0b03') > now() - interval '1 minute', 'marked pending';
end $$;
reset role;
do $$ begin
  -- begin alone changes nobody's password or state
  assert (select email_sign_in from public.profiles where id = '00000000-0000-0000-0000-0000000d0b03') = 'own', 'still own until the password is written';
  assert (select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000d0a03') = '$2a$mine', 'password untouched';
end $$;
update public.profiles set password_pending_at = null where id = '00000000-0000-0000-0000-0000000d0b03';

-- The database refuses to issue from a pattern that was weakened behind the builder's back.
insert into public.password_patterns (scope, blocks) values ('core', '[{"type":"EMAIL_FIRST","n":8}]');
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000d0a01"}';
set role authenticated;
do $$ begin
  begin
    perform public.admin_begin_temp_password('00000000-0000-0000-0000-0000000d0b09');
    raise exception 'issued from a pattern with no random part';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'weak_pattern:%' then raise; end if;
  end;
end $$;
reset role;
delete from public.password_patterns where scope = 'core';

-- 6. Which pattern someone gets --------------------------------------------------------------------------------------------
insert into public.password_patterns (scope, blocks) values
  ('core', '[{"type":"EMAIL_FIRST","n":4},{"type":"RANDOM_UPPER","n":3},{"type":"RANDOM_NUMBER","n":4},{"type":"RANDOM_SPECIAL","n":1}]'),
  ('coordinator', '[{"type":"EMAIL_FIRST","n":4},{"type":"RANDOM_UPPER","n":4},{"type":"RANDOM_NUMBER","n":4},{"type":"RANDOM_SPECIAL","n":1}]');
do $$
declare
  def jsonb := (select blocks from public.password_patterns where scope = 'default');
  dev uuid := '00000000-0000-0000-0000-0000000d0b07';
  eve uuid := '00000000-0000-0000-0000-0000000d0b08';
  meera uuid := '00000000-0000-0000-0000-0000000d0b03';
  anita uuid := '00000000-0000-0000-0000-0000000d0b01';
begin
  assert (app.pattern_for(dev) -> 1 ->> 'n') = '3', 'the most senior role with a pattern wins (core before coordinator)';
  delete from public.password_patterns where scope = 'core';
  assert (app.pattern_for(dev) -> 1 ->> 'n') = '4', 'then the next role''s own pattern';
  delete from public.password_patterns where scope = 'coordinator';
  assert app.pattern_for(dev) = def, 'no role pattern: the default';
  assert app.pattern_for(anita) = def, 'an admin with no admin pattern gets the default';
  assert app.pattern_for(meera) = def, 'no role and no family pattern: the default';
  insert into public.password_patterns (scope, blocks) values ('family', '[{"type":"EMAIL_FIRST","n":3},{"type":"RANDOM_UPPER","n":3},{"type":"RANDOM_NUMBER","n":4},{"type":"RANDOM_SPECIAL","n":1}]');
  assert (app.pattern_for(meera) -> 0 ->> 'n') = '3', 'someone with no role gets the family pattern';
  assert app.pattern_for(eve) = def, 'staff never get the family pattern';
  assert app.pattern_for(dev) = def, 'staff with roles but no role pattern get the default';
  delete from public.password_patterns where scope = 'family';
end $$;

-- 7. The password trigger: temporary within the issue window, otherwise their own -----------------------------------------
-- A password set around the school (Supabase's own updateUser, no issue in progress) can't turn email sign-in on for
-- someone who has none.
update auth.users set encrypted_password = extensions.crypt('Sneaky-Pass-1!', extensions.gen_salt('bf')) where id = '00000000-0000-0000-0000-0000000d0a13';
do $$ begin
  assert (select email_sign_in from public.profiles where id = '00000000-0000-0000-0000-0000000d0b13') = 'none', 'a password write from none stays none';
end $$;
update auth.users set encrypted_password = '' where id = '00000000-0000-0000-0000-0000000d0a13';

-- Gus is issued one: the admin marks him, then the function writes the hash.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000d0a01"}';
set role authenticated;
select public.admin_begin_temp_password('00000000-0000-0000-0000-0000000d0b10');
reset role;
update auth.users set encrypted_password = '$2a$temp1' where id = '00000000-0000-0000-0000-0000000d0a10';
do $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10';
  assert p.email_sign_in = 'temporary', 'a password written right after issuing is temporary';
  assert p.temp_password_expires_at between now() + interval '47 hours 59 minutes' and now() + interval '48 hours 1 minute', 'it lasts the policy''s 48 hours';
  assert p.password_pending_at is null, 'the pending mark is used up';
  assert (select count(*) from app.password_history where user_id = p.user_id) = 0, 'no old password to remember: it was empty';
end $$;

-- He chooses his own: no issue in progress, so it is his.
update auth.users set encrypted_password = '$2a$own1' where id = '00000000-0000-0000-0000-0000000d0a10';
do $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10';
  assert p.email_sign_in = 'own', 'a later password is their own';
  assert p.temp_password_expires_at is null, 'no expiry on their own';
  assert (select array_agg(hash) from app.password_history where user_id = p.user_id) = array['$2a$temp1'], 'the temporary hash is remembered, so it can''t be reused';
end $$;

-- Another admin issue, but the person chooses before the window ends: still the issue's password is the one written first.
-- An emptied password changes no state (turning email sign-in off removes it).
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000d0a01"}';
set role authenticated;
select public.admin_begin_temp_password('00000000-0000-0000-0000-0000000d0b10');
reset role;
update auth.users set encrypted_password = '$2a$temp2' where id = '00000000-0000-0000-0000-0000000d0a10';
create temp table gus_before as select email_sign_in, temp_password_expires_at from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10';
update auth.users set encrypted_password = '' where id = '00000000-0000-0000-0000-0000000d0a10';
do $$ begin
  assert (select email_sign_in from gus_before) = 'temporary', 'second issue is temporary';
  assert (select (email_sign_in, temp_password_expires_at) from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10')
       = (select (email_sign_in, temp_password_expires_at) from gus_before), 'an emptied password changes no state';
end $$;

-- An issue that was never completed (marked more than two minutes ago) doesn't make the next password temporary.
update public.profiles set password_pending_at = now() - interval '3 minutes' where id = '00000000-0000-0000-0000-0000000d0b10';
update auth.users set encrypted_password = '$2a$own2' where id = '00000000-0000-0000-0000-0000000d0a10';
do $$ begin
  assert (select email_sign_in from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10') = 'own', 'a stale mark gives no temporary password';
  assert (select temp_password_expires_at from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10') is null, 'and no expiry';
  assert (select password_pending_at from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10') is null, 'the stale mark is cleared';
end $$;

-- Writing one person's password never moves anyone else.
do $$ begin
  assert (select email_sign_in from public.profiles where id = '00000000-0000-0000-0000-0000000d0b03') = 'own', 'Meera untouched';
end $$;

-- Only the newest 24 old passwords are kept.
do $$
declare i int;
begin
  for i in 1..30 loop
    update auth.users set encrypted_password = '$2a$loop' || i where id = '00000000-0000-0000-0000-0000000d0a10';
  end loop;
  assert (select count(*) from app.password_history where user_id = '00000000-0000-0000-0000-0000000d0a10') = 24, 'history capped at 24';
end $$;

-- 8. finish_temp_password: the service role links the account, sets the expiry, lifts any lock ------------------------------
set session_replication_role = replica;
update public.profiles set locked_until = now() + interval '1 hour', password_pending_at = now() where id = '00000000-0000-0000-0000-0000000d0b11';
insert into app.password_failures (email) values ('hal@example.test'), ('hal@example.test'), ('someone.else@example.test');
set session_replication_role = origin;
set role authenticated;
do $$ begin
  begin
    perform public.finish_temp_password('00000000-0000-0000-0000-0000000d0b11', '00000000-0000-0000-0000-0000000d0a11');
    raise exception 'a signed-in user finished a temporary password';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role service_role;
do $$
declare ends timestamptz;
begin
  ends := public.finish_temp_password('00000000-0000-0000-0000-0000000d0b11', '00000000-0000-0000-0000-0000000d0a11');
  assert ends between now() + interval '47 hours 59 minutes' and now() + interval '48 hours 1 minute', 'returns the expiry';
end $$;
reset role;
do $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = '00000000-0000-0000-0000-0000000d0b11';
  assert p.user_id = '00000000-0000-0000-0000-0000000d0a11', 'account linked';
  assert p.email_sign_in = 'temporary' and p.temp_password_expires_at > now() + interval '47 hours', 'temporary with an expiry';
  assert p.locked_until is null and p.password_pending_at is null, 'lock and pending cleared';
  assert not exists (select 1 from app.password_failures where email = 'hal@example.test'), 'his wrong tries cleared';
  assert exists (select 1 from app.password_failures where email = 'someone.else@example.test'), 'other people''s tries kept';
  -- an account already linked is never replaced
  perform public.finish_temp_password('00000000-0000-0000-0000-0000000d0b11', '00000000-0000-0000-0000-0000000d0a12');
  assert (select user_id from public.profiles where id = '00000000-0000-0000-0000-0000000d0b11') = '00000000-0000-0000-0000-0000000d0a11', 'user_id kept';
end $$;
delete from app.password_failures;

-- 9. password_reused: the current password and the last N, by the real bcrypt check ---------------------------------------
insert into app.password_history (user_id, hash, replaced_at) values
  ('00000000-0000-0000-0000-0000000d0a12', extensions.crypt('Old-One-1!', extensions.gen_salt('bf')), now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000d0a12', extensions.crypt('Old-Two-2!', extensions.gen_salt('bf')), now() - interval '2 hours'),
  ('00000000-0000-0000-0000-0000000d0a12', extensions.crypt('Old-Three-3!', extensions.gen_salt('bf')), now() - interval '3 hours');
set session_replication_role = replica;
update auth.users set encrypted_password = extensions.crypt('Current-Pass-0!', extensions.gen_salt('bf')) where id = '00000000-0000-0000-0000-0000000d0a12';
set session_replication_role = origin;
do $$
declare ivy uuid := '00000000-0000-0000-0000-0000000d0a12';
begin
  assert public.password_reused(ivy, 'Current-Pass-0!', 5), 'the current password is reused';
  assert public.password_reused(ivy, 'Current-Pass-0!', 0), 'the current password is refused even when no old ones are remembered';
  assert not public.password_reused(ivy, 'current-pass-0!', 5), 'case matters';
  assert public.password_reused(ivy, 'Old-One-1!', 1), 'newest old one, count 1';
  assert not public.password_reused(ivy, 'Old-Two-2!', 1), 'second old one is outside count 1';
  assert public.password_reused(ivy, 'Old-Two-2!', 2), 'second old one inside count 2';
  assert not public.password_reused(ivy, 'Old-Three-3!', 2), 'third old one is outside count 2';
  assert public.password_reused(ivy, 'Old-Three-3!', 5), 'third old one inside count 5';
  assert not public.password_reused(ivy, 'Old-One-1!', 0), 'count 0 remembers none';
  assert not public.password_reused(ivy, 'Old-One-1!', -3), 'a negative count remembers none';
  assert not public.password_reused(ivy, 'Brand-New-9!', 24), 'a new password is fine';
  assert not public.password_reused('00000000-0000-0000-0000-0000000d0a13', 'Old-One-1!', 5), 'another person''s history is not Ivy''s';
  assert not public.password_reused('00000000-0000-0000-0000-0000000d0a13', '', 5), 'no password at all is never matched by an empty one';
end $$;
set role authenticated;
do $$ begin
  begin
    perform public.password_reused('00000000-0000-0000-0000-0000000d0a12', 'Old-One-1!', 5);
    raise exception 'a signed-in user could test passwords';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 10. Wrong passwords and the lock -----------------------------------------------------------------------------------------
-- The rules say 3 wrong tries lock for 30 minutes (section 4). Called from the app before sign-in, so as anon.
set role anon;
select public.password_sign_in_failed('gus@example.test');
select public.password_sign_in_failed('  GUS@Example.test ');
reset role;
do $$ begin
  assert (select locked_until from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10') is null, 'two wrong tries do not lock';
  assert (select count(*) from app.password_failures where email = 'gus@example.test') = 2, 'both counted, whatever the case and spaces';
end $$;
set role anon;
select public.password_sign_in_failed('gus@example.test');
reset role;
do $$ begin
  assert (select locked_until from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10') between now() + interval '29 minutes' and now() + interval '31 minutes', 'the third locks for the policy''s 30 minutes';
  assert not exists (select 1 from app.password_failures where email = 'gus@example.test'), 'the count starts again after a lock';
end $$;

-- Already locked: more wrong tries change nothing, so the lock can't be held shut by repeated calls.
create temp table gus_lock as select locked_until from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10';
set role anon;
select public.password_sign_in_failed('gus@example.test');
select public.password_sign_in_failed('gus@example.test');
select public.password_sign_in_failed('gus@example.test');
reset role;
do $$ begin
  assert (select locked_until from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10') = (select locked_until from gus_lock), 'an active lock is not extended';
  assert not exists (select 1 from app.password_failures where email = 'gus@example.test'), 'no failures recorded while locked';
end $$;

-- An email nobody has, a turned-off person and an empty email: nothing recorded, nothing learned.
set role anon;
select public.password_sign_in_failed('nobody@example.test');
select public.password_sign_in_failed('nobody@example.test');
select public.password_sign_in_failed('nobody@example.test');
select public.password_sign_in_failed('zed@example.test');
select public.password_sign_in_failed('zed@example.test');
select public.password_sign_in_failed('zed@example.test');
select public.password_sign_in_failed('');
select public.password_sign_in_failed(null);
reset role;
do $$ begin
  assert not exists (select 1 from app.password_failures), 'no failures recorded for unknown, inactive or empty emails';
  assert (select count(*) from public.profiles where locked_until is not null) = 1, 'only Gus is locked';
end $$;

-- Wrong tries older than 15 minutes no longer count.
insert into app.password_failures (email, at) values ('ivy@example.test', now() - interval '20 minutes'), ('ivy@example.test', now() - interval '20 minutes');
set role anon;
select public.password_sign_in_failed('ivy@example.test');
reset role;
do $$ begin
  assert (select locked_until from public.profiles where id = '00000000-0000-0000-0000-0000000d0b12') is null, 'old tries do not add up to a lock';
  assert (select count(*) from app.password_failures where email = 'ivy@example.test') = 1, 'only the new one is left';
end $$;
delete from app.password_failures;

-- 11. The access token hook ------------------------------------------------------------------------------------------------
-- Jo, with each combination of password state and lock. WhatsApp-code (otp) sessions are never touched.
create function pg_temp.jo(state text, expires interval, lock interval) returns void language sql as $$
  update public.profiles set email_sign_in = state,
    temp_password_expires_at = case when expires is null then null else now() + expires end,
    locked_until = case when lock is null then null else now() + lock end
  where id = '00000000-0000-0000-0000-0000000d0b13'
$$;
create function pg_temp.ev(method text, amr jsonb default '[]') returns jsonb language sql as $$
  select jsonb_build_object('user_id', '00000000-0000-0000-0000-0000000d0a13', 'authentication_method', method, 'claims', jsonb_build_object('amr', amr))
$$;
do $$
declare
  e jsonb;
  pw jsonb := '[{"method":"password","timestamp":1}]';
  otp jsonb := '[{"method":"otp","timestamp":1}]';
  out jsonb;
  m text;
begin
  -- A WhatsApp code works whatever the email password's state: locked, off, expired.
  perform pg_temp.jo('none', null, interval '1 hour');
  e := pg_temp.ev('otp');
  assert public.access_token_hook(e) = e and not (public.access_token_hook(e) ? 'error'), 'otp passes when locked and off';
  assert public.access_token_hook(pg_temp.ev('otp', otp)) = pg_temp.ev('otp', otp), 'otp passes with its amr too';
  perform pg_temp.jo('temporary', interval '-1 hour', interval '1 hour');
  assert public.access_token_hook(e) = e, 'otp passes with an expired temporary password and a lock';
  e := pg_temp.ev('token_refresh', otp);
  assert public.access_token_hook(e) = e, 'refreshing a WhatsApp session passes even locked and expired';
  e := pg_temp.ev('anything_else');
  assert public.access_token_hook(e) = e, 'other methods pass';

  -- Password sign-in refused: email sign-in off. It answers exactly like a wrong password.
  perform pg_temp.jo('none', null, null);
  out := public.access_token_hook(pg_temp.ev('password'));
  assert out = '{"error":{"http_code":400,"message":"Invalid login credentials"}}', format('off: %s', out);
  -- Password sign-in refused: temporary expired (and with no expiry set at all)
  perform pg_temp.jo('temporary', interval '-1 minute', null);
  out := public.access_token_hook(pg_temp.ev('password'));
  assert out ? 'error' and out -> 'error' ->> 'message' like 'temporary_expired:%' and (out -> 'error' ->> 'http_code') = '403', format('expired: %s', out);
  perform pg_temp.jo('temporary', null, null);
  out := public.access_token_hook(pg_temp.ev('password'));
  assert out ? 'error' and out -> 'error' ->> 'message' like 'temporary_expired:%', format('no expiry: %s', out);
  -- Password sign-in refused: locked, with a good temporary or their own password
  perform pg_temp.jo('temporary', interval '1 hour', interval '10 minutes');
  out := public.access_token_hook(pg_temp.ev('password'));
  assert out = '{"error":{"http_code":400,"message":"Invalid login credentials"}}', format('locked temp: %s', out);
  perform pg_temp.jo('own', null, interval '10 minutes');
  out := public.access_token_hook(pg_temp.ev('password'));
  assert out = '{"error":{"http_code":400,"message":"Invalid login credentials"}}', format('locked own: %s', out);
  -- Allowed: a valid temporary password, their own, and an own password after the lock has ended
  perform pg_temp.jo('temporary', interval '1 hour', null);
  e := pg_temp.ev('password', pw);
  assert public.access_token_hook(e) = e, 'a valid temporary password signs in';
  perform pg_temp.jo('own', null, null);
  assert public.access_token_hook(e) = e, 'their own password signs in';
  perform pg_temp.jo('own', null, interval '-1 minute');
  assert public.access_token_hook(e) = e, 'an ended lock no longer blocks';

  -- A renewal of a password session: stops when the temporary password expires or email sign-in is off, not for a lock.
  perform pg_temp.jo('temporary', interval '-1 minute', null);
  out := public.access_token_hook(pg_temp.ev('token_refresh', pw));
  assert out ? 'error' and out -> 'error' ->> 'message' like 'temporary_expired:%', format('refresh after expiry: %s', out);
  perform pg_temp.jo('none', null, null);
  out := public.access_token_hook(pg_temp.ev('token_refresh', pw));
  assert out = '{"error":{"http_code":400,"message":"Invalid login credentials"}}', format('refresh when off: %s', out);
  perform pg_temp.jo('temporary', interval '1 hour', null);
  e := pg_temp.ev('token_refresh', pw);
  assert public.access_token_hook(e) = e, 'a refresh before expiry passes';
  perform pg_temp.jo('own', null, interval '10 minutes');
  assert public.access_token_hook(e) = e, 'a lock stops new password sign-ins, not a session already open';

  -- Someone with no profile has no email sign-in
  out := public.access_token_hook(jsonb_build_object('user_id', gen_random_uuid(), 'authentication_method', 'password'));
  assert out = '{"error":{"http_code":400,"message":"Invalid login credentials"}}', 'unknown account refused like a wrong password';

  -- Links that let whoever holds an email address set a password are never accepted, for anyone, in any state.
  perform pg_temp.jo('own', null, null);
  foreach m in array array['recovery', 'magiclink', 'invite', 'email_change', 'email/signup'] loop
    out := public.access_token_hook(pg_temp.ev(m));
    assert out ? 'error' and out -> 'error' ->> 'message' like 'method_not_allowed:%' and (out -> 'error' ->> 'http_code') = '403', format('%s: %s', m, out);
    out := public.access_token_hook(pg_temp.ev('token_refresh', jsonb_build_array(jsonb_build_object('method', m))));
    assert out ? 'error' and out -> 'error' ->> 'message' like 'method_not_allowed:%', format('refresh of %s: %s', m, out);
    out := public.access_token_hook(pg_temp.ev('token_refresh', pw || jsonb_build_array(jsonb_build_object('method', m))));
    assert out ? 'error' and out -> 'error' ->> 'message' like 'method_not_allowed:%', format('refresh of password + %s: %s', m, out);
  end loop;
  assert public.access_token_hook(pg_temp.ev('otp')) = pg_temp.ev('otp'), 'otp still passes';
end $$;
-- Only Supabase Auth calls the hook.
set role authenticated;
do $$ begin
  begin
    perform public.access_token_hook('{}');
    raise exception 'a signed-in user called the hook';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role supabase_auth_admin;
do $$ begin
  assert public.access_token_hook('{"user_id":"00000000-0000-0000-0000-0000000d0a03","authentication_method":"otp"}') ->> 'authentication_method' = 'otp', 'Supabase Auth can call the hook';
end $$;
reset role;

-- A good password sign-in clears the signed-in person's wrong tries.
insert into app.password_failures (email) values ('jo@example.test'), ('gus@example.test');
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000d0a13"}';
set role authenticated;
select public.password_sign_in_ok();
reset role;
do $$ begin
  assert not exists (select 1 from app.password_failures where email = 'jo@example.test'), 'Jo''s tries cleared';
  assert exists (select 1 from app.password_failures where email = 'gus@example.test'), 'Gus''s tries kept';
end $$;
delete from app.password_failures;

-- 12. Only the school's functions change how someone signs in ---------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000d0a01"}';
set role authenticated;
do $$
declare c text;
begin
  -- an admin editing a row directly can't turn a temporary password they know into a permanent one, or lift a lock
  foreach c in array array['email_sign_in = ''temporary''', 'temp_password_expires_at = now() + interval ''1 year''', 'locked_until = null', 'password_pending_at = now()'] loop
    begin
      execute format('update public.profiles set %s where id = %L', c, '00000000-0000-0000-0000-0000000d0b10');
      raise exception 'a direct update of % worked', c;
    exception when insufficient_privilege then
      if sqlerrm not like 'Sign-in details can only be changed through Settings%' then raise; end if;
    end;
  end loop;
  -- nor can a record be pointed at a sign-in the admin holds
  begin
    update public.profiles set user_id = '00000000-0000-0000-0000-0000000d0a01' where id = '00000000-0000-0000-0000-0000000d0b04';
    raise exception 'a direct update of user_id worked';
  exception when insufficient_privilege then
    if sqlerrm not like 'Sign-in details can only be changed through Settings%' then raise; end if;
  end;
  -- a new person starts with none of it set
  foreach c in array array['user_id', 'email_sign_in', 'temp_password_expires_at', 'password_pending_at', 'locked_until'] loop
    begin
      execute format('insert into public.profiles (full_name, email, phone, %s) values (''Sneaky'', ''sneaky@example.test'', ''+919811299999'', %s)', c,
        case c when 'user_id' then quote_literal('00000000-0000-0000-0000-0000000d0a01') when 'email_sign_in' then '''own'''
          else 'now() + interval ''1 day''' end);
      raise exception 'an insert with % worked', c;
    exception when insufficient_privilege then
      if sqlerrm not like 'Sign-in details can only be set through Settings%' then raise; end if;
    end;
  end loop;
  -- the same guard is not in the way of ordinary edits
  update public.profiles set full_name = 'Gus Parent Jr' where id = '00000000-0000-0000-0000-0000000d0b10';
  assert (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10') = 'Gus Parent Jr', 'ordinary edits work';
end $$;
reset role;
do $$ begin
  assert (select locked_until from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10') is not null, 'the lock is still there';
end $$;

-- Turning email sign-in off goes through the function: the password is removed, the lock and expiry cleared.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000d0a01"}';
set role authenticated;
do $$ begin
  perform public.admin_email_sign_in_off('00000000-0000-0000-0000-0000000d0b10');
  begin
    perform public.admin_email_sign_in_off('00000000-0000-0000-0000-0000000d0b01');
    raise exception 'an admin turned off their own email sign-in';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'self:%' then raise; end if;
  end;
end $$;
reset role;
do $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = '00000000-0000-0000-0000-0000000d0b10';
  assert p.email_sign_in = 'none' and p.locked_until is null and p.temp_password_expires_at is null and p.password_pending_at is null, 'turned off and cleared';
  assert (select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000d0a10') = '', 'the password is gone';
  assert (select phone from auth.users where id = '00000000-0000-0000-0000-0000000d0a10') = '919811200010', 'the mobile number still signs in';
end $$;

-- Wrong-tries and old-password tables are the school's own: nobody signed in or not can read them.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000d0a01"}';
set role authenticated;
do $$ begin
  begin perform count(*) from app.password_failures; raise exception 'authenticated read password_failures';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from app.password_history; raise exception 'authenticated read password_history';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform count(*) from app.password_failures; raise exception 'anon read password_failures';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from app.password_history; raise exception 'anon read password_history';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
