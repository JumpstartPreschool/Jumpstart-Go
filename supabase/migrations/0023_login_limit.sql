-- Sign-in codes: 10 an hour for one email (was 5 in 0021), so someone who mistypes a code or loses an email isn't
-- locked out, while nobody can flood a parent's inbox. Supabase also allows only one code a minute per email.
create or replace function public.login_allowed(p_email text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  ok boolean := length(btrim(coalesce(p_email, ''))) between 3 and 254
    and exists (select 1 from public.profiles where active and app_access and lower(email) = lower(btrim(p_email)));
begin
  if ok then perform app.throttle('login:' || lower(btrim(p_email)), 10, interval '1 hour'); end if;
  return ok;
end $$;
