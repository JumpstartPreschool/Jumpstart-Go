-- Email codes only where they're needed (AUTH-1): the first sign-in, before someone has a password, and a forgotten
-- password. Someone who already has a password gets no first-sign-in code, so the school's daily email allowance goes
-- to people who need it. The screen reads the same either way, so nobody can learn who has an account.

-- p_purpose: 'first' (First time here) or 'reset' (Forgot password). Same rules as before, plus: 'first' is refused
-- once the person has set a password.
create function public.login_allowed(p_email text, p_purpose text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text := lower(btrim(coalesce(p_email, '')));
  person uuid;
begin
  if p_purpose is null or p_purpose not in ('first', 'reset') or length(address) not between 3 and 254 then
    return false;
  end if;
  select user_id into person from public.profiles where active and app_access and lower(email) = address limit 1;
  if not found then return false; end if;
  if p_purpose = 'first' and exists (select 1 from auth.users u where u.id = person and coalesce(u.encrypted_password, '') <> '') then
    return false;
  end if;
  perform app.throttle('login:' || address, 10, interval '1 hour');
  return true;
end $$;

-- The one-argument version, for app builds from before this migration: it keeps the old behaviour (any code allowed).
create or replace function public.login_allowed(p_email text) returns boolean
language sql volatile security definer set search_path = '' as $$
  select public.login_allowed(p_email, 'reset')
$$;

revoke execute on function public.login_allowed(text, text) from public;
grant execute on function public.login_allowed(text, text) to anon, authenticated;
