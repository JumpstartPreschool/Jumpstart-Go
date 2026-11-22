-- 0036: the person collecting with a one-time link can say "I've arrived" too (like a parent, 0035), and two small
-- fixes to the gate voice's bookkeeping.
-- 1. link_arrive(): from the link page, on the phone that confirmed the link (app.link_for_device). Once per trip.
-- 2. The link page hears about it: link_summary() also returns arrived_at.
-- 3. The voice minute job wakes only for active children still waiting (inactive ones are never made, 0030's
--    voice_claim skips them), so it no longer runs every minute for nothing.
-- 4. voice_spend(0): the staff check and hourly limit without counting characters, for a preview already made.

create or replace function app.link_summary(t public.trips, l app.trip_links, p_with_code boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'child', coalesce(c.preferred_name, split_part(c.full_name, ' ', 1)),
    'direction', t.direction, 'status', t.status, 'arrive_at', t.arrive_at, 'ready_at', t.ready_at, 'closed_at', t.closed_at,
    'home_at', t.home_at, 'collector', t.traveller_name, 'relation', t.traveller_relation, 'sharing', t.sharing,
    'arrived_at', t.arrived_at,
    'confirmed', l.confirmed_at is not null, 'locked', l.locked_at is not null,
    'school_phone', (select s.school_phone from public.settings s limit 1),
    'code', case when p_with_code then l.code end)
  from public.children c where c.id = t.child_id
$$;

create function public.link_arrive(p_token text, p_device text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  t public.trips;
begin
  select * into r from app.link_for_device(p_token, p_device);
  t := r.trip;
  if t.status <> 'en_route' then
    raise exception 'trip_closed: The child has already been handed over.' using errcode = 'P0001';
  end if;
  if t.arrived_at is null then
    update public.trips set arrived_at = app.clock(), updated_at = app.clock() where id = t.id returning * into t;
  end if;
  return app.link_summary(t, r.link, true);
end $$;
revoke all on function public.link_arrive(text, text) from public;
grant execute on function public.link_arrive(text, text) to anon, authenticated;

do $$ begin
  -- Dynamic SQL: cron.job doesn't exist where pg_cron isn't installed (local tests).
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = ''voice-drain''';
    perform cron.schedule('voice-drain', '* * * * *', $job$
      select net.http_post(url := c.url, headers := jsonb_build_object('Authorization', 'Bearer ' || c.secret, 'Content-Type', 'application/json'), body := '{"drain":true}'::jsonb)
      from app.voice_config c
      where extract(minute from now())::int % 10 = 0
         or exists (select 1 from public.child_pronunciations p join public.children ch on ch.id = p.child_id and ch.active
                    where (p.audio_status = 'pending' and p.next_attempt_at <= now())
                       or (p.audio_status = 'generating' and p.claimed_at < now() - interval '10 minutes'))
    $job$);
  end if;
end $$;

create or replace function public.voice_spend(p_chars int) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'Only school staff can make announcements.' using errcode = '42501';
  end if;
  if p_chars is null or p_chars < 0 or p_chars > 400 then
    raise exception 'bad_length: An announcement sentence is 1 to 400 characters.' using errcode = 'P0001';
  end if;
  perform app.throttle('voice:' || app.me(), 300, interval '1 hour');
  -- 0: a clip already made (nothing is sent to Azure), so nothing is counted.
  return p_chars = 0 or public.voice_count(p_chars);
end $$;
