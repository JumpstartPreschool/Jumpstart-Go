-- 0016: who hears what. People from foundation.test.sql: a1 admin, c1 core, d1 coordinator, e1 and e2 parents; Meera
-- c0002 (Learning Center) with Parent B e2. Thursday 1 Oct 2026. Devices are registered for e2 and d1 only.
set app.now = '2026-10-01 10:00:00+05:30';
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-0000000000e2', 'https://fcm.googleapis.com/fcm/send/test-e2', repeat('p', 60), repeat('a', 20)),
  ('00000000-0000-0000-0000-0000000000d1', 'https://fcm.googleapis.com/fcm/send/test-d1', repeat('p', 60), repeat('a', 20));
-- Meera's class is covered by the coordinator, so the alert goes to the class's iPads.
insert into public.coordinator_classes values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000c002') on conflict do nothing;
delete from app.push_outbox;

-- The father is on the way: the gate hears it; he doesn't get his own news.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$ begin perform public.start_trip('00000000-0000-0000-0000-0000000c0002', 'pickup', 30); end $$;
do $$ begin
  perform 1 from app.push_outbox;
  raise exception 'FAIL: a parent read the outbox';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.push_claim(10);
  raise exception 'FAIL: a parent claimed notifications';
exception when insufficient_privilege then null;
end $$;
reset role;
do $$ begin
  assert (select count(*) from app.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000d1' and title like 'Meera, pickup at 10:30 AM') = 1, 'the coordinator is alerted';
  assert (select count(*) from app.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000e2') = 0, 'not told about his own trip';
end $$;

-- The coordinator marks her ready: the father hears it.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$ begin perform public.gate_step((select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c0002' and day = '2026-10-01' and direction = 'pickup'), 'ready'); end $$;
reset role;
do $$ begin
  -- gate_step stamps the real clock (0006), so only the wording is checked here.
  assert (select body like 'Ready at %' from app.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000e2' and title = 'Meera is ready at the gate'), 'ready, with the time';
end $$;

-- An announcement reaches the parents with a device; nothing is queued for people without one.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin perform public.send_announcement('Rain day', 'Please send a raincoat tomorrow.'); end $$;
reset role;
do $$ begin
  assert (select count(*) from app.push_outbox where title = 'Rain day' and profile_id = '00000000-0000-0000-0000-0000000000e2') = 1, 'announcement queued';
  assert (select count(*) from app.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000e1') = 0, 'nothing for a parent without a device';
end $$;

-- The 8:00 AM reminder, and delivery bookkeeping.
do $$
declare n int;
begin
  n := app.queue_morning_reminders();
  assert n >= 1 and exists (select 1 from app.push_outbox where title = 'Today for Meera' and body like 'Drop-off %, pickup %. Tap to change.'), 'morning reminder';
  assert (select count(*) from public.push_claim(100)) >= 3, 'claimed with the device';
  assert not exists (select 1 from app.push_outbox where sent_at is null), 'all taken';
  perform public.push_result((select min(id) from app.push_outbox), 'gone', (select id from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/test-d1'));
  assert not exists (select 1 from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/test-d1'), 'a dead device is forgotten';
end $$;
delete from app.push_outbox;
delete from public.push_subscriptions;
-- Leave the later tests' world as it was.
delete from public.announcements where title = 'Rain day';
delete from public.coordinator_classes where profile_id = '00000000-0000-0000-0000-0000000000d1' and class_id = '00000000-0000-0000-0000-00000000c002';
delete from public.trips where child_id = '00000000-0000-0000-0000-0000000c0002' and day = '2026-10-01';
