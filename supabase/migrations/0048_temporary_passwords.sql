-- 0048: Temporary passwords from the admin's pattern builder (D55, owner 2026-10-04). Replaces the pattern part of 0041.
--
-- How it works
--   * Email and password stay the second way in, after the mobile number and WhatsApp code, for anyone with an email,
--     staff included. Nobody gets a password automatically: the admin issues a temporary one for one person at a time.
--   * The admin builds the pattern from blocks (Settings → Authentication). Every pattern has a random part of at least
--     24 bits, so knowing the pattern never gives away a password. One default, and optionally one per role or for
--     parents and family. Saving a pattern or the rules never changes anyone's password.
--   * A temporary password is made in the password-pattern function, shown to the admin once, and lasts the policy's
--     hours. The first sign-in with it asks the person to choose their own (password-change function), which the admin
--     can never see, read back or set.
--   * Wrong passwords counted per email (password_sign_in_failed); after the policy's number the email sign-in is locked
--     for a while. The lock and the expiry are enforced by the Custom Access Token hook below, so even a direct call to
--     Supabase Auth can't get a session. WhatsApp-code sign-in is never affected.
--   * Passwords live only in Supabase Auth as bcrypt hashes. Old hashes are kept to refuse reuse; never a plaintext.

-- 1. The 0041 pattern goes ------------------------------------------------------------------------------------------------
drop function public.admin_save_password_pattern(text);
drop function public.admin_password_target(uuid);
drop function public.mark_email_sign_in(uuid, uuid, text);
drop function app.password_targets(uuid);
drop function app.pattern_eligible(public.profiles);
drop table public.password_pattern;

-- Passwords made by the old pattern stop working: they had no random part. The trigger leaves an emptied password alone.
update auth.users set encrypted_password = ''
where id in (select user_id from public.profiles where email_sign_in = 'pattern' and user_id is not null);
update public.profiles set email_sign_in = 'none' where email_sign_in = 'pattern';
alter table public.profiles drop constraint profiles_email_sign_in_check;
alter table public.profiles add constraint profiles_email_sign_in_check check (email_sign_in in ('none', 'temporary', 'own'));
alter table public.profiles
  add column temp_password_expires_at timestamptz,
  add column password_pending_at timestamptz,
  add column locked_until timestamptz;

-- Only the school's own functions change these; an admin editing a row directly could otherwise turn a temporary
-- password they know into a permanent one, lift a lock, or point someone's record at a sign-in they hold (user_id).
-- Functions here run as their owner, not as 'authenticated'. A new row starts with none of them set.
create function app.guard_password_columns() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.user_id is not null or new.email_sign_in <> 'none' or new.temp_password_expires_at is not null
       or new.password_pending_at is not null or new.locked_until is not null then
      raise exception 'Sign-in details can only be set through Settings.' using errcode = '42501';
    end if;
  elsif new.user_id is distinct from old.user_id
    or new.email_sign_in is distinct from old.email_sign_in
    or new.temp_password_expires_at is distinct from old.temp_password_expires_at
    or new.password_pending_at is distinct from old.password_pending_at
    or new.locked_until is distinct from old.locked_until then
    raise exception 'Sign-in details can only be changed through Settings.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_password_columns before insert or update on public.profiles
  for each row execute function app.guard_password_columns();

-- 2. The rules ------------------------------------------------------------------------------------------------------------
-- One row. Everyone signed in may read it (the choose-password screen shows the rules); only the admin saves it.
-- The limits match POLICY_LIMITS in _shared/passwordPattern.ts.
create table public.password_policy (
  id boolean primary key default true check (id),
  min_length int not null default 10 check (min_length between 10 and 64),
  max_length int not null default 64 check (max_length between 10 and 72),
  require_upper boolean not null default true,
  require_lower boolean not null default true,
  require_number boolean not null default true,
  require_special boolean not null default true,
  temp_expiry_hours int not null default 48 check (temp_expiry_hours between 1 and 168),
  reuse_count int not null default 5 check (reuse_count between 0 and 24),
  max_failed int not null default 5 check (max_failed between 3 and 20),
  lock_minutes int not null default 15 check (lock_minutes between 1 and 1440),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id) on delete set null,
  check (max_length >= min_length)
);
insert into public.password_policy default values;
alter table public.password_policy enable row level security;
create policy read on public.password_policy for select to authenticated using (true);
grant select on public.password_policy to authenticated;
create trigger audit after insert or update or delete on public.password_policy for each row execute function app.audit();

-- 3. The patterns ---------------------------------------------------------------------------------------------------------
-- 'default', or one for a role or for parents and family. Readable by the admin only.
create table public.password_patterns (
  scope text primary key check (scope in ('default', 'admin', 'core', 'leader', 'coordinator', 'pro', 'family')),
  blocks jsonb not null check (jsonb_typeof(blocks) = 'array'),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id) on delete set null
);
-- The recommended pattern (owner): Email first 4, Random capitals 2, Random digits 4, Symbol 1.
insert into public.password_patterns (scope, blocks) values ('default',
  '[{"type":"EMAIL_FIRST","n":4},{"type":"RANDOM_UPPER","n":2},{"type":"RANDOM_NUMBER","n":4},{"type":"RANDOM_SPECIAL","n":1}]');
alter table public.password_patterns enable row level security;
create policy admin_read on public.password_patterns for select to authenticated using (app.has_role('admin'));
grant select on public.password_patterns to authenticated;
create trigger audit after insert or update or delete on public.password_patterns for each row execute function app.audit();

-- Why a pattern can't be used under these rules; null when it can. The same rules, in the same order, as checkPattern
-- in _shared/passwordPattern.ts, so the database refuses what the builder refuses even if the builder is bypassed.
create function app.pattern_problem(p_blocks jsonb, p public.password_policy) returns text
language plpgsql immutable set search_path = '' as $$
declare
  b jsonb;
  t text;
  n int;
  txt text;
  bits numeric := 0;
  len int := 0;
  any_random boolean := false;
  has_upper boolean := false;
  has_lower boolean := false;
  has_number boolean := false;
  has_special boolean := false;
  sizes constant jsonb := '{"RANDOM_NUMBER":10,"RANDOM_LETTER":52,"RANDOM_UPPER":26,"RANDOM_LOWER":26,"RANDOM_SPECIAL":12}';
begin
  if jsonb_typeof(p_blocks) is distinct from 'array' or jsonb_array_length(p_blocks) = 0 then return 'Add at least one block.'; end if;
  if jsonb_array_length(p_blocks) > 12 then return 'Use at most 12 blocks.'; end if;
  for b in select * from jsonb_array_elements(p_blocks) loop
    t := b ->> 'type';
    if t = 'FIXED_TEXT' then
      txt := b ->> 'text';
      if txt is null or txt !~ '^[!-~]{1,16}$' then return 'Fixed text needs 1 to 16 letters, digits or symbols, with no spaces.'; end if;
      len := len + length(txt);
      has_upper := has_upper or txt ~ '[A-Z]';
      has_lower := has_lower or txt ~ '[a-z]';
      has_number := has_number or txt ~ '[0-9]';
      has_special := has_special or txt ~ '[^A-Za-z0-9]';
      continue;
    end if;
    if t is null or t not in ('FIRST_NAME', 'LAST_NAME', 'EMAIL_FIRST', 'EMAIL_LAST', 'RANDOM_NUMBER', 'RANDOM_LETTER', 'RANDOM_UPPER', 'RANDOM_LOWER', 'RANDOM_SPECIAL') then
      return 'That block isn''t one the pattern knows.';
    end if;
    if jsonb_typeof(b -> 'n') is distinct from 'number' or (b ->> 'n') !~ '^[0-9]+$' or (b ->> 'n')::int not between 1 and 16 then
      return 'Choose 1 to 16 characters for each block.';
    end if;
    n := (b ->> 'n')::int;
    len := len + n;
    if t like 'RANDOM_%' then
      any_random := true;
      bits := bits + n * log(2, (sizes ->> t)::numeric);
      has_upper := has_upper or t = 'RANDOM_UPPER';
      has_lower := has_lower or t = 'RANDOM_LOWER';
      has_number := has_number or t = 'RANDOM_NUMBER';
      has_special := has_special or t = 'RANDOM_SPECIAL';
    else
      has_lower := true; -- name blocks always give small letters
    end if;
  end loop;
  if not any_random then return 'Add a random block. Without one, anyone who knows the pattern could work out every password.'; end if;
  if bits < 24 then return format('The random part is too small: about %s bits, and at least 24 are needed. Add more random characters.', floor(bits)); end if;
  if len < p.min_length then return format('Passwords would be only %s characters; the rules need at least %s.', len, p.min_length); end if;
  if len > p.max_length then return format('Passwords would be %s characters; the rules allow at most %s.', len, p.max_length); end if;
  if p.require_upper and not has_upper then return 'The rules need a capital letter. Add Random capitals, or a capital in fixed text.'; end if;
  if p.require_lower and not has_lower then return 'The rules need a small letter. Add Email first, a name block or Random small letters.'; end if;
  if p.require_number and not has_number then return 'The rules need a digit. Add Random digits, or a digit in fixed text.'; end if;
  if p.require_special and not has_special then return 'The rules need a symbol. Add Symbol, or a symbol in fixed text.'; end if;
  return null;
end $$;
revoke execute on function app.pattern_problem(jsonb, public.password_policy) from public;

-- Saves a pattern. p_blocks null removes a role's own pattern (it then uses the default); the default can't be removed.
-- Nobody's password changes.
create function public.admin_save_password_pattern(p_scope text, p_blocks jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pol public.password_policy;
  problem text;
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can change the password pattern.' using errcode = '42501';
  end if;
  perform app.throttle('pw-settings:' || app.me(), 30, interval '1 hour');
  if p_scope is null or p_scope not in ('default', 'admin', 'core', 'leader', 'coordinator', 'pro', 'family') then
    raise exception 'bad_scope: Choose who the pattern is for.' using errcode = 'P0001';
  end if;
  if p_blocks is null then
    if p_scope = 'default' then raise exception 'bad_scope: The default pattern can''t be removed.' using errcode = 'P0001'; end if;
    delete from public.password_patterns where scope = p_scope;
    return;
  end if;
  select * into pol from public.password_policy;
  problem := app.pattern_problem(p_blocks, pol);
  if problem is not null then raise exception 'weak_pattern: %', problem using errcode = 'P0001'; end if;
  insert into public.password_patterns (scope, blocks, changed_at, changed_by) values (p_scope, p_blocks, now(), app.me())
  on conflict (scope) do update set blocks = excluded.blocks, changed_at = now(), changed_by = excluded.changed_by;
end $$;
revoke execute on function public.admin_save_password_pattern(text, jsonb) from public, anon;
grant execute on function public.admin_save_password_pattern(text, jsonb) to authenticated;

-- Saves the rules. Refused if a saved pattern would break them, naming which, so issuing never fails later for that.
create function public.admin_save_password_policy(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pol public.password_policy;
  bad text;
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can change the password rules.' using errcode = '42501';
  end if;
  perform app.throttle('pw-settings:' || app.me(), 30, interval '1 hour');
  select * into pol from public.password_policy;
  begin
    pol.min_length := coalesce((p ->> 'min_length')::int, pol.min_length);
    pol.max_length := coalesce((p ->> 'max_length')::int, pol.max_length);
    pol.require_upper := coalesce((p ->> 'require_upper')::boolean, pol.require_upper);
    pol.require_lower := coalesce((p ->> 'require_lower')::boolean, pol.require_lower);
    pol.require_number := coalesce((p ->> 'require_number')::boolean, pol.require_number);
    pol.require_special := coalesce((p ->> 'require_special')::boolean, pol.require_special);
    pol.temp_expiry_hours := coalesce((p ->> 'temp_expiry_hours')::int, pol.temp_expiry_hours);
    pol.reuse_count := coalesce((p ->> 'reuse_count')::int, pol.reuse_count);
    pol.max_failed := coalesce((p ->> 'max_failed')::int, pol.max_failed);
    pol.lock_minutes := coalesce((p ->> 'lock_minutes')::int, pol.lock_minutes);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'bad_policy: Use whole numbers for the rules.' using errcode = 'P0001';
  end;
  select case scope when 'default' then 'The default pattern' when 'family' then 'The parents and family pattern' else format('The %s pattern', scope) end
         || ': ' || app.pattern_problem(blocks, pol)
  into bad from public.password_patterns where app.pattern_problem(blocks, pol) is not null limit 1;
  if bad is not null then raise exception 'weak_pattern: % Change the pattern first.', bad using errcode = 'P0001'; end if;
  update public.password_policy set
    min_length = pol.min_length, max_length = pol.max_length, require_upper = pol.require_upper,
    require_lower = pol.require_lower, require_number = pol.require_number, require_special = pol.require_special,
    temp_expiry_hours = pol.temp_expiry_hours, reuse_count = pol.reuse_count, max_failed = pol.max_failed,
    lock_minutes = pol.lock_minutes, changed_at = now(), changed_by = app.me();
exception when check_violation then
  raise exception 'bad_policy: Those rules are outside what''s allowed.' using errcode = 'P0001';
end $$;
revoke execute on function public.admin_save_password_policy(jsonb) from public, anon;
grant execute on function public.admin_save_password_policy(jsonb) to authenticated;

-- 4. Issuing a temporary password -----------------------------------------------------------------------------------------
-- The pattern for one person: their most senior role's own pattern, parents and family's for someone with no role, else
-- the default.
create function app.pattern_for(p_profile uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select blocks from public.password_patterns
  where scope = coalesce(
    (select r.role::text from public.staff_roles r join public.password_patterns pp on pp.scope = r.role::text
     where r.profile_id = p_profile
     order by array_position(array['admin', 'core', 'leader', 'coordinator', 'pro'], r.role::text) limit 1),
    (select 'family' where not exists (select 1 from public.staff_roles where profile_id = p_profile)
       and exists (select 1 from public.password_patterns where scope = 'family')),
    'default')
$$;
revoke execute on function app.pattern_for(uuid) from public;

-- Step 1, as the admin (the function calls it with their sign-in): checks they may, and says what to make. Marks the
-- person as expecting a temporary password, so the password write that follows lands as 'temporary', not 'own'.
create function public.admin_begin_temp_password(p_profile uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  pol public.password_policy;
  blocks jsonb;
  problem text;
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can issue temporary passwords.' using errcode = '42501';
  end if;
  perform app.throttle('temp-pw:' || app.me(), 30, interval '1 hour');
  select * into p from public.profiles where id = p_profile;
  if p.id is null or not p.active or not p.app_access then
    raise exception 'no_access: Turn on app access for them first.' using errcode = 'P0001';
  end if;
  if p.id = app.me() then
    raise exception 'self: You can''t issue your own temporary password. Ask the other admin.' using errcode = 'P0001';
  end if;
  if p.email is null then
    raise exception 'no_email: Add their email first.' using errcode = 'P0001';
  end if;
  select * into pol from public.password_policy;
  blocks := app.pattern_for(p.id);
  problem := app.pattern_problem(blocks, pol);
  if problem is not null then
    raise exception 'weak_pattern: % Fix the pattern in Settings first.', problem using errcode = 'P0001';
  end if;
  update public.profiles set password_pending_at = now() where id = p.id;
  return jsonb_build_object('profile_id', p.id, 'user_id', p.user_id, 'full_name', p.full_name, 'email', p.email,
    'phone', p.phone, 'blocks', blocks, 'policy', to_jsonb(pol) - 'id' - 'changed_at' - 'changed_by');
end $$;
revoke execute on function public.admin_begin_temp_password(uuid) from public, anon;
grant execute on function public.admin_begin_temp_password(uuid) to authenticated;

-- Step 2, service role, after the password is written: links a new account, sets the expiry, lifts any lock.
create function public.finish_temp_password(p_profile uuid, p_user uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  expires timestamptz := now() + make_interval(hours => (select temp_expiry_hours from public.password_policy));
  em text;
begin
  update public.profiles set user_id = coalesce(user_id, p_user), email_sign_in = 'temporary',
    temp_password_expires_at = expires, password_pending_at = null, locked_until = null
  where id = p_profile returning email into em;
  delete from app.password_failures where email = lower(em);
  return expires;
end $$;
revoke execute on function public.finish_temp_password(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finish_temp_password(uuid, uuid) to service_role;

-- Turning email sign-in off: the password is removed (WhatsApp codes keep working). As the admin; not for themselves.
create function public.admin_email_sign_in_off(p_profile uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can turn off email sign-in.' using errcode = '42501';
  end if;
  if p_profile = app.me() then
    raise exception 'self: You can''t turn off your own email sign-in here.' using errcode = 'P0001';
  end if;
  update public.profiles set email_sign_in = 'none', temp_password_expires_at = null, password_pending_at = null, locked_until = null
  where id = p_profile returning user_id into uid;
  if uid is not null then update auth.users set encrypted_password = '' where id = uid; end if;
end $$;
revoke execute on function public.admin_email_sign_in_off(uuid) from public, anon;
grant execute on function public.admin_email_sign_in_off(uuid) to authenticated;

-- 5. Which password someone has, and the old ones ---------------------------------------------------------------------
create table app.password_history (
  user_id uuid not null,
  hash text not null,
  replaced_at timestamptz not null default now()
);
create index on app.password_history (user_id, replaced_at desc);
revoke all on app.password_history from public, anon, authenticated;

-- Any new password: the old hash goes to the history (the newest 24 are kept). A password written within two minutes
-- of admin_begin_temp_password is the temporary one (finish_temp_password marks it again either way). Any other is the
-- person's own, but only when the admin already turned email sign-in on for them: someone signed in by WhatsApp code who
-- sets a password through Supabase Auth directly stays 'none', so the token hook refuses it. An emptied password
-- changes nothing.
create or replace function app.password_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(old.encrypted_password, '') <> '' then
    insert into app.password_history (user_id, hash) values (new.id, old.encrypted_password);
    delete from app.password_history where user_id = new.id and ctid not in
      (select ctid from app.password_history where user_id = new.id order by replaced_at desc limit 24);
  end if;
  if coalesce(new.encrypted_password, '') = '' then return null; end if;
  update public.profiles set
    email_sign_in = case when password_pending_at > now() - interval '2 minutes' then 'temporary'
                         when email_sign_in in ('temporary', 'own') then 'own' else 'none' end,
    temp_password_expires_at = case when password_pending_at > now() - interval '2 minutes'
      then now() + make_interval(hours => (select temp_expiry_hours from public.password_policy)) end,
    password_pending_at = null
  where user_id = new.id;
  return null;
end $$;

-- Whether this password is the current one or one of the last p_count (service role: the password-change function).
-- extensions.crypt(password, hash) re-hashes with the stored salt, exactly as Supabase Auth checks a sign-in.
create function public.password_reused(p_user uuid, p_password text, p_count int) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from (
      select encrypted_password as hash from auth.users where id = p_user and coalesce(encrypted_password, '') <> ''
      union all
      (select hash from app.password_history where user_id = p_user order by replaced_at desc limit greatest(p_count, 0))
    ) h
    where extensions.crypt(p_password, h.hash) = h.hash)
$$;
revoke execute on function public.password_reused(uuid, text, int) from public, anon, authenticated;
grant execute on function public.password_reused(uuid, text, int) to service_role;

-- 6. Wrong passwords and the lock -----------------------------------------------------------------------------------------
create table app.password_failures (email text not null, at timestamptz not null default now());
create index on app.password_failures (email, at);
revoke all on app.password_failures from public, anon, authenticated;

-- Called by the app after a wrong email or password. Says nothing back, so it can't be used to find accounts. After the
-- policy's number of tries in 15 minutes the email's password sign-in is locked for the policy's minutes.
-- ponytail: counted from the app only. ceiling: a direct call to Supabase Auth isn't counted (still meets Supabase's own
-- rate limits, and a locked or expired account still gets no session). upgrade: the Password Verification Attempt hook
-- (Supabase Team plan) if the school moves to it.
create function public.password_sign_in_failed(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  em text := lower(btrim(coalesce(p_email, '')));
  pol public.password_policy;
  pid uuid;
begin
  if em = '' or length(em) > 254 then return; end if;
  select id into pid from public.profiles where lower(email) = em and active limit 1;
  if pid is null then return; end if;
  -- Already locked: nothing to count, and the lock is never extended, so it can't be held shut by repeated calls.
  if exists (select 1 from public.profiles where id = pid and locked_until > now()) then return; end if;
  select * into pol from public.password_policy;
  delete from app.password_failures where email = em and at < now() - interval '15 minutes';
  insert into app.password_failures (email) values (em);
  if (select count(*) from app.password_failures where email = em) >= pol.max_failed then
    update public.profiles set locked_until = now() + make_interval(mins => pol.lock_minutes) where id = pid;
    delete from app.password_failures where email = em;
  end if;
end $$;
revoke execute on function public.password_sign_in_failed(text) from public;
grant execute on function public.password_sign_in_failed(text) to anon, authenticated;

-- 7. The Custom Access Token hook (Supabase → Authentication → Hooks) ----------------------------------------------------
-- Runs whenever Supabase Auth issues or renews a session.
--   * Recovery links, magic links, invites, email changes and email sign-ups are never used by the app, and would let
--     someone who controls an email address set a password; they are always refused, and so is renewing such a session.
--   * A password sign-in is refused when the account is locked, email sign-in is off, or a temporary password expired;
--     a renewal of a password session stops once its temporary password expired or email sign-in was turned off.
--     Locked and off answer exactly like a wrong password, so a guess can't be confirmed while locked.
--   * WhatsApp-code sessions ('otp') pass untouched, even when the email sign-in is locked.
create function public.access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  method text := event ->> 'authentication_method';
  amr jsonb := coalesce(event -> 'claims' -> 'amr', '[]');
  banned constant text[] := array['recovery', 'magiclink', 'invite', 'email_change', 'email/signup'];
  by_password boolean;
  p public.profiles;
begin
  if method = any (banned) or (method = 'token_refresh' and exists (
       select 1 from jsonb_array_elements(case when jsonb_typeof(amr) = 'array' then amr else '[]' end) a
       where a ->> 'method' = any (banned))) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'method_not_allowed: Sign in with your mobile number.'));
  end if;
  by_password := method = 'password' or (method = 'token_refresh' and amr @> '[{"method":"password"}]');
  if not by_password then return event; end if;
  select * into p from public.profiles where user_id = (event ->> 'user_id')::uuid;
  if p.id is null or p.email_sign_in = 'none' or (method = 'password' and p.locked_until > now()) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Invalid login credentials'));
  end if;
  if p.email_sign_in = 'temporary' and coalesce(p.temp_password_expires_at, '-infinity') <= now() then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'temporary_expired: This temporary password has expired. Ask the school for a new one.'));
  end if;
  return event;
end $$;
revoke execute on function public.access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.access_token_hook(jsonb) to supabase_auth_admin;

-- A good password sign-in clears its wrong tries. Separate from the hook, which must not write; the app calls it.
create function public.password_sign_in_ok() returns void
language sql security definer set search_path = '' as $$
  delete from app.password_failures where email = (select lower(email) from public.profiles where user_id = auth.uid());
$$;
revoke execute on function public.password_sign_in_ok() from public, anon;
grant execute on function public.password_sign_in_ok() to authenticated;

-- 8. whoami also says when a temporary password ends -----------------------------------------------------------------
create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile_id', p.id,
    'full_name', p.full_name,
    'phone', p.phone,
    'email', p.email,
    'email_sign_in', p.email_sign_in,
    'temp_password_expires_at', p.temp_password_expires_at,
    'active', p.active and p.app_access,
    'consent_version', p.consent_version,
    'roles', coalesce((select jsonb_agg(r.role order by r.role) from public.staff_roles r where r.profile_id = p.id), '[]'::jsonb),
    'children', (select count(*) from public.guardianships g join public.children c on c.id = g.child_id
                 where g.guardian_id = p.id and c.active)
  )
  from public.profiles p where p.user_id = auth.uid()
$$;
