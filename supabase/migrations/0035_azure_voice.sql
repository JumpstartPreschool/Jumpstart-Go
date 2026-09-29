-- 0035: the gate voice is made by Microsoft Azure AI Speech (D50) instead of the school's computer (0030–0032), and a
-- parent can say "I've arrived". Each child's announcements are still made ahead of time and kept (0030's queue and the
-- private voice-audio bucket), so a parent's tap never waits for a voice to be made.
-- 1. The school computer's self-registration and tunnel address go (0032).
-- 2. Class names and guardians' names are no longer spoken (the announcement names the child and the relation), so a
--    renamed class or person no longer remakes clips. A new child, name, relation or pronunciation still does.
-- 3. voice_usage counts the characters sent to Azure each month and day, with a hard cap under the free tier
--    (0.5 million a month). voice_spend() replaces voice_allowed() and voice_make_allowed() for staff previews and the
--    rare sentence made live; public.voice_count() is the background maker's own count (service role only).
-- 4. voice_version(): the voice the clips are made in, set by the pronounce function from its configuration, so iPads
--    look clips up under the right voice and drop the old ones when it changes.
-- 5. trips.arrived_at and arrive_trip(): the parent taps "I've arrived"; the gate announces it and gets a notification.
-- 6. Every child's clips are made again in the new voice and wording, a few at a time by the minute job.

drop function public.voice_register(text), public.voice_tts_url();
alter table app.voice_config drop column tts_url, drop column tts_seen_at;

drop trigger voice on public.classes;
drop trigger voice on public.profiles;
drop function app.voice_on_class(), app.voice_on_person();

drop function public.voice_allowed(), public.voice_make_allowed();

-- 3. Characters sent to Azure, by month (the cap) and by day (for the admin). UTC, as Azure bills.
create table public.voice_usage (month date primary key check (month = date_trunc('month', month)), chars int not null check (chars >= 0));
create table public.voice_usage_days (day date primary key, chars int not null check (chars >= 0));
alter table public.voice_usage enable row level security;
alter table public.voice_usage_days enable row level security;
create policy admin_read on public.voice_usage for select to authenticated using (app.has_role('admin'));
create policy admin_read on public.voice_usage_days for select to authenticated using (app.has_role('admin'));
revoke all on public.voice_usage, public.voice_usage_days from anon, authenticated;
grant select on public.voice_usage, public.voice_usage_days to authenticated;

/**
 * Adds p_chars to this month's Azure count if it stays at or under the cap, in one statement so two callers at once
 * can't pass it. True: go ahead. False: the cap is reached, so Azure is not called.
 */
create function public.voice_count(p_chars int) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  cap constant int := 450000;
  today date := (now() at time zone 'utc')::date;
  total int;
begin
  if p_chars is null or p_chars < 1 or p_chars > 1000 then
    raise exception 'bad_length: A voice request is 1 to 1000 characters.' using errcode = 'P0001';
  end if;
  insert into public.voice_usage as u (month, chars) values (date_trunc('month', today), p_chars)
  on conflict (month) do update set chars = u.chars + excluded.chars where u.chars + excluded.chars <= cap
  returning u.chars into total;
  if total is null or total > cap then return false; end if;
  insert into public.voice_usage_days as d (day, chars) values (today, p_chars)
  on conflict (day) do update set chars = d.chars + excluded.chars;
  return true;
end $$;
revoke all on function public.voice_count(int) from public, anon, authenticated;

/**
 * The pronounce function asks this, as the staff member, before making a sentence live (a pronunciation preview, or a
 * sentence not made ahead). Raises for anyone who isn't staff (42501), a bad length, or more than 300 an hour.
 */
create function public.voice_spend(p_chars int) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'Only school staff can make announcements.' using errcode = '42501';
  end if;
  if p_chars is null or p_chars < 1 or p_chars > 400 then
    raise exception 'bad_length: An announcement sentence is 1 to 400 characters.' using errcode = 'P0001';
  end if;
  perform app.throttle('voice:' || app.me(), 300, interval '1 hour');
  return public.voice_count(p_chars);
end $$;
revoke all on function public.voice_spend(int) from public, anon;
grant execute on function public.voice_spend(int) to authenticated;

-- 4. The voice the clips are made in (written by the pronounce function as voice_meta 'voice'). Null before the first run.
create function public.voice_version() returns text
language sql stable security definer set search_path = '' as $$
  select m.value from public.voice_meta m where m.key = 'voice' and app.is_staff()
$$;
revoke all on function public.voice_version() from public, anon;
grant execute on function public.voice_version() to authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.voice_count(int) to service_role;
  end if;
end $$;

-- 5. "I've arrived", from the child's parent or family (or the school on their behalf). Once per trip.
alter table public.trips add column arrived_at timestamptz;

create function public.arrive_trip(p_trip uuid) returns public.trips
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or not (app.is_guardian_of(t.child_id) or app.has_role('admin', 'core')) then
    raise exception 'Only this child''s parents or the school can do this.' using errcode = '42501';
  end if;
  if t.status <> 'en_route' then
    raise exception 'This trip is already finished.' using errcode = 'P0001';
  end if;
  if t.arrived_at is not null then return t; end if;
  update public.trips set arrived_at = now(), updated_at = now() where id = p_trip returning * into t;
  return t;
end $$;
revoke all on function public.arrive_trip(uuid) from public, anon;
grant execute on function public.arrive_trip(uuid) to authenticated;

-- The gate hears about an arrival on its iPads' notifications too.
create function app.push_on_arrival() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.arrived_at is not null and old.arrived_at is null and new.status = 'en_route' then
    perform app.notify(app.coordinators_for(new.child_id),
      format('%s has arrived', coalesce(nullif(split_part(new.traveller_name, ' ', 1), ''), 'The collector')),
      format('%s for %s.', case new.direction when 'pickup' then 'Pickup' else 'Drop-off' end,
        (select full_name from public.children where id = new.child_id)),
      '/coordinator', 'trip-' || new.id);
  end if;
  return null;
end $$;
revoke all on function app.push_on_arrival() from public, anon, authenticated;
create trigger push_on_arrival after update of arrived_at on public.trips for each row execute function app.push_on_arrival();

-- 6. New voice and wording: every child's clips are made again (the pronounce function also does this whenever its
-- configured voice or the wording changes).
select app.voice_requeue(array(select child_id from public.child_pronunciations));
