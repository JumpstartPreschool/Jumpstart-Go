-- Fixes from the production audit (2026-09-25).

-- 1. Programmes, attendance, regular times and holidays change only through their functions, which check who may do
-- what (0013, 0019). The first migration also let the core team write these tables directly, which skipped those
-- checks (renaming a programme, changing the Learning Center, marking attendance in a parent's name).
drop policy if exists planner_write on public.programmes;
drop policy if exists planner_write on public.holidays;
drop policy if exists planner_write on public.child_schedules;
drop policy if exists planner_write on public.attendance;
revoke insert, update, delete on public.programmes, public.holidays, public.child_schedules, public.attendance from authenticated;

-- 2. A trip changed without a sign-in can only come through a collector's link, so it's limited per trip. (The check
-- on current_user never matched: inside a security definer function it's the function's owner.)
create or replace function app.throttle_trip() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.arrive_at is distinct from old.arrive_at then
    if app.me() is not null then perform app.throttle('trip:' || app.me(), 40, interval '1 minute');
    else perform app.throttle('link:' || new.id, 6, interval '1 hour');
    end if;
  end if;
  return new;
end $$;

-- 3. Sign-in codes: at most 5 an hour for one email, so nobody can flood a parent's inbox or use up the school's daily
-- email allowance. Still says only whether the email may sign in (J11).
create or replace function public.login_allowed(p_email text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  ok boolean := length(btrim(coalesce(p_email, ''))) between 3 and 254
    and exists (select 1 from public.profiles where active and app_access and lower(email) = lower(btrim(p_email)));
begin
  if ok then perform app.throttle('login:' || lower(btrim(p_email)), 5, interval '1 hour'); end if;
  return ok;
end $$;

-- 4. Retention (PRD D9, and what the consent notice promises): trips and their location 30 days; attendance for this
-- and last academic year (years start 1 June); the audit log 1 year; rate-limit records 1 day. Daily at
-- 03:15 India time when pg_cron is on; environments.md says to run this block again after turning pg_cron on.
create function app.purge_old_records() returns void
language sql security definer set search_path = '' as $$
  delete from public.trip_points where received_at < now() - interval '30 days';
  delete from public.trips where day < (now() at time zone 'Asia/Kolkata')::date - 30;
  delete from public.attendance where day < (
    select make_date(extract(year from d)::int - case when extract(month from d) >= 6 then 1 else 2 end, 6, 1)
    from (select (now() at time zone 'Asia/Kolkata')::date as d) today);
  delete from public.audit_log where at < now() - interval '1 year';
  delete from app.throttle_log where at < now() - interval '1 day';
$$;
revoke all on function app.purge_old_records() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'purge-trip-points') then perform cron.unschedule('purge-trip-points'); end if;
    perform cron.schedule('purge-old-records', '45 21 * * *', 'select app.purge_old_records()');
  end if;
end $$;
