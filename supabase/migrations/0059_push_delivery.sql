-- 0059: push delivery that is per device, expires, backs off, and reports what really happened.
--   1. One outbox row per alert and device. A retry goes only to the device that failed; a device that already showed
--      the alert never gets it twice (0046 retried every device of the person).
--   2. Every row has an expiry: gate alerts 10 minutes (a reminder follows every few minutes anyway), the rest an hour.
--      A gate alert whose trip has closed is never sent, so nobody is told about a pickup that is already done.
--   3. A failed send waits 15 s, then 30 s, before its next try (at most 3 tries, as before).
--   4. Each row carries a receipt id. The phone's service worker reports back when the alert was displayed and when it
--      was opened (push-send /receipt). 'sent' only ever means the push service accepted it.
--   5. The gate reports when an announcement was actually spoken on a device (gate_heard). Acknowledgement stays on the
--      trip (acknowledged_at), so accepted, displayed, opened, heard and acknowledged are five separate facts.
--   6. Gate reminders escalate: after two unanswered reminders to the people on duty (one for an arrival or a request
--      outside the usual time), every gate person covering the child and every Center Leader is told.
--   7. gate_delivery_report: who on the gate team can be reached, and how today's open requests were delivered.
--   8. Device readiness: a person sends themselves a test alert (send_test_push), sees whether this device displayed it
--      (test_push_status), and confirms they heard it (confirm_test_heard). Each web device keeps when it last displayed
--      an alert and a test, and when someone last confirmed hearing one.
--   9. Pending sends are flushed every 10 seconds (was every minute), so a retry waits seconds, not a minute.
-- Rollback: the previous functions are in 0046 and 0058; the new columns and table can stay (nothing else reads them).

-- 1. The outbox, per device ----------------------------------------------------------------------------------------------------
alter table app.push_outbox
  add column per_device boolean not null default false,
  add column subscription_id uuid references public.push_subscriptions (id) on delete set null,
  add column device_id uuid references public.device_tokens (id) on delete set null,
  add column expires_at timestamptz,
  add column not_before timestamptz,
  add column receipt uuid not null default gen_random_uuid(),
  add column displayed_at timestamptz,
  add column opened_at timestamptz;
update app.push_outbox set expires_at = created_at + case when tag like 'trip-%' or tag like 'duty-%' then interval '10 minutes' else interval '1 hour' end;
alter table app.push_outbox alter column expires_at set not null, alter column expires_at set default now() + interval '1 hour';
create index on app.push_outbox (tag) where tag is not null;
create index on app.push_outbox (profile_id, created_at);
create index on app.push_outbox (subscription_id) where subscription_id is not null;
create index on app.push_outbox (device_id) where device_id is not null;
alter table public.push_subscriptions
  add column last_displayed_at timestamptz,
  add column last_test_at timestamptz,
  add column test_heard_at timestamptz;
-- Devices are saved only through save_push_subscription, so nobody can write their own test evidence.
revoke insert, update on public.push_subscriptions from authenticated;

-- As 0017, and a device that moves to someone else starts with no evidence: the last owner's tests prove nothing for them.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  -- The same device (same keys) moves to whoever signs in on it; someone else's endpoint with other keys is refused.
  if exists (select 1 from public.push_subscriptions s where s.endpoint = p_endpoint and s.profile_id <> app.me() and (s.p256dh <> p_p256dh or s.auth <> p_auth)) then
    raise exception 'device_in_use: This device is registered to someone else.' using errcode = '42501';
  end if;
  insert into public.push_subscriptions as s (profile_id, endpoint, p256dh, auth, user_agent)
  values (app.me(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, created_at = now(),
    last_displayed_at = case when s.profile_id = excluded.profile_id then s.last_displayed_at end,
    last_test_at = case when s.profile_id = excluded.profile_id then s.last_test_at end,
    test_heard_at = case when s.profile_id = excluded.profile_id then s.test_heard_at end;
end $$;

-- How long an alert stays worth delivering.
create function app.push_life(p_tag text) returns interval
language sql immutable set search_path = '' as $$
  select case when p_tag like 'trip-%' or p_tag like 'duty-%' then interval '10 minutes' else interval '1 hour' end
$$;

-- Reachable means a web subscription or a phone token (0058); now one row for each of them.
create or replace function app.notify(p_people uuid[], p_title text, p_body text, p_url text, p_tag text) returns void
language sql security definer set search_path = '' as $$
  insert into app.push_outbox (profile_id, title, body, url, tag, per_device, subscription_id, device_id, expires_at)
  select p.id, left(p_title, 120), left(p_body, 240), p_url, p_tag, true, d.sub_id, d.dev_id, now() + app.push_life(p_tag)
  from public.profiles p
  join lateral (
    select s.id as sub_id, null::uuid as dev_id from public.push_subscriptions s where s.profile_id = p.id
    union all
    select null::uuid, t.id from public.device_tokens t where t.profile_id = p.id
  ) d on true
  where p.id = any (p_people) and p.active and p.app_access
$$;

-- 2 and 3. Claiming, retrying and giving up -------------------------------------------------------------------------------------
create or replace function app.push_requeue_stuck() returns void
language sql security definer set search_path = '' as $$
  -- push-send claimed these and never reported back (crash, time limit).
  -- Marked 'requeued', so a late report from the run that claimed it is ignored (push_result only takes 'sending').
  update app.push_outbox set sent_at = null, result = 'requeued'
  where result = 'sending' and sent_at < now() - interval '2 minutes' and attempts < 3 and expires_at > now();
  update app.push_outbox set result = 'error timed out'
  where result = 'sending' and sent_at < now() - interval '2 minutes' and (attempts >= 3 or expires_at <= now());
$$;

drop function public.push_claim(int);
create function public.push_claim(p_limit int default 100)
returns table (outbox_id bigint, title text, body text, url text, tag text, platform text, subscription_id uuid, endpoint text, p256dh text, auth text, token text, receipt uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform app.push_requeue_stuck();
  -- Not worth sending any more: too old, about a gate request that has closed, or for a device that has gone since.
  update app.push_outbox o set sent_at = now(), result = 'expired' where o.sent_at is null and o.expires_at <= now();
  update app.push_outbox o set sent_at = now(), result = 'skipped closed'
  from public.trips t
  where o.sent_at is null and o.url like '/coordinator%' and o.tag = 'trip-' || t.id::text
    and (t.status <> 'en_route'
      -- Acknowledged since this alert was queued, with no arrival after that: the gate already has it.
      or (t.acknowledged_at > o.created_at and not app.arrived_since_seen(t)));
  -- The device was forgotten, or now belongs to someone else (signed in on a shared iPad): never theirs to receive.
  update app.push_outbox o set sent_at = now(), result = 'gone'
  where o.sent_at is null and o.per_device
    and not exists (select 1 from public.push_subscriptions s where s.id = o.subscription_id and s.profile_id = o.profile_id)
    and not exists (select 1 from public.device_tokens d where d.id = o.device_id and d.profile_id = o.profile_id);
  return query
  with batch as (
    update app.push_outbox o set sent_at = now(), result = 'sending', attempts = o.attempts + 1
    where o.id in (select x.id from app.push_outbox x where x.sent_at is null and (x.not_before is null or x.not_before <= now())
      order by x.id limit p_limit for update skip locked)
    returning o.*
  )
  -- Rows from before 0059 (per_device false) still go to every device the person has.
  select b.id, b.title, b.body, b.url, b.tag, 'web'::text, s.id, s.endpoint, s.p256dh, s.auth, null::text, b.receipt, b.expires_at
  from batch b join public.push_subscriptions s on s.profile_id = b.profile_id and (not b.per_device or s.id = b.subscription_id)
  union all
  select b.id, b.title, b.body, b.url, b.tag, d.platform, null::uuid, null::text, null::text, null::text, d.token, b.receipt, b.expires_at
  from batch b join public.device_tokens d on d.profile_id = b.profile_id and (not b.per_device or d.id = b.device_id);
end $$;

create or replace function public.push_result(p_outbox bigint, p_result text, p_gone uuid default null) returns void
language sql security definer set search_path = '' as $$
  -- Only the claim still waiting for its answer: a late report after a requeue changes nothing, so nothing is sent twice.
  update app.push_outbox set result = left(p_result, 200),
    sent_at = case when p_result like 'error%' and attempts < 3 and expires_at > now() then null else coalesce(sent_at, now()) end,
    not_before = case when p_result like 'error%' then now() + attempts * interval '15 seconds' else not_before end
  where id = p_outbox and result = 'sending';
  delete from public.push_subscriptions where id = p_gone;
$$;

-- 4. Receipts from the device (push-send /receipt, which has the service key). The receipt id is the proof: it travels
-- only inside the encrypted push to that one device. Displayed and opened are each recorded once.
-- A receipt is accepted for a day after the alert was queued; replaying it changes nothing (each time is kept once).
create function public.push_receipt(p_outbox bigint, p_receipt uuid, p_event text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare o app.push_outbox;
begin
  select * into o from app.push_outbox
  where id = p_outbox and receipt = p_receipt and p_event in ('displayed', 'opened') and created_at > now() - interval '1 day'
  for update;
  if not found then return false; end if;
  update app.push_outbox set
    displayed_at = coalesce(displayed_at, now()),
    opened_at = case when p_event = 'opened' then coalesce(opened_at, now()) else opened_at end
  where id = o.id;
  -- The device's evidence moves only on the first report, and only while it still belongs to the person it was sent to.
  if o.displayed_at is null then
    update public.push_subscriptions set last_displayed_at = now(),
      last_test_at = case when o.tag like 'test-%' then now() else last_test_at end
    where id = o.subscription_id and profile_id = o.profile_id;
  end if;
  return true;
end $$;

-- 5. Spoken on a device ------------------------------------------------------------------------------------------------------------
create table app.gate_heard (
  trip_id uuid not null references public.trips (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  heard_at timestamptz not null default now(),
  primary key (trip_id, profile_id)
);
revoke all on app.gate_heard from public, anon, authenticated;

create function public.gate_heard(p_trip uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is null or not app.is_gate() then
    raise exception 'Only the gate team can report an announcement.' using errcode = '42501';
  end if;
  insert into app.gate_heard (trip_id, profile_id)
  -- Only someone this request is announced to (the child's gate team, or a Center Leader): nobody can mark others' as heard.
  select t.id, app.me() from public.trips t where t.id = p_trip and t.day = app.today()
    and (app.me() = any (app.coordinators_for(t.child_id)) or app.has_role('leader'))
  on conflict (trip_id, profile_id) do update set heard_at = now();
end $$;

-- 6. Reminders until acknowledged (0058), escalating when nobody answers ----------------------------------------------------------
create or replace function app.send_gate_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  now_ timestamptz := app.clock();
  every interval := make_interval(mins => coalesce((select reminder_min from public.gate_announcement_settings limit 1), 2));
  n int := 0;
  r record;
  to_tell uuid[];
  on_duty uuid[];
  arrived boolean;
  escalate boolean;
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
    arrived := r.arrived_at is not null and (r.acknowledged_at is null or r.arrived_at > r.acknowledged_at);
    escalate := r.reminders_sent >= case when arrived or r.off_schedule then 1 else 2 end;
    to_tell := app.coordinators_for(r.child_id);
    if escalate then
      to_tell := to_tell || array(select sr.profile_id from public.staff_roles sr where sr.role = 'leader');
    else
      on_duty := array(select d.profile_id from app.gate_duty d
        where d.profile_id = any (to_tell) and (d.started_at at time zone 'Asia/Kolkata')::date = (now_ at time zone 'Asia/Kolkata')::date);
      if cardinality(on_duty) > 0 then to_tell := on_duty; end if;
    end if;
    kid := app.child_first(r.child_id);
    perform app.notify(to_tell,
      case when arrived then format('Reminder: %s has arrived for %s', coalesce(nullif(split_part(r.traveller_name, ' ', 1), ''), 'the collector'), kid)
        else format('Reminder: %s, %s at %s', kid, case r.direction when 'pickup' then 'pickup' else 'drop-off' end, app.hm(r.arrive_at)) end,
      format('%s for %s is waiting to be acknowledged.%s', case r.direction when 'pickup' then 'Pickup' else 'Drop-off' end, kid,
        case when escalate then ' Nobody has answered yet.' else '' end),
      '/coordinator', 'trip-' || r.id);
    insert into app.gate_reminders (trip_id, last_at, sent) values (r.id, now_, 1)
    on conflict (trip_id) do update set last_at = now_, sent = app.gate_reminders.sent + 1;
    n := n + 1;
  end loop;
  return n;
end $$;

-- 7. Delivery report for the gate team, Head office and the admin -------------------------------------------------------------------
create function public.gate_delivery_report() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  -- Device names and error text for Center Leaders and Head office; coordinators see counts and times.
  detail boolean := app.has_role('leader', 'admin', 'core');
begin
  if app.me() is null or not (app.is_gate() or app.has_role('admin', 'core')) then
    raise exception 'Only the gate team and Head office can see delivery.' using errcode = '42501';
  end if;
  return json_build_object(
    'staff', (select coalesce(json_agg(x order by x.name), '[]'::json) from (
      select p.id, p.full_name as name, array_agg(distinct r.role::text order by r.role::text) as roles,
        exists (select 1 from app.gate_duty g where g.profile_id = p.id and g.seen_at > app.clock() - interval '75 seconds') as on_duty,
        (select max(o.displayed_at) from app.push_outbox o where o.profile_id = p.id) as last_displayed,
        (select count(*) from app.push_outbox o where o.profile_id = p.id and o.created_at > now() - interval '1 day'
          and (o.result like 'error%' or o.result = 'gone'))::int as failed_today,
        case when detail then (select left(regexp_replace(o.result, 'https?://\S+', '<address>', 'g'), 80) from app.push_outbox o
          where o.profile_id = p.id and o.result like 'error%' order by o.id desc limit 1) end as last_error,
        (select coalesce(json_agg(json_build_object('kind', 'web', 'label', case when detail then left(coalesce(s.user_agent, ''), 300) else '' end, 'added', s.created_at,
            'last_displayed', s.last_displayed_at, 'last_test', s.last_test_at, 'test_heard', s.test_heard_at) order by s.created_at desc), '[]'::json)
          from public.push_subscriptions s where s.profile_id = p.id) as web,
        (select coalesce(json_agg(json_build_object('kind', d.platform, 'added', d.created_at, 'last_seen', d.last_seen_at) order by d.created_at desc), '[]'::json)
          from public.device_tokens d where d.profile_id = p.id) as phones
      from public.profiles p join public.staff_roles r on r.profile_id = p.id
      where r.role in ('coordinator', 'leader') and p.active and p.app_access
      group by p.id, p.full_name) x),
    -- Per open request, each fact counted separately: queued (persisted), dispatched, accepted by the push service,
    -- displayed and opened (reported by the device), spoken (reported by the duty screen), acknowledged (a person).
    'trips', (select coalesce(json_agg(y order by y.arrive_at), '[]'::json) from (
      select t.id, app.child_first(t.child_id) as child, t.direction, t.arrive_at, t.arrived_at, t.acknowledged_at,
        count(o.id)::int as queued,
        count(o.id) filter (where o.attempts > 0)::int as dispatched,
        count(o.id) filter (where o.result = 'sent')::int as accepted,
        count(o.id) filter (where o.displayed_at is not null)::int as displayed,
        count(o.id) filter (where o.opened_at is not null)::int as opened,
        count(o.id) filter (where o.result like 'error%' or o.result = 'gone')::int as failed,
        count(o.id) filter (where o.result in ('expired', 'skipped closed'))::int as expired,
        (select count(*) from app.gate_heard h where h.trip_id = t.id)::int as heard,
        coalesce((select gr.sent from app.gate_reminders gr where gr.trip_id = t.id), 0) as reminders,
        bool_or(o.title like 'Reminder%' and o.body like '%Nobody has answered yet.') is true as escalated
      from public.trips t left join app.push_outbox o on o.tag = 'trip-' || t.id::text and o.url like '/coordinator%'
      where t.day = app.today() and t.status = 'en_route'
      group by t.id) y)
  );
end $$;

-- 8. Device readiness ------------------------------------------------------------------------------------------------------------------
-- A test alert to every device of the person asking, 10 seconds from now so they can lock the screen first. At most one a
-- minute. Returns its tag for test_push_status.
create function public.send_test_push() returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.me(); v_tag text := 'test-' || gen_random_uuid()::text;
begin
  if me is null or not app.is_staff() then
    raise exception 'Only staff can send a test alert.' using errcode = '42501';
  end if;
  if exists (select 1 from app.push_outbox where profile_id = me and tag like 'test-%' and created_at > now() - interval '1 minute') then
    raise exception 'test_too_soon: Wait a minute before sending another test.' using errcode = 'P0001';
  end if;
  perform app.notify(array[me], 'Test alert from Jumpstart Go', 'If you heard this, alerts can reach this device.', '/', v_tag);
  update app.push_outbox set not_before = now() + interval '10 seconds', expires_at = now() + interval '5 minutes' where profile_id = me and tag = v_tag;
  return v_tag;
end $$;

-- What happened to one of the asker's test alerts, per device. Web rows name their endpoint so the app can find its own.
create function public.test_push_status(p_tag text) returns table (platform text, endpoint text, result text, displayed_at timestamptz, opened_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select case when o.device_id is not null then 'phone' else 'web' end, s.endpoint, o.result, o.displayed_at, o.opened_at
  from app.push_outbox o left join public.push_subscriptions s on s.id = o.subscription_id and s.profile_id = o.profile_id
  where o.profile_id = app.me() and o.tag = p_tag and p_tag like 'test-%'
$$;

-- The person heard a test alert on this device (their own word; nothing can measure it).
create function public.confirm_test_heard(p_endpoint text) returns boolean
language sql security definer set search_path = '' as $$
  with u as (update public.push_subscriptions set test_heard_at = now()
    where endpoint = p_endpoint and profile_id = app.me() and last_test_at > now() - interval '10 minutes' returning 1)
  select exists (select 1 from u)
$$;

-- 9. Flush pending sends every 10 seconds (pg_cron 1.5+), only while one is due. pg_net's trigger (0016) still sends at once.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('push-flush', '10 seconds', $job$
        select net.http_post(url := c.url, headers := jsonb_build_object('Authorization', 'Bearer ' || c.secret, 'Content-Type', 'application/json'), body := '{}'::jsonb)
        from app.push_config c where exists (select 1 from app.push_outbox o where o.sent_at is null and (o.not_before is null or o.not_before <= now()))
      $job$);
    exception when others then
      -- pg_cron before 1.5 has no seconds: keep the minute job (0016), and say so.
      raise warning 'push-flush stays once a minute: %', sqlerrm;
    end;
  end if;
end $$;

-- 10. The parent's reason for an off-schedule request stays inside the app: a gate alert stays on a shared tablet's lock
-- screen, so it says only that the time is unusual. Otherwise as 0058.
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
      format('%s%s is on the way.%s', who, coalesce(' (' || lower(new.traveller_relation) || ')', ''), case when new.off_schedule then ' Outside the usual time.' else '' end),
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

-- Who may call what -------------------------------------------------------------------------------------------------------------------
revoke all on function app.push_life(text), app.notify(uuid[], text, text, text, text), app.push_requeue_stuck(), app.send_gate_reminders()
  from public, anon, authenticated;
revoke all on function public.push_claim(int), public.push_result(bigint, text, uuid), public.push_receipt(bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.gate_heard(uuid), public.gate_delivery_report(), public.send_test_push(), public.test_push_status(text), public.confirm_test_heard(text) from public, anon;
grant execute on function public.gate_heard(uuid), public.gate_delivery_report(), public.send_test_push(), public.test_push_status(text), public.confirm_test_heard(text) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.push_claim(int), public.push_result(bigint, text, uuid), public.push_receipt(bigint, uuid, text) to service_role;
  end if;
end $$;
