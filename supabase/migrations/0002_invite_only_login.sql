-- M1: invite-only login (PRD D1, AUTH-1, AUTH-3, AUTH-6).
-- The admin creates a person before they ever sign in. Their first email code creates an auth account,
-- which the database links to the waiting profile. Anyone not invited is refused by the database itself,
-- whatever the client does. Deactivating someone ends their access at once and signs them out.

-- Profiles no longer share the auth user's id: they exist before the first login.
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles add column user_id uuid unique references auth.users (id) on delete set null;
alter table public.staff_roles rename column user_id to profile_id;
alter table public.coordinator_classes rename column user_id to profile_id;

-- The signed-in person's profile, or null when not linked or deactivated.
create function app.me() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles where user_id = auth.uid() and active
$$;

create or replace function app.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.me() is not null
$$;

create or replace function app.has_role(variadic roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_roles r where r.profile_id = app.me() and r.role = any (roles))
$$;

create or replace function app.is_guardian_of(child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.guardianships g where g.child_id = child and g.guardian_id = app.me())
$$;

-- Policies that compared ids directly with auth.uid() now go through the profile link.
drop policy read on public.profiles;
create policy read on public.profiles for select to authenticated using (user_id = auth.uid() or app.is_staff());
drop policy read on public.staff_roles;
create policy read on public.staff_roles for select to authenticated using (profile_id = app.me() or app.is_staff());
drop policy read on public.guardianships;
create policy read on public.guardianships for select to authenticated using (app.is_staff() or guardian_id = app.me());

-- Invite-only, enforced where accounts are created. Supabase stores phones without the leading +.
create function app.invited_profile(p_email text, p_phone text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles
  where active and user_id is null
    and ((p_email is not null and lower(email) = lower(p_email))
      or (p_phone is not null and phone = '+' || ltrim(p_phone, '+')))
  limit 1
$$;

create function app.guard_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.invited_profile(new.email, new.phone) is null then
    raise exception 'not_invited: this email or phone number is not registered with Jumpstart';
  end if;
  return new;
end $$;

create function app.link_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set user_id = new.id where id = app.invited_profile(new.email, new.phone);
  return null;
end $$;

create trigger guard_invite_only before insert on auth.users for each row execute function app.guard_new_auth_user();
create trigger link_invited_profile after insert on auth.users for each row execute function app.link_new_auth_user();

-- Deactivating someone signs them out everywhere (AUTH-3). Their access already stops at once,
-- because every policy checks that the profile is active; this also ends their saved sessions.
create function app.end_sessions_on_deactivate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.active and not new.active and new.user_id is not null then
    begin
      delete from auth.sessions where user_id = new.user_id;
    exception when insufficient_privilege or undefined_table then
      null; -- access is still refused by row-level security
    end;
  end if;
  return new;
end $$;
create trigger end_sessions_on_deactivate after update of active on public.profiles
for each row execute function app.end_sessions_on_deactivate();

-- Called by the login screen before sending a code, so an unregistered address gets a clear message (J11).
-- ponytail: reveals whether an address is registered, which J11 accepts; Supabase Auth rate-limits the codes.
create function public.login_allowed(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select length(btrim(coalesce(p_email, ''))) between 3 and 254
     and exists (select 1 from public.profiles where active and lower(email) = lower(btrim(p_email)))
$$;

-- Everything the app needs to route a signed-in person, in one call. Null when not linked.
create function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile_id', p.id,
    'full_name', p.full_name,
    'active', p.active,
    'consent_version', p.consent_version,
    'roles', coalesce((select jsonb_agg(r.role order by r.role) from public.staff_roles r where r.profile_id = p.id), '[]'::jsonb),
    'children', (select count(*) from public.guardianships g join public.children c on c.id = g.child_id
                 where g.guardian_id = p.id and c.active)
  )
  from public.profiles p where p.user_id = auth.uid()
$$;

create function public.accept_consent(p_version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_version is null or p_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Consent version must be a date (YYYY-MM-DD)' using errcode = 'check_violation';
  end if;
  update public.profiles set consent_version = p_version, consent_at = now() where user_id = auth.uid() and active;
end $$;

revoke execute on all functions in schema app from public;
grant execute on function app.me(), app.is_active(), app.has_role(public.app_role[]), app.is_staff(), app.is_guardian_of(uuid) to authenticated;
revoke execute on function public.login_allowed(text), public.whoami(), public.accept_consent(text) from public;
grant execute on function public.login_allowed(text) to anon, authenticated;
grant execute on function public.whoami(), public.accept_consent(text) to authenticated;
