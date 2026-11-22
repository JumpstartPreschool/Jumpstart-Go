-- Password sign-in (AUTH-1). People sign in with their email and a password; an email code is only for the first
-- sign-in and for a forgotten password. Supabase Auth keeps the password (hashed in auth.users); nothing is copied here.

-- Whether the signed-in person has set a password, so the app asks for one right after their first email code.
-- Null when it can't be read: the app then offers to set one, which is harmless.
create function app.has_password() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select coalesce(u.encrypted_password, '') <> '' from auth.users u where u.id = auth.uid());
exception when insufficient_privilege or undefined_column then
  return null;
end $$;
revoke execute on function app.has_password() from public;

-- whoami also reports app access as part of "active": a password sign-in skips the email-code check (login_allowed),
-- so someone whose app access was turned off now sees "Access turned off" instead of empty screens. Row-level
-- security already refused them either way (app.me() requires active and app_access).
create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile_id', p.id,
    'full_name', p.full_name,
    'active', p.active and p.app_access,
    'consent_version', p.consent_version,
    'roles', coalesce((select jsonb_agg(r.role order by r.role) from public.staff_roles r where r.profile_id = p.id), '[]'::jsonb),
    'children', (select count(*) from public.guardianships g join public.children c on c.id = g.child_id
                 where g.guardian_id = p.id and c.active),
    'has_password', app.has_password()
  )
  from public.profiles p where p.user_id = auth.uid()
$$;
