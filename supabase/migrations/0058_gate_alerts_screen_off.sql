-- 0058: gate alerts that reach a locked or switched-off screen.
--   1. Native phones (the Android app, later iOS) register a push token next to the web push subscriptions.
--   2. push_claim hands push-send one row per alert and device, web and native.
--   3. A gate alert shows the child's first name only on the lock screen.
--   4. Duty sessions are kept on the server (started_at), so the server knows who is on duty today.
--   5. The server repeats an unacknowledged gate alert every reminder_min minutes (gate_announcement_settings), up to 30
--      times, to the coordinators on duty (everyone covering the child when nobody is on duty). Acknowledging stops it.
--   6. A device on duty that goes silent is reported to the Center Leaders once.

-- 1. Native device tokens -----------------------------------------------------------------------------------------------------
create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  token text not null unique check (length(token) between 20 and 4096),
  app_version text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index on public.device_tokens (profile_id);
alter table public.device_tokens enable row level security;
create policy own_select on public.device_tokens for select to authenticated using (profile_id = app.me());
create policy own_delete on public.device_tokens for delete to authenticated using (profile_id = app.me());
revoke all on public.device_tokens from public, anon, authenticated;
grant select, delete on public.device_tokens to authenticated;

-- Like a web subscription, a token moves to whoever signs in on that phone. A person keeps their 10 newest phones.
create function public.save_device_token(p_platform text, p_token text, p_app_version text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_platform not in ('android', 'ios') or p_token is null or length(p_token) not between 20 and 4096 then
    raise exception 'That device cannot receive notifications.' using errcode = 'P0001';
  end if;
  insert into public.device_tokens (profile_id, platform, token, app_version)
  values (app.me(), p_platform, p_token, left(p_app_version, 40))
  on conflict (token) do update set profile_id = excluded.profile_id, platform = excluded.platform,
    app_version = excluded.app_version, last_seen_at = now();
  delete from public.device_tokens where profile_id = app.me()
    and id not in (select id from public.device_tokens where profile_id = app.me() order by last_seen_at desc, created_at desc limit 10);
end $$;

create function public.delete_device_token(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.device_tokens where token = p_token and profile_id = app.me()
$$;

-- Firebase says this token is no longer registered (push-send).
create function public.push_forget_token(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.device_tokens where token = p_token
$$;

-- 2. Reachable means a web subscription or a phone token ---------------------------------------------------------------------
create or replace function app.notify(p_people uuid[], p_title text, p_body text, p_url text, p_tag text) returns void
language sql security definer set search_path = '' as $$
  insert into app.push_outbox (profile_id, title, body, url, tag)
  select p.id, left(p_title, 120), left(p_body, 240), p_url, p_tag
  from public.profiles p
  where p.id = any (p_people) and p.active and p.app_access
    and (exists (select 1 from public.push_subscriptions s where s.profile_id = p.id)
      or exists (select 1 from public.device_tokens d where d.profile_id = p.id))
$$;

-- 3. push_claim: one row per alert and device (the claim, attempts and requeue rules are 0046's) -----------------------------------
drop function public.push_claim(int);
create function public.push_claim(p_limit int default 100)
returns table (outbox_id bigint, title text, body text, url text, tag text, platform text, subscription_id uuid, endpoint text, p256dh text, auth text, token text)
language sql security definer set search_path = '' as $$
  select app.push_requeue_stuck();
  with batch as (
    update app.push_outbox o set sent_at = now(), result = 'sending', attempts = o.attempts + 1
    where o.id in (select id from app.push_outbox where sent_at is null order by id limit p_limit for update skip locked)
    returning o.*
  )
  select b.id, b.title, b.body, b.url, b.tag, 'web'::text, s.id, s.endpoint, s.p256dh, s.auth, null::text
  from batch b join public.push_subscriptions s on s.profile_id = b.profile_id
  union all
  select b.id, b.title, b.body, b.url, b.tag, d.platform, null::uuid, null::text, null::text, null::text, d.token
  from batch b join public.device_tokens d on d.profile_id = b.profile_id
$$;

-- 4. First name only on the lock screen (everything else in these two functions is as it was in 0043 and 0035) ----------------------
create or replace function app.push_on_trip() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  kid text := app.child_first(new.child_id);
  word text := case new.direction when 'pickup' then 'pickup' else 'drop-off' end;
  who text := split_part(new.traveller_name, ' ', 1);
  actor uuid := app.me();
  url text := '/parent';
  -- A late update always moves the time later, so the time it replaced (late_from) changes every time.
  late boolean := tg_op = 'UPDATE' and new.late_from is distinct from old.late_from and new.late_from is not null;
  by_name text := coalesce(split_part((select full_name from public.profiles where id = new.late_by), ' ', 1), who);
begin
  if late and new.status = 'en_route' then
    perform app.notify(app.coordinators_for(new.child_id),
      format('%s %s delayed', kid, word),
      format('%s is now arriving about %s.', coalesce(initcap(new.traveller_relation), who), app.hm(new.arrive_at)),
      '/coordinator', 'trip-' || new.id);
    perform app.notify(app.guardians_to_tell(new.child_id, coalesce(actor, new.late_by), true),
      format('%s''s %s time changed', kid, word),
      format('%s is now arriving about %s.', by_name, app.hm(new.arrive_at)), url, 'trip-' || new.id);
    return null;
  end if;
  -- The gate: a new request or a new time, until someone acknowledges it. The tag replaces the older alert.
  if new.status = 'en_route' and new.acknowledged_at is null and (tg_op = 'INSERT' or new.arrive_at is distinct from old.arrive_at) then
    perform app.notify(app.coordinators_for(new.child_id),
      format('%s, %s at %s', app.child_first(new.child_id), word, app.hm(new.arrive_at)),
      format('%s%s is on the way.%s', who, coalesce(' (' || lower(new.traveller_relation) || ')', ''), case when new.off_schedule then ' Outside the usual time: ' || new.reason || '.' else '' end),
      '/coordinator', 'trip-' || new.id);
  end if;
  -- The family.
  if tg_op = 'INSERT' and new.status = 'en_route' then
    perform app.notify(app.guardians_to_tell(new.child_id, coalesce(actor, new.created_by), true),
      format('%s''s %s: %s is on the way', kid, word, case when new.traveller_kind = 'third_person' then who || ', with a link' else who end),
      format('About %s.%s', app.hm(new.arrive_at), case when new.phoned_in_by is not null then ' Phoned in to the school.' else '' end), url, 'trip-' || new.id);
  elsif tg_op = 'UPDATE' then
    if new.ready_at is not null and old.ready_at is null then
      perform app.notify(app.guardians_to_tell(new.child_id, null, false), format('%s is ready at the gate', kid), format('Ready at %s.', app.hm(new.ready_at)), url, 'trip-' || new.id);
    end if;
    if new.status is distinct from old.status then
      if new.status = 'handed_over' then
        perform app.notify(app.guardians_to_tell(new.child_id, null, false), format('%s has been collected', kid),
          format('At %s, by %s.', app.hm(new.closed_at), coalesce((select full_name from public.profiles where id = new.handed_to), new.handed_to_name)), url, 'trip-' || new.id);
      elsif new.status = 'checked_in' then
        perform app.notify(app.guardians_to_tell(new.child_id, null, false), format('%s is at school', kid), format('Checked in at %s.', app.hm(new.closed_at)), url, 'trip-' || new.id);
      elsif new.status = 'cancelled' then
        perform app.notify(app.guardians_to_tell(new.child_id, actor, true), format('%s''s %s is cancelled', kid, word), 'The gate has been told.', url, 'trip-' || new.id);
      end if;
    end if;
  end if;
  return null;
end $$;

create or replace function app.push_on_arrival() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.arrived_at is not null and old.arrived_at is null and new.status = 'en_route' then
    perform app.notify(app.coordinators_for(new.child_id),
      format('%s has arrived', coalesce(nullif(split_part(new.traveller_name, ' ', 1), ''), 'The collector')),
      format('%s for %s.', case new.direction when 'pickup' then 'Pickup' else 'Drop-off' end,
        app.child_first(new.child_id)),
      '/coordinator', 'trip-' || new.id);
  end if;
  return null;
end $$;

-- 5. Duty sessions on the server ---------------------------------------------------------------------------------------------------
alter table app.gate_duty add column started_at timestamptz not null default now(), add column silent_alerted_at timestamptz;

-- Same answer as 0051 (who was seen in the last 75 seconds). A duty that began on an earlier day starts again today.
create or replace function public.gate_heartbeat(p_on boolean default true) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.me();
begin
  if me is null or not app.is_gate() then
    raise exception 'Only the gate team can go on duty.' using errcode = '42501';
  end if;
  if p_on then
    insert into app.gate_duty (profile_id) values (me)
    on conflict (profile_id) do update set seen_at = now(),
      started_at = case when (app.gate_duty.started_at at time zone 'Asia/Kolkata')::date < (now() at time zone 'Asia/Kolkata')::date then now() else app.gate_duty.started_at end;
  else
    delete from app.gate_duty where profile_id = me;
  end if;
  delete from app.gate_duty where seen_at < now() - interval '1 day';
  return array(select profile_id from app.gate_duty where seen_at > now() - interval '75 seconds');
end $$;

-- 6. Gate alerts repeat until someone acknowledges ------------------------------------------------------------------------------------
create table app.gate_reminders (
  trip_id uuid primary key references public.trips (id) on delete cascade,
  last_at timestamptz not null,
  sent int not null default 0
);
revoke all on app.gate_reminders from public, anon, authenticated;

-- Acknowledging ends the cycle, and new news (a late update, the collector arriving) starts a fresh count, so the cap of 30
-- never silences a later "I've arrived".
create function app.reset_gate_reminders() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from app.gate_reminders where trip_id = new.id;
  return null;
end $$;
create trigger reset_gate_reminders after update of acknowledged_at, arrived_at, late_at on public.trips
  for each row when (old.acknowledged_at is distinct from new.acknowledged_at or old.arrived_at is distinct from new.arrived_at
    or old.late_at is distinct from new.late_at) execute function app.reset_gate_reminders();

-- An open trip today whose latest news the gate has not acknowledged, and that is due another alert. The latest news is the
-- newest of: the request, a late update, the collector arriving, the previous reminder. Returns how many were sent.
create function app.send_gate_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  now_ timestamptz := app.clock();
  every interval := make_interval(mins => coalesce((select reminder_min from public.gate_announcement_settings limit 1), 2));
  n int := 0;
  r record;
  to_tell uuid[];
  on_duty uuid[];
  arrived boolean;
  kid text;
begin
  -- Finished trips need no reminders.
  delete from app.gate_reminders g using public.trips t where t.id = g.trip_id and t.status <> 'en_route';
  for r in
    select t.*, gr.last_at as reminded_at, coalesce(gr.sent, 0) as reminders_sent,
      greatest(t.created_at, t.late_at, t.arrived_at, gr.last_at) as latest
    from public.trips t left join app.gate_reminders gr on gr.trip_id = t.id
    where t.status = 'en_route' and t.day = app.today() and (t.acknowledged_at is null or app.arrived_since_seen(t))
      and coalesce(gr.sent, 0) < 30
  loop
    -- A few seconds of slack so the one-minute job does not skip a round when it runs a moment early.
    continue when r.latest > now_ - every + interval '5 seconds';
    to_tell := app.coordinators_for(r.child_id);
    on_duty := array(select d.profile_id from app.gate_duty d
      where d.profile_id = any (to_tell) and (d.started_at at time zone 'Asia/Kolkata')::date = (now_ at time zone 'Asia/Kolkata')::date);
    if cardinality(on_duty) > 0 then to_tell := on_duty; end if;
    kid := app.child_first(r.child_id);
    arrived := r.arrived_at is not null and (r.acknowledged_at is null or r.arrived_at > r.acknowledged_at);
    perform app.notify(to_tell,
      case when arrived then format('Reminder: %s has arrived for %s', coalesce(nullif(split_part(r.traveller_name, ' ', 1), ''), 'the collector'), kid)
        else format('Reminder: %s, %s at %s', kid, case r.direction when 'pickup' then 'pickup' else 'drop-off' end, app.hm(r.arrive_at)) end,
      format('%s for %s is waiting to be acknowledged.', case r.direction when 'pickup' then 'Pickup' else 'Drop-off' end, kid),
      '/coordinator', 'trip-' || r.id);
    insert into app.gate_reminders (trip_id, last_at, sent) values (r.id, now_, 1)
    on conflict (trip_id) do update set last_at = now_, sent = app.gate_reminders.sent + 1;
    n := n + 1;
  end loop;
  return n;
end $$;

-- 7. A phone on duty that stopped checking in. At most one alert per person every 30 minutes: a web app on an iPad goes silent
-- every time its screen locks, and the leaders must not be flooded.
create function app.alert_silent_duty() returns int
language plpgsql security definer set search_path = '' as $$
declare
  now_ timestamptz := app.clock();
  hm time := (now_ at time zone 'Asia/Kolkata')::time;
  n int := 0;
  r record;
begin
  if hm < time '08:00' or hm > time '19:30' then return 0; end if;
  for r in
    select d.profile_id, split_part(p.full_name, ' ', 1) as first_name from app.gate_duty d join public.profiles p on p.id = d.profile_id
    where (d.started_at at time zone 'Asia/Kolkata')::date = (now_ at time zone 'Asia/Kolkata')::date
      and d.seen_at < now_ - interval '2 minutes'
      and (d.silent_alerted_at is null or (d.silent_alerted_at < now_ - interval '30 minutes' and d.seen_at > d.silent_alerted_at))
    for update of d
  loop
    perform app.notify(
      array(select sr.profile_id from public.staff_roles sr where sr.role = 'leader') || r.profile_id,
      'No signal from ' || r.first_name || '''s device',
      'Announcements may not play on it. Open Jumpstart Go on that device.',
      '/coordinator', 'duty-' || r.profile_id);
    update app.gate_duty set silent_alerted_at = now_ where profile_id = r.profile_id;
    n := n + 1;
  end loop;
  return n;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('gate-reminders', '* * * * *', 'select app.send_gate_reminders(), app.alert_silent_duty()');
  end if;
end $$;

-- 8. Who may call what ---------------------------------------------------------------------------------------------------------------
revoke all on function app.send_gate_reminders(), app.alert_silent_duty(), app.reset_gate_reminders(), app.push_on_trip(), app.push_on_arrival(),
  app.notify(uuid[], text, text, text, text) from public, anon, authenticated;
revoke all on function public.save_device_token(text, text, text), public.delete_device_token(text) from public, anon;
grant execute on function public.save_device_token(text, text, text), public.delete_device_token(text) to authenticated;
revoke all on function public.push_claim(int), public.push_forget_token(text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.push_claim(int), public.push_forget_token(text) to service_role;
  end if;
end $$;
