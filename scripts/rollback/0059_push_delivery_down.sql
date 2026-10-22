-- Undoes 0059 (push delivery per device). Run only together with the previous push-send and app, in this order:
--   1. this file   2. deploy the previous push-send   3. deploy the previous app.
-- Per-device rows not yet finished (unsent, being sent, requeued) are retired first: the 0058 claim would send each of them to every device of the person.
-- Nothing is deleted: the 0059 columns (outbox receipts and times, push_subscriptions test evidence), app.gate_heard and
-- app.push_life stay, so delivery history survives a rollback. Nothing older reads them; drop them later if wanted.
begin;
update app.push_outbox set sent_at = coalesce(sent_at, now()), result = 'rolled back' where per_device and (sent_at is null or result in ('sending', 'requeued'));

create or replace function app.notify(p_people uuid[], p_title text, p_body text, p_url text, p_tag text) returns void
language sql security definer set search_path = '' as $$
  insert into app.push_outbox (profile_id, title, body, url, tag)
  select p.id, left(p_title, 120), left(p_body, 240), p_url, p_tag
  from public.profiles p
  where p.id = any (p_people) and p.active and p.app_access
    and (exists (select 1 from public.push_subscriptions s where s.profile_id = p.id)
      or exists (select 1 from public.device_tokens d where d.profile_id = p.id))
$$;

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

create or replace function app.push_requeue_stuck() returns void
language sql security definer set search_path = '' as $$
  -- push-send claimed these and never reported back (crash, time limit).
  update app.push_outbox set sent_at = null
  where result = 'sending' and sent_at < now() - interval '2 minutes' and attempts < 3 and created_at > now() - interval '10 minutes';
  update app.push_outbox set result = 'error timed out'
  where result = 'sending' and sent_at < now() - interval '2 minutes' and (attempts >= 3 or created_at <= now() - interval '10 minutes');
$$;

create or replace function public.push_result(p_outbox bigint, p_result text, p_gone uuid default null) returns void
language sql security definer set search_path = '' as $$
  update app.push_outbox set result = left(p_result, 200),
    sent_at = case when p_result like 'error%' and attempts < 3 and created_at > now() - interval '10 minutes' then null else sent_at end
  where id = p_outbox;
  delete from public.push_subscriptions where id = p_gone;
$$;

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

drop function public.push_receipt(bigint, uuid, text);
drop function public.send_test_push();
drop function public.test_push_status(text);
drop function public.confirm_test_heard(text);
grant insert on public.push_subscriptions to authenticated;
drop function public.gate_heard(uuid);
drop function public.gate_delivery_report();

revoke all on function app.notify(uuid[], text, text, text, text), app.push_requeue_stuck(), app.send_gate_reminders() from public, anon, authenticated;
revoke all on function public.push_claim(int), public.push_result(bigint, text, uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.push_claim(int), public.push_result(bigint, text, uuid) to service_role;
  end if;
end $$;
-- Back to the once-a-minute flush (0016).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('push-flush', '* * * * *', $job$
      select net.http_post(url := c.url, headers := jsonb_build_object('Authorization', 'Bearer ' || c.secret, 'Content-Type', 'application/json'), body := '{}'::jsonb)
      from app.push_config c where exists (select 1 from app.push_outbox o where o.sent_at is null)
    $job$);
  end if;
end $$;
commit;
