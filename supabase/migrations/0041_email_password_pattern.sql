-- 0041: Email and password sign-in, alongside the mobile number and WhatsApp code (owner, 2026-10-03).
--
-- How it works
--   * The mobile number and WhatsApp code stay the main way in. Anyone whose record has an email can also sign in with
--     that email and a password.
--   * The admin sets one password pattern (Settings → Email sign-in) built from words in each email, like
--     {First}@{domain}#2026. Saving a pattern sets every email account's password to it at once (the password-pattern
--     function), so old passwords stop working and the new ones work straight away.
--   * A password made by the pattern is a starting password: after signing in with it, the app asks the person to
--     choose their own. profiles.email_sign_in says which they have: 'none', 'pattern' or 'own'.
--   * Passwords live only in Supabase Auth (hashed in auth.users). The pattern is readable by the admin only.
--
-- Also removes the on-screen sign-in code (0040). It showed the code to whoever typed a number and handed back one
-- shared password, so anyone could sign in as anyone.

-- 1. The on-screen code is gone -------------------------------------------------------------------------------------------
drop function if exists public.request_screen_otp(text);
drop function if exists public.verify_screen_otp(text, text);
drop table if exists app.screen_otps;

-- Every password set before this migration stops working: the shared one 0040 handed out, and any from 0033. Email
-- sign-in starts only from the admin's pattern. Runs before the trigger below exists, so nobody is marked 'own'.
update auth.users set encrypted_password = '' where coalesce(encrypted_password, '') <> '';

-- 2. Which password someone has -------------------------------------------------------------------------------------------
alter table public.profiles add column email_sign_in text not null default 'none'
  check (email_sign_in in ('none', 'pattern', 'own'));

-- Someone setting their own password (Supabase Auth writes the new hash) moves them to 'own'. The password-pattern
-- function writes the hash first and marks 'pattern' afterwards, so its own writes end up as 'pattern'.
create function app.password_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email_sign_in = 'own'
  where user_id = new.id and email_sign_in <> 'own' and coalesce(new.encrypted_password, '') <> '';
  return null;
end $$;
revoke execute on function app.password_changed() from public;
create trigger password_changed after update of encrypted_password on auth.users
  for each row when (old.encrypted_password is distinct from new.encrypted_password)
  execute function app.password_changed();

-- 3. The pattern ----------------------------------------------------------------------------------------------------------
-- One row. Written only through admin_save_password_pattern; read by the admin only (row-level security).
create table public.password_pattern (
  id boolean primary key default true check (id),
  pattern text not null check (length(btrim(pattern)) between 1 and 64),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id) on delete set null
);
alter table public.password_pattern enable row level security;
create policy admin_read on public.password_pattern for select to authenticated using (app.has_role('admin'));
grant select on public.password_pattern to authenticated;
create trigger audit after insert or update or delete on public.password_pattern for each row execute function app.audit();

-- Everyone whose email password the pattern decides: active parents and family with app access and an email ("set"),
-- and anyone still on an old pattern password who no longer qualifies ("clear", so that password stops working too).
-- Staff are never set: anyone who learned the pattern from their own starting password could work out the admin's.
-- Staff sign in with their mobile number and WhatsApp code.
create function app.pattern_eligible(p public.profiles) returns boolean
language sql stable security definer set search_path = '' as $$
  select p.active and p.app_access and p.email is not null
    and not exists (select 1 from public.staff_roles r where r.profile_id = p.id)
$$;
revoke execute on function app.pattern_eligible(public.profiles) from public;

create function app.password_targets(p_profile uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', p.id, 'user_id', p.user_id, 'full_name', p.full_name, 'email', p.email, 'phone', p.phone,
    'action', case when app.pattern_eligible(p) then 'set' else 'clear' end
  ) order by p.full_name), '[]'::jsonb)
  from public.profiles p
  where (p_profile is null or p.id = p_profile)
    and (app.pattern_eligible(p) or (p.email_sign_in <> 'none' and p.user_id is not null))
$$;
revoke execute on function app.password_targets(uuid) from public;

-- Saves the pattern and returns everyone it applies to. The password-pattern function calls this as the admin (so the
-- admin check and the audit log name them), checks the pattern's shape first, then sets each password.
create function public.admin_save_password_pattern(p_pattern text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pat text := btrim(coalesce(p_pattern, ''));
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can change the password pattern.' using errcode = '42501';
  end if;
  if length(pat) not between 1 and 64 then
    raise exception 'bad_pattern: Type a pattern under 64 characters.' using errcode = 'P0001';
  end if;
  insert into public.password_pattern (id, pattern, changed_at, changed_by) values (true, pat, now(), app.me())
  on conflict (id) do update set pattern = excluded.pattern, changed_at = now(), changed_by = excluded.changed_by;
  return app.password_targets();
end $$;
revoke execute on function public.admin_save_password_pattern(text) from public, anon;
grant execute on function public.admin_save_password_pattern(text) to authenticated;

-- One person, back to the current pattern (a forgotten password, or a new email). Admin only.
create function public.admin_password_target(p_profile uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  pat text;
  t jsonb;
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can reset passwords.' using errcode = '42501';
  end if;
  select pattern into pat from public.password_pattern;
  if pat is null then
    raise exception 'no_pattern: Set the password pattern in Settings first.' using errcode = 'P0001';
  end if;
  t := app.password_targets(p_profile) -> 0;
  if t is null or t ->> 'action' <> 'set' then
    raise exception 'no_email: Only parents and family with an email and app access get a pattern password. Staff sign in with their mobile number.' using errcode = 'P0001';
  end if;
  return jsonb_build_object('pattern', pat, 'target', t);
end $$;
revoke execute on function public.admin_password_target(uuid) from public, anon;
grant execute on function public.admin_password_target(uuid) to authenticated;

-- After the function has set (or cleared) a password: link a newly made account and record which password they have.
-- Service role only.
create function public.mark_email_sign_in(p_profile uuid, p_user uuid, p_state text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_state not in ('none', 'pattern') then
    raise exception 'bad_state' using errcode = 'P0001';
  end if;
  update public.profiles set user_id = coalesce(user_id, p_user), email_sign_in = p_state where id = p_profile;
end $$;
revoke execute on function public.mark_email_sign_in(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_email_sign_in(uuid, uuid, text) to service_role;

-- 4. Accounts made by the school, by email ----------------------------------------------------------------------------
-- A phone code still makes someone's account at their first sign-in. An account with an email is made only by the
-- password-pattern function, which marks it in app_metadata; nobody can set that from the sign-up form, so an
-- invited parent's email can't be claimed by someone else signing up with it.
create function app.invited_profile(p_phone text, p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles
  where active and app_access and user_id is null
    and ((p_phone is not null and phone = '+' || ltrim(p_phone, '+')) or (p_email is not null and lower(email) = lower(p_email)))
  order by (p_phone is not null and phone = '+' || ltrim(p_phone, '+')) desc
  limit 1
$$;
revoke execute on function app.invited_profile(text, text) from public;

create or replace function app.guard_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and coalesce(new.raw_app_meta_data ->> 'provisioned', '') <> 'school' then
    raise exception 'not_invited: email accounts are made by the school';
  end if;
  if app.invited_profile(new.phone, new.email) is null then
    raise exception 'not_invited: this mobile number is not registered with Jumpstart';
  end if;
  return new;
end $$;

create or replace function app.link_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set user_id = new.id where id = app.invited_profile(new.phone, new.email);
  return null;
end $$;
drop function app.invited_profile(text);

-- 5. A new email on a signed-in person ------------------------------------------------------------------------------------
-- Their sign-in email follows the record. Any password they didn't choose themselves is removed (a pattern password was
-- made from the old email); the admin sets the new one with Reset password or the next pattern save.
create function app.sync_auth_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is null then return new; end if;
  if new.email is not null and exists (select 1 from auth.users where lower(email) = lower(new.email) and id <> new.user_id) then
    raise exception 'taken: Another sign-in already uses that email.' using errcode = 'P0001';
  end if;
  update auth.users
  set email = new.email,
      email_confirmed_at = case when new.email is null then null else coalesce(email_confirmed_at, now()) end,
      encrypted_password = case when new.email is null or old.email_sign_in <> 'own' then '' else encrypted_password end
  where id = new.user_id;
  if new.email is null or old.email_sign_in <> 'own' then
    new.email_sign_in := 'none';
  end if;
  return new;
end $$;
revoke execute on function app.sync_auth_email() from public;
create trigger sync_auth_email before update of email on public.profiles
  for each row when (old.email is distinct from new.email) execute function app.sync_auth_email();

-- 6. whoami says which password someone has, so the app can ask them to choose their own -------------------------------
create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile_id', p.id,
    'full_name', p.full_name,
    'phone', p.phone,
    'email', p.email,
    'email_sign_in', p.email_sign_in,
    'active', p.active and p.app_access,
    'consent_version', p.consent_version,
    'roles', coalesce((select jsonb_agg(r.role order by r.role) from public.staff_roles r where r.profile_id = p.id), '[]'::jsonb),
    'children', (select count(*) from public.guardianships g join public.children c on c.id = g.child_id
                 where g.guardian_id = p.id and c.active)
  )
  from public.profiles p where p.user_id = auth.uid()
$$;
