-- Push delivery is at-least-once (0016 was at-most-once). A transient failure (the push service answered 5xx or 429, a
-- timeout, push-send crashed mid-batch) puts the alert back in the queue, up to 3 tries and only while it is still news
-- (10 minutes). A device the push service says is gone (404/410) is deleted as before and not retried.
-- A person with two devices gets the retry on both; the notification's tag makes the second replace the first.
alter table app.push_outbox add column attempts int not null default 0;

create function app.push_requeue_stuck() returns void
language sql security definer set search_path = '' as $$
  -- push-send claimed these and never reported back (crash, time limit).
  update app.push_outbox set sent_at = null
  where result = 'sending' and sent_at < now() - interval '2 minutes' and attempts < 3 and created_at > now() - interval '10 minutes';
  update app.push_outbox set result = 'error timed out'
  where result = 'sending' and sent_at < now() - interval '2 minutes' and (attempts >= 3 or created_at <= now() - interval '10 minutes');
$$;
revoke all on function app.push_requeue_stuck() from public, anon, authenticated;

create or replace function public.push_claim(p_limit int default 100) returns table (outbox_id bigint, title text, body text, url text, tag text, subscription_id uuid, endpoint text, p256dh text, auth text)
language sql security definer set search_path = '' as $$
  select app.push_requeue_stuck();
  with batch as (
    update app.push_outbox o set sent_at = now(), result = 'sending', attempts = o.attempts + 1
    where o.id in (select id from app.push_outbox where sent_at is null order by id limit p_limit for update skip locked)
    returning o.*
  )
  select b.id, b.title, b.body, b.url, b.tag, s.id, s.endpoint, s.p256dh, s.auth
  from batch b join public.push_subscriptions s on s.profile_id = b.profile_id
$$;

create or replace function public.push_result(p_outbox bigint, p_result text, p_gone uuid default null) returns void
language sql security definer set search_path = '' as $$
  update app.push_outbox set result = left(p_result, 200),
    sent_at = case when p_result like 'error%' and attempts < 3 and created_at > now() - interval '10 minutes' then null else sent_at end
  where id = p_outbox;
  delete from public.push_subscriptions where id = p_gone;
$$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('push-requeue', '* * * * *', 'select app.push_requeue_stuck()');
  end if;
end $$;
