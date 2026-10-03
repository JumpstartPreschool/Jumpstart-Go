-- 0046: push delivery is retried. Its own person: a parent with one device.
set session_replication_role = replica;
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-000000046a01', '919833304601');
insert into public.profiles (id, user_id, full_name, phone, active, app_access)
  values ('00000000-0000-0000-0000-000000046b01', '00000000-0000-0000-0000-000000046a01', 'Retry Parent', '+919833304601', true, true);
set session_replication_role = origin;
delete from app.push_outbox;
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-000000046b01', 'https://fcm.googleapis.com/fcm/send/retry-e2', repeat('p', 60), repeat('a', 20));
insert into app.push_outbox (profile_id, title, body) values ('00000000-0000-0000-0000-000000046b01', 'Retry', 'me');

-- A transient failure puts it back, up to 3 tries.
do $$ declare o bigint; begin
  select id into o from app.push_outbox;
  for i in 1..3 loop
    assert (select count(*) from public.push_claim(10)) = 1, 'claimed try ' || i;
    perform public.push_result(o, 'error 503 unavailable');
    assert (select sent_at is null from app.push_outbox where id = o) = (i < 3), 'requeued until the third try';
  end loop;
  assert (select attempts from app.push_outbox where id = o) = 3, 'three attempts counted';
  assert (select count(*) from public.push_claim(10)) = 0, 'not retried a fourth time';
end $$;

-- Sent is final; gone deletes the device and is not retried.
do $$ declare o bigint; s uuid; begin
  update app.push_outbox set sent_at = null, attempts = 0, result = null;
  select id into o from app.push_outbox;
  perform public.push_claim(10);
  perform public.push_result(o, 'sent');
  assert (select sent_at is not null from app.push_outbox where id = o), 'sent stays sent';
  update app.push_outbox set sent_at = null, attempts = 0;
  select subscription_id into s from public.push_claim(10);
  perform public.push_result(o, 'gone', s);
  assert (select sent_at is not null from app.push_outbox where id = o), 'gone is not retried';
  assert not exists (select 1 from public.push_subscriptions where id = s), 'the dead device is forgotten';
end $$;

-- A claim that never reported back is requeued after 2 minutes; a stale one is given up on.
do $$ declare o bigint; begin
  select id into o from app.push_outbox;
  update app.push_outbox set sent_at = now() - interval '3 minutes', result = 'sending', attempts = 1;
  perform app.push_requeue_stuck();
  assert (select sent_at is null from app.push_outbox where id = o), 'stuck row requeued';
  update app.push_outbox set sent_at = now() - interval '3 minutes', result = 'sending', attempts = 3;
  perform app.push_requeue_stuck();
  assert (select sent_at is not null and result = 'error timed out' from app.push_outbox where id = o), 'stuck at the limit is given up';
  update app.push_outbox set sent_at = now() - interval '30 seconds', result = 'sending', attempts = 1;
  perform app.push_requeue_stuck();
  assert (select sent_at is not null from app.push_outbox where id = o), 'a fresh claim is left alone';
end $$;

-- Only the service role may run these.
set role authenticated;
do $$ begin
  perform app.push_requeue_stuck();
  raise exception 'FAIL: a signed-in user ran the requeue';
exception when insufficient_privilege then null;
end $$;
reset role;
