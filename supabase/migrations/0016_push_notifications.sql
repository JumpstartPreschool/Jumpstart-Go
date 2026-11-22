-- Web push notifications (PRD: notifications; Screen Book: "Alerts reach a locked iPad as a backup", Updates for
-- parents). Free and standard: the browser's own push service, signed with the school's VAPID key. The database decides
-- who hears what (below) and queues it; the push-send function delivers it and forgets devices that have gone.

-- 1. Devices ---------------------------------------------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 10 and 100),
  user_agent text check (user_agent is null or length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy own on public.push_subscriptions for all to authenticated using (profile_id = app.me()) with check (profile_id = app.me());
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

-- A device moves to whoever signs in on it (a shared iPad), never to two people at once.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (app.me(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, created_at = now();
end $$;

-- 2. The outbox: one row per person to tell ---------------------------------------------------------------------------------
create table app.push_outbox (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  url text not null default '/',
  tag text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  result text
);
create index on app.push_outbox (created_at) where sent_at is null;
revoke all on app.push_outbox from public, anon, authenticated;

-- Where push-send lives and the secret it expects (set at deployment; see docs/infrastructure/deployment.md).
create table app.push_config (id boolean primary key default true check (id), url text not null, secret text not null);
revoke all on app.push_config from public, anon, authenticated;

-- Queue a notification for people who can receive one: on the record, with the app, and a device registered.
create function app.notify(p_people uuid[], p_title text, p_body text, p_url text, p_tag text) returns void
language sql security definer set search_path = '' as $$
  insert into app.push_outbox (profile_id, title, body, url, tag)
  select p.id, left(p_title, 120), left(p_body, 240), p_url, p_tag
  from public.profiles p
  where p.id = any (p_people) and p.active and p.app_access
    and exists (select 1 from public.push_subscriptions s where s.profile_id = p.id)
$$;

-- Ask push-send to deliver now (when pg_net and the config exist); the minute job below catches anything missed.
create function app.kick_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cfg app.push_config;
begin
  select * into cfg from app.push_config;
  if found and exists (select 1 from pg_extension where extname = 'pg_net') then
    execute 'select net.http_post(url := $1, headers := $2, body := ''{}''::jsonb)'
      using cfg.url, jsonb_build_object('Authorization', 'Bearer ' || cfg.secret, 'Content-Type', 'application/json');
  end if;
  return null;
end $$;
create trigger kick_push after insert on app.push_outbox for each statement execute function app.kick_push();

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('push-flush', '* * * * *', $job$
      select net.http_post(url := c.url, headers := jsonb_build_object('Authorization', 'Bearer ' || c.secret, 'Content-Type', 'application/json'), body := '{}'::jsonb)
      from app.push_config c where exists (select 1 from app.push_outbox o where o.sent_at is null)
    $job$);
    perform cron.schedule('push-cleanup', '30 3 * * *', $job$delete from app.push_outbox where created_at < now() - interval '14 days'$job$);
  end if;
end $$;

-- 3. Who hears what -----------------------------------------------------------------------------------------------------------
create function app.child_first(p_child uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(preferred_name, split_part(full_name, ' ', 1)) from public.children where id = p_child
$$;
create function app.hm(t timestamptz) returns text
language sql immutable set search_path = '' as $$ select to_char(t at time zone 'Asia/Kolkata', 'FMHH12:MI AM') $$;

-- The child's parents and family, except whoever did it; `family_changes` = only those who want the other parent's changes.
create function app.guardians_to_tell(p_child uuid, p_except uuid, p_family_changes boolean) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(g.guardian_id), '{}') from public.guardianships g join public.profiles p on p.id = g.guardian_id
  where g.child_id = p_child and g.guardian_id is distinct from p_except and (not p_family_changes or p.notify_family)
$$;

-- Coordinators who cover the child's class, or every coordinator when nobody does (like the announcements, D11).
create function app.coordinators_for(p_child uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  with cls as (select class_id from public.children where id = p_child),
  covering as (select cc.profile_id from public.coordinator_classes cc, cls where cc.class_id = cls.class_id)
  select coalesce(array_agg(r.profile_id), '{}') from public.staff_roles r
  where r.role = 'coordinator' and (not exists (select 1 from covering) or r.profile_id in (select profile_id from covering))
$$;

create function app.push_on_trip() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  kid text := app.child_first(new.child_id);
  word text := case new.direction when 'pickup' then 'pickup' else 'drop-off' end;
  who text := split_part(new.traveller_name, ' ', 1);
  actor uuid := app.me();
  url text := '/parent';
begin
  -- The gate: a new request or a new time, until someone acknowledges it. The tag replaces the older alert.
  if new.status = 'en_route' and new.acknowledged_at is null and (tg_op = 'INSERT' or new.arrive_at is distinct from old.arrive_at) then
    perform app.notify(app.coordinators_for(new.child_id),
      format('%s, %s at %s', (select full_name from public.children where id = new.child_id), word, app.hm(new.arrive_at)),
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
create trigger push_on_trip after insert or update on public.trips for each row execute function app.push_on_trip();

-- Three wrong codes at the gate: the child's family and the admins hear at once.
create function app.push_on_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.trips;
begin
  if new.locked_at is not null and old.locked_at is null then
    select * into t from public.trips where id = new.trip_id;
    perform app.notify(app.guardians_to_tell(t.child_id, null, false) || (select coalesce(array_agg(profile_id), '{}') from public.staff_roles where role = 'admin'),
      format('Handover locked for %s', app.child_first(t.child_id)),
      format('Three wrong codes at the gate for %s''s pickup. Please call the school.', split_part(t.traveller_name, ' ', 1)), '/parent', 'lock-' || t.id);
  end if;
  return null;
end $$;
create trigger push_on_lock after update of locked_at on app.trip_links for each row execute function app.push_on_lock();

create function app.push_on_announcement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.notify(array(select app.recipients(new.class_id)), new.title, new.body, '/parent/updates', 'ann-' || new.id);
  return null;
end $$;
create trigger push_on_announcement after insert on public.announcements for each row execute function app.push_on_announcement();

-- The school replied: the family hears it (the office reads its inbox; families don't get each other's messages twice).
create function app.push_on_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sender_role in ('admin', 'core', 'pro') then
    perform app.notify(app.guardians_to_tell(new.child_id, null, false), format('Message about %s', app.child_first(new.child_id)),
      format('%s: %s', split_part(new.sender_name, ' ', 1), new.body), '/parent/messages/' || new.child_id, 'msg-' || new.child_id);
  end if;
  return null;
end $$;
create trigger push_on_message after insert on public.messages for each row execute function app.push_on_message();

-- An absence reported by one parent: the others hear it, if they asked to.
create function app.push_on_absence() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'absent' and new.reported_by is not null and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and exists (select 1 from public.guardianships g where g.child_id = new.child_id and g.guardian_id = new.reported_by) then
    perform app.notify(app.guardians_to_tell(new.child_id, new.reported_by, true), format('%s is marked absent', app.child_first(new.child_id)),
      format('%s, by %s.', coalesce(new.note, 'No reason given'), (select split_part(full_name, ' ', 1) from public.profiles where id = new.reported_by)), '/parent', 'abs-' || new.child_id);
  end if;
  return null;
end $$;
create trigger push_on_absence after insert or update on public.attendance for each row execute function app.push_on_absence();

-- 4. The 8:00 AM reminder (D17) ----------------------------------------------------------------------------------------------
create function app.queue_morning_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  d date := app.today();
  wd smallint := extract(isodow from app.today())::smallint;
  n int := 0;
  r record;
begin
  for r in
    select g.guardian_id, c.id as child_id, coalesce(c.preferred_name, split_part(c.full_name, ' ', 1)) as kid,
           coalesce((select dt.at from public.day_times dt where dt.child_id = c.id and dt.day = d and dt.direction = 'dropoff'), s.dropoff, p.dropoff_from) as drop_at,
           coalesce((select dt.at from public.day_times dt where dt.child_id = c.id and dt.day = d and dt.direction = 'pickup'), s.pickup, p.pickup_from) as pick_at
    from public.guardianships g
    join public.profiles pr on pr.id = g.guardian_id and pr.notify_morning
    join public.children c on c.id = g.child_id and c.active
    join public.programmes p on p.id = c.programme_id
    left join public.child_schedules s on s.child_id = c.id and s.weekday = wd
    where app.runs_on(c.programme_id, d)
      and not exists (select 1 from public.attendance a where a.child_id = c.id and a.day = d and a.status <> 'present')
  loop
    perform app.notify(array[r.guardian_id], format('Today for %s', r.kid),
      format('Drop-off %s, pickup %s. Tap to change.', to_char(r.drop_at, 'FMHH12:MI AM'), to_char(r.pick_at, 'FMHH12:MI AM')), '/parent', 'morning-' || r.child_id);
    n := n + 1;
  end loop;
  return n;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('morning-reminders', '30 2 * * *', 'select app.queue_morning_reminders()');  -- 08:00 India time
  end if;
end $$;

-- 5. What push-send reads and writes (service role only) ---------------------------------------------------------------------
create function public.push_claim(p_limit int default 100) returns table (outbox_id bigint, title text, body text, url text, tag text, subscription_id uuid, endpoint text, p256dh text, auth text)
language sql security definer set search_path = '' as $$
  with batch as (
    update app.push_outbox o set sent_at = now(), result = 'sending'
    where o.id in (select id from app.push_outbox where sent_at is null order by id limit p_limit for update skip locked)
    returning o.*
  )
  select b.id, b.title, b.body, b.url, b.tag, s.id, s.endpoint, s.p256dh, s.auth
  from batch b join public.push_subscriptions s on s.profile_id = b.profile_id
$$;
create function public.push_result(p_outbox bigint, p_result text, p_gone uuid default null) returns void
language sql security definer set search_path = '' as $$
  update app.push_outbox set result = left(p_result, 200) where id = p_outbox;
  delete from public.push_subscriptions where id = p_gone;
$$;

revoke all on function app.notify(uuid[], text, text, text, text), app.kick_push(), app.child_first(uuid), app.hm(timestamptz),
  app.guardians_to_tell(uuid, uuid, boolean), app.coordinators_for(uuid), app.push_on_trip(), app.push_on_lock(), app.push_on_announcement(),
  app.push_on_message(), app.push_on_absence(), app.queue_morning_reminders() from public, anon, authenticated;
revoke all on function public.push_claim(int), public.push_result(bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.push_claim(int), public.push_result(bigint, text, uuid) to service_role;
  end if;
end $$;
