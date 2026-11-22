-- 0059: per-device delivery, expiry, backoff, receipts, spoken reports, escalation and the delivery report.
-- Its own people:  A  Asha, Center Coordinator (a web app and an Android phone)   B  Bina, Center Coordinator (web)
--                  C  Chitra, Center Leader (web)                                  D  Divya, parent of Ishaan (web)
insert into public.profiles (id, full_name, active, app_access, phone, user_id) values
  ('00000000-0000-0000-0000-000000059a01', 'Asha Kulkarni', true, true, '+919811590001', null),
  ('00000000-0000-0000-0000-000000059a02', 'Bina Deshpande', true, true, '+919811590002', null),
  ('00000000-0000-0000-0000-000000059a03', 'Chitra Joshi', true, true, '+919811590003', null),
  ('00000000-0000-0000-0000-000000059a04', 'Divya Patil', true, true, '+919811590004', null);
insert into auth.users (id, phone) select id, right(phone, 12) from public.profiles where id::text like '00000000-0000-0000-0000-000000059a%';
update public.profiles set user_id = id where id::text like '00000000-0000-0000-0000-000000059a%';
insert into public.staff_roles values
  ('00000000-0000-0000-0000-000000059a01', 'coordinator'), ('00000000-0000-0000-0000-000000059a02', 'coordinator'), ('00000000-0000-0000-0000-000000059a03', 'leader');
insert into public.children (id, full_name, date_of_birth, class_id, programme_id) values
  ('00000000-0000-0000-0000-000000059c01', 'Ishaan Patil', '2021-05-01', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001');
insert into public.guardianships values ('00000000-0000-0000-0000-000000059c01', '00000000-0000-0000-0000-000000059a04', 'Mother');
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-000000059a01', 'https://web.push.apple.com/asha', repeat('p', 60), repeat('a', 20)),
  ('00000000-0000-0000-0000-000000059a02', 'https://web.push.apple.com/bina', repeat('p', 60), repeat('a', 20)),
  ('00000000-0000-0000-0000-000000059a03', 'https://fcm.googleapis.com/fcm/send/chitra', repeat('p', 60), repeat('a', 20)),
  ('00000000-0000-0000-0000-000000059a04', 'https://fcm.googleapis.com/fcm/send/divya', repeat('p', 60), repeat('a', 20));
insert into public.device_tokens (profile_id, platform, token) values ('00000000-0000-0000-0000-000000059a01', 'android', repeat('z', 40));
delete from public.coordinator_classes;
delete from app.gate_duty;
delete from app.gate_reminders;
delete from app.push_outbox;

create function pg_temp.clock(secs int) returns void language sql as $$
  select set_config('app.now', (timestamptz '2026-03-04 11:00:00+05:30' + make_interval(secs => secs))::text, false)
$$;
create function pg_temp.as_who(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p)::text, false)
$$;
create function pg_temp.got(who uuid, like_ text) returns int language sql as $$
  select count(*)::int from app.push_outbox where profile_id = who and title like like_
$$;
select pg_temp.clock(0);

-- 1. One row per device, each with its own receipt -------------------------------------------------------------------------------------
do $$ begin
  perform app.notify(array['00000000-0000-0000-0000-000000059a01', '00000000-0000-0000-0000-000000059a02']::uuid[], 'Hello', 'Body', '/', 'x-59');
  assert (select count(*) from app.push_outbox where tag = 'x-59' and profile_id = '00000000-0000-0000-0000-000000059a01') = 2, 'two devices, two rows';
  assert (select count(*) from app.push_outbox where tag = 'x-59' and profile_id = '00000000-0000-0000-0000-000000059a02') = 1, 'one device, one row';
  assert (select count(distinct receipt) from app.push_outbox where tag = 'x-59') = 3, 'a receipt per row';
  assert (select bool_and(per_device and expires_at between now() + interval '59 minutes' and now() + interval '61 minutes') from app.push_outbox where tag = 'x-59'), 'an hour to deliver';
end $$;

-- 2. A partial failure retries only the device that failed --------------------------------------------------------------------------------
create temp table claimed as select * from public.push_claim(1000);
do $$ declare web bigint; phone bigint; begin
  assert (select count(*) from claimed where tag = 'x-59') = 3, 'all three claimed';
  select outbox_id into web from claimed where tag = 'x-59' and endpoint = 'https://web.push.apple.com/asha';
  select outbox_id into phone from claimed where tag = 'x-59' and token = repeat('z', 40);
  assert web <> phone, 'the web app and the phone are separate rows';
  perform public.push_result(web, 'sent');
  perform public.push_result(phone, 'error 503 unavailable');
  perform public.push_result((select outbox_id from claimed where endpoint = 'https://web.push.apple.com/bina'), 'sent');
  assert (select count(*) from public.push_claim(1000) where tag = 'x-59') = 0, 'nothing during the backoff';
  update app.push_outbox set not_before = now() - interval '1 second' where id = phone;
  assert (select array_agg(outbox_id) from public.push_claim(1000) where tag = 'x-59') = array[phone], 'only the phone comes back';
  assert exists (select 1 from app.push_outbox where id = phone and attempts = 2), 'its second try';
  assert (select attempts from app.push_outbox where id = web) = 1, 'the web app was not sent it again';
  perform public.push_result(phone, 'sent');
end $$;

-- 3. Receipts: displayed and opened, once each, only with the right receipt ----------------------------------------------------------------
do $$ declare o app.push_outbox; begin
  select * into o from app.push_outbox where tag = 'x-59' and subscription_id = (select id from public.push_subscriptions where endpoint = 'https://web.push.apple.com/asha');
  assert not public.push_receipt(o.id, gen_random_uuid(), 'displayed'), 'a wrong receipt is refused';
  assert not public.push_receipt(o.id, o.receipt, 'played'), 'an unknown event is refused';
  assert (select displayed_at is null from app.push_outbox where id = o.id), 'nothing recorded yet';
  assert public.push_receipt(o.id, o.receipt, 'displayed'), 'displayed';
  assert (select displayed_at is not null and opened_at is null from app.push_outbox where id = o.id), 'displayed only';
  update app.push_outbox set displayed_at = now() - interval '1 minute' where id = o.id;
  assert public.push_receipt(o.id, o.receipt, 'opened'), 'opened';
  assert (select displayed_at < now() - interval '30 seconds' and opened_at is not null from app.push_outbox where id = o.id), 'the first display time is kept';
end $$;

-- 4. Expired, closed and vanished rows are never sent ------------------------------------------------------------------------------------
delete from app.push_outbox;
select app.notify(array['00000000-0000-0000-0000-000000059a02']::uuid[], 'Old', 'Body', '/', 'x-old');
update app.push_outbox set expires_at = now() - interval '1 second' where tag = 'x-old';
select app.notify(array['00000000-0000-0000-0000-000000059a02']::uuid[], 'Lost', 'Body', '/', 'x-lost');
-- Bina signs in on another browser and this one is forgotten after the alert was queued.
update public.push_subscriptions set endpoint = 'https://web.push.apple.com/bina-2' where endpoint = 'https://web.push.apple.com/bina';
delete from public.push_subscriptions where endpoint = 'https://web.push.apple.com/bina-2';
insert into public.trips (id, child_id, direction, day, arrive_at, created_by, traveller_name, traveller_relation, created_at)
  values ('00000000-0000-0000-0000-000000059d01', '00000000-0000-0000-0000-000000059c01', 'pickup', app.today(), app.clock() + interval '20 minutes',
    '00000000-0000-0000-0000-000000059a04', 'Divya Patil', 'Mother', app.clock());
update public.trips set status = 'cancelled', closed_by = '00000000-0000-0000-0000-000000059a04', closed_at = app.clock() where id = '00000000-0000-0000-0000-000000059d01';
do $$ begin
  assert pg_temp.got('00000000-0000-0000-0000-000000059a01', 'Ishaan, pickup at %') = 2, 'the gate was told on both of Asha''s devices';
  perform public.push_claim(1000);
  assert (select result from app.push_outbox where tag = 'x-old') = 'expired', 'too old';
  assert (select result from app.push_outbox where tag = 'x-lost') = 'gone', 'device forgotten since';
  assert (select bool_and(result = 'skipped closed') from app.push_outbox where tag = 'trip-00000000-0000-0000-0000-000000059d01' and url like '/coordinator%'), 'no gate alert for a cancelled pickup';
  assert exists (select 1 from app.push_outbox where tag = 'trip-00000000-0000-0000-0000-000000059d01' and url like '/parent%' and result = 'sending'), 'the family still hears it is cancelled';
end $$;

-- 4b. Acknowledged before a queued alert went out: it is not sent; news after the acknowledgement still is.
delete from app.push_outbox;
insert into public.trips (id, child_id, direction, day, arrive_at, created_by, traveller_name, traveller_relation, created_at)
  values ('00000000-0000-0000-0000-000000059d03', '00000000-0000-0000-0000-000000059c01', 'dropoff', app.today(), app.clock() + interval '20 minutes',
    '00000000-0000-0000-0000-000000059a04', 'Divya Patil', 'Mother', app.clock());
update app.push_outbox set created_at = now() - interval '5 seconds' where tag = 'trip-00000000-0000-0000-0000-000000059d03';
update public.trips set acknowledged_by = '00000000-0000-0000-0000-000000059a01', acknowledged_at = now() where id = '00000000-0000-0000-0000-000000059d03';
do $$ begin
  perform public.push_claim(1000);
  assert (select bool_and(result = 'skipped closed') from app.push_outbox where tag = 'trip-00000000-0000-0000-0000-000000059d03' and url like '/coordinator%'), 'acknowledged first, so not sent';
end $$;
update public.trips set arrived_at = now() + interval '1 second' where id = '00000000-0000-0000-0000-000000059d03';
do $$ begin
  perform public.push_claim(1000);
  assert (select count(*) from app.push_outbox where tag = 'trip-00000000-0000-0000-0000-000000059d03' and profile_id = '00000000-0000-0000-0000-000000059a01'
    and title like '%has arrived' and result = 'sending') = 2, 'the arrival after it is sent (both of Asha''s devices)';
end $$;
update public.trips set status = 'cancelled', closed_by = '00000000-0000-0000-0000-000000059a01', closed_at = app.clock() where id = '00000000-0000-0000-0000-000000059d03';

-- 4c. Receipts expire after a day, and the claim carries the expiry for the push service's time to live.
delete from app.push_outbox;
select app.notify(array['00000000-0000-0000-0000-000000059a03']::uuid[], 'Old news', 'Body', '/', 'x-receipt');
do $$ declare o app.push_outbox; c record; begin
  select * into c from public.push_claim(1000) where tag = 'x-receipt';
  assert c.expires_at between now() + interval '59 minutes' and now() + interval '61 minutes', 'expiry handed to push-send';
  update app.push_outbox set created_at = now() - interval '25 hours' where tag = 'x-receipt' returning * into o;
  assert not public.push_receipt(o.id, o.receipt, 'displayed'), 'a day-old receipt is refused';
end $$;

-- 5. Escalation: on duty first, then everyone covering the child and the Center Leaders ------------------------------------------------------
delete from app.push_outbox;
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-000000059a02', 'https://web.push.apple.com/bina', repeat('p', 60), repeat('a', 20));
update public.gate_announcement_settings set reminder_min = 2;
insert into app.gate_duty (profile_id, started_at, seen_at) values ('00000000-0000-0000-0000-000000059a01', app.clock() - interval '1 hour', app.clock());
insert into public.trips (id, child_id, direction, day, arrive_at, created_by, traveller_name, traveller_relation, created_at)
  values ('00000000-0000-0000-0000-000000059d02', '00000000-0000-0000-0000-000000059c01', 'pickup', app.today(), app.clock() + interval '30 minutes',
    '00000000-0000-0000-0000-000000059a04', 'Divya Patil', 'Mother', app.clock());
delete from app.push_outbox;
select pg_temp.clock(120);
select app.send_gate_reminders();
select pg_temp.clock(240);
select app.send_gate_reminders();
do $$ begin
  assert pg_temp.got('00000000-0000-0000-0000-000000059a01', 'Reminder: Ishaan%') = 4, 'two reminders on both of Asha''s devices';
  assert pg_temp.got('00000000-0000-0000-0000-000000059a02', 'Reminder%') = 0 and pg_temp.got('00000000-0000-0000-0000-000000059a03', 'Reminder%') = 0, 'only the person on duty, at first';
end $$;
select pg_temp.clock(360);
select app.send_gate_reminders();
do $$ begin
  assert pg_temp.got('00000000-0000-0000-0000-000000059a02', 'Reminder: Ishaan%') = 1, 'the other coordinator is told after two unanswered reminders';
  assert pg_temp.got('00000000-0000-0000-0000-000000059a03', 'Reminder: Ishaan%') = 1, 'and the Center Leader';
  assert (select bool_and(body like '%Nobody has answered yet.') from app.push_outbox where title like 'Reminder: Ishaan%' and created_at = (select max(created_at) from app.push_outbox)), 'says nobody has answered';
  assert pg_temp.got('00000000-0000-0000-0000-000000059a04', 'Reminder%') = 0, 'never the parent';
end $$;
-- An arrival nobody answers escalates after one reminder.
update public.trips set acknowledged_by = '00000000-0000-0000-0000-000000059a01', acknowledged_at = app.clock() where id = '00000000-0000-0000-0000-000000059d02';
select pg_temp.clock(400);
update public.trips set arrived_at = app.clock() where id = '00000000-0000-0000-0000-000000059d02';
delete from app.push_outbox;
select pg_temp.clock(520);
select app.send_gate_reminders();
do $$ begin
  assert pg_temp.got('00000000-0000-0000-0000-000000059a01', 'Reminder: Divya has arrived for Ishaan') = 2, 'first arrival reminder to the person on duty';
  assert pg_temp.got('00000000-0000-0000-0000-000000059a02', 'Reminder%') = 0, 'not yet the others';
end $$;
select pg_temp.clock(640);
select app.send_gate_reminders();
do $$ begin assert pg_temp.got('00000000-0000-0000-0000-000000059a02', 'Reminder: Divya has arrived for Ishaan') = 1, 'escalated after one'; end $$;

-- 6. Spoken on a device, and the delivery report --------------------------------------------------------------------------------------------
-- Asha's tablet checked in a moment ago.
update app.gate_duty set seen_at = app.clock() where profile_id = '00000000-0000-0000-0000-000000059a01';
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-000000059a04');
do $$ begin
  perform public.gate_heard('00000000-0000-0000-0000-000000059d02');
  raise exception 'FAIL: a parent reported an announcement';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.gate_delivery_report();
  raise exception 'FAIL: a parent saw the delivery report';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.push_receipt(1, gen_random_uuid(), 'displayed');
  raise exception 'FAIL: a signed-in person called push_receipt directly';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform 1 from app.push_outbox;
  raise exception 'FAIL: a signed-in person read the outbox';
exception when insufficient_privilege then null;
end $$;
select pg_temp.as_who('00000000-0000-0000-0000-000000059a01');
select public.gate_heard('00000000-0000-0000-0000-000000059d02');
select public.gate_heard('00000000-0000-0000-0000-000000059d02');
do $$ declare r json; me json; t json; begin
  r := public.gate_delivery_report();
  select x into me from json_array_elements(r -> 'staff') x where x ->> 'id' = '00000000-0000-0000-0000-000000059a01';
  assert json_array_length(me -> 'web') = 1 and json_array_length(me -> 'phones') = 1 and (me ->> 'on_duty')::boolean, 'Asha: web app, phone, on duty: ' || me::text;
  assert me -> 'web' -> 0 ->> 'last_displayed' is not null, 'Asha''s web app displayed an alert earlier';
  assert exists (select 1 from json_array_elements(r -> 'staff') x where x ->> 'id' = '00000000-0000-0000-0000-000000059a03' and json_array_length(x -> 'web') = 1), 'Chitra listed';
  assert not exists (select 1 from json_array_elements(r -> 'staff') x where x ->> 'id' = '00000000-0000-0000-0000-000000059a04'), 'parents are not listed';
  select x into t from json_array_elements(r -> 'trips') x where x ->> 'id' = '00000000-0000-0000-0000-000000059d02';
  assert (t ->> 'heard')::int = 1 and t ->> 'child' = 'Ishaan', 'heard once by one person: ' || t::text;
  assert (t ->> 'queued')::int > 0 and (t ->> 'dispatched')::int = 0 and (t ->> 'reminders')::int >= 1 and (t ->> 'escalated')::boolean, 'queued, escalated, nothing claimed yet: ' || t::text;
  assert not exists (select 1 from json_array_elements(r -> 'trips') x where x ->> 'id' = '00000000-0000-0000-0000-000000059d01'), 'closed trips are left out';
end $$;
reset role;
do $$ begin assert (select count(*) from app.gate_heard where trip_id = '00000000-0000-0000-0000-000000059d02') = 1, 'one row per person and trip'; end $$;
-- Only the child's gate team or a Center Leader can say it was heard: Ishaan's class is now Asha's alone.
insert into public.coordinator_classes values ('00000000-0000-0000-0000-000000059a01', '00000000-0000-0000-0000-00000000c001');
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-000000059a02');
select public.gate_heard('00000000-0000-0000-0000-000000059d02');
select pg_temp.as_who('00000000-0000-0000-0000-000000059a03');
select public.gate_heard('00000000-0000-0000-0000-000000059d02');
reset role;
do $$ begin
  assert not exists (select 1 from app.gate_heard where profile_id = '00000000-0000-0000-0000-000000059a02'), 'Bina does not cover Ishaan';
  assert exists (select 1 from app.gate_heard where profile_id = '00000000-0000-0000-0000-000000059a03'), 'the Center Leader may';
end $$;
delete from public.coordinator_classes;

-- 6b. The parent's reason for an unusual time never reaches a lock screen.
delete from app.push_outbox;
insert into public.trips (id, child_id, direction, day, arrive_at, created_by, traveller_name, traveller_relation, created_at, off_schedule, reason)
  values ('00000000-0000-0000-0000-000000059d04', '00000000-0000-0000-0000-000000059c01', 'dropoff', app.today(), app.clock() + interval '20 minutes',
    '00000000-0000-0000-0000-000000059a04', 'Divya Patil', 'Mother', app.clock(), true, 'Doctor appointment for his asthma');
do $$ begin
  assert exists (select 1 from app.push_outbox where tag = 'trip-00000000-0000-0000-0000-000000059d04' and url = '/coordinator' and body like '%Outside the usual time.'), 'says the time is unusual';
  assert not exists (select 1 from app.push_outbox where body like '%asthma%' or title like '%asthma%'), 'never the reason';
end $$;
update public.trips set status = 'cancelled', closed_by = '00000000-0000-0000-0000-000000059a04', closed_at = app.clock() where id = '00000000-0000-0000-0000-000000059d04';

-- 7. Device readiness: a test alert, its status per device, and the person's word that they heard it ----------------------------------
delete from app.push_outbox;
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-000000059a04');
do $$ begin
  perform public.send_test_push();
  raise exception 'FAIL: a parent sent a test alert';
exception when insufficient_privilege then null;
end $$;
select pg_temp.as_who('00000000-0000-0000-0000-000000059a01');
create temp table test_tag as select public.send_test_push() as tag;
do $$ begin
  perform public.send_test_push();
  raise exception 'FAIL: two tests within a minute';
exception when sqlstate 'P0001' then null;
end $$;
do $$ declare t text := (select tag from test_tag); begin
  assert (select count(*) from public.test_push_status(t)) = 2, 'one row per device';
  assert (select count(*) from public.test_push_status(t) where platform = 'web' and endpoint = 'https://web.push.apple.com/asha') = 1, 'the web row names its endpoint';
  assert not public.confirm_test_heard('https://web.push.apple.com/asha'), 'not before the device displayed it';
end $$;
select pg_temp.as_who('00000000-0000-0000-0000-000000059a03');
do $$ begin
  assert (select count(*) from public.test_push_status((select tag from test_tag))) = 0, 'nobody sees someone else''s test';
  assert not public.confirm_test_heard('https://web.push.apple.com/asha'), 'nobody confirms someone else''s device';
end $$;
reset role;
do $$ declare o app.push_outbox; begin
  assert (select bool_and(not_before > now() + interval '8 seconds' and expires_at < now() + interval '6 minutes') from app.push_outbox where tag = (select tag from test_tag)), 'sent in 10 seconds, kept 5 minutes';
  assert (select count(*) from public.push_claim(1000) where tag = (select tag from test_tag)) = 0, 'held until then';
  update app.push_outbox set not_before = null where tag = (select tag from test_tag);
  perform public.push_claim(1000);
  select * into o from app.push_outbox where tag = (select tag from test_tag) and subscription_id is not null;
  assert public.push_receipt(o.id, o.receipt, 'displayed'), 'the device displayed it';
  assert (select last_test_at is not null from public.push_subscriptions where endpoint = 'https://web.push.apple.com/asha'), 'the device remembers its last test';
end $$;
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-000000059a01');
do $$ begin
  assert (select displayed_at is not null from public.test_push_status((select tag from test_tag)) where platform = 'web'), 'status shows displayed';
  assert public.confirm_test_heard('https://web.push.apple.com/asha'), 'heard';
end $$;
reset role;
do $$ begin assert (select test_heard_at is not null from public.push_subscriptions where endpoint = 'https://web.push.apple.com/asha'), 'recorded'; end $$;

-- 8. Review fixes ------------------------------------------------------------------------------------------------------------------------
-- A device that moves to someone else (a shared iPad) never receives what was queued for its last owner, and starts with no evidence.
delete from app.push_outbox;
select app.notify(array['00000000-0000-0000-0000-000000059a03']::uuid[], 'For Chitra', 'Body', '/', 'x-moved');
update public.push_subscriptions set test_heard_at = now(), last_test_at = now() where endpoint = 'https://fcm.googleapis.com/fcm/send/chitra';
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-000000059a02');
select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/chitra', repeat('p', 60), repeat('a', 20), 'iPad');
do $$ begin
  perform public.test_push_status('test-x');
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, test_heard_at) values ('00000000-0000-0000-0000-000000059a02', 'https://x/forged', repeat('p', 60), repeat('a', 20), now());
  raise exception 'FAIL: a signed-in person inserted a device with evidence directly';
exception when insufficient_privilege then null;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.push_claim(1000) where tag = 'x-moved') = 0, 'not sent to the new owner';
  assert (select result from app.push_outbox where tag = 'x-moved') = 'gone', 'marked gone';
  assert (select test_heard_at is null and last_test_at is null from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/chitra'), 'the new owner starts with no evidence';
end $$;

-- Replaying a receipt does not move the device's evidence again.
delete from app.push_outbox;
select app.notify(array['00000000-0000-0000-0000-000000059a01']::uuid[], 'Once', 'Body', '/', 'x-replay');
do $$ declare o app.push_outbox; first timestamptz; begin
  perform public.push_claim(1000);
  select * into o from app.push_outbox where tag = 'x-replay' and subscription_id is not null;
  assert public.push_receipt(o.id, o.receipt, 'displayed'), 'first';
  update public.push_subscriptions set last_displayed_at = now() - interval '1 hour' where id = o.subscription_id;
  select last_displayed_at into first from public.push_subscriptions where id = o.subscription_id;
  assert public.push_receipt(o.id, o.receipt, 'displayed'), 'a replay is accepted';
  assert (select last_displayed_at = first from public.push_subscriptions where id = o.subscription_id), 'but changes nothing';
end $$;

-- A late answer from a run whose claim was requeued is ignored, so the alert is not sent twice.
delete from app.push_outbox;
select app.notify(array['00000000-0000-0000-0000-000000059a02']::uuid[], 'Late', 'Body', '/', 'x-late');
do $$ declare o bigint; begin
  select outbox_id into o from public.push_claim(1000) where tag = 'x-late';
  update app.push_outbox set sent_at = now() - interval '3 minutes' where id = o;
  perform app.push_requeue_stuck();
  assert (select result = 'requeued' and sent_at is null from app.push_outbox where id = o), 'requeued';
  perform public.push_result(o, 'sent');
  assert (select result = 'requeued' and sent_at is null from app.push_outbox where id = o), 'the late answer is ignored';
  assert (select count(*) from public.push_claim(1000) where tag = 'x-late') = 1, 'claimed again once';
  perform public.push_result(o, 'sent');
  assert (select result = 'sent' and sent_at is not null from app.push_outbox where id = o), 'the new answer counts';
end $$;

update public.trips set status = 'cancelled', closed_by = '00000000-0000-0000-0000-000000059a01', closed_at = app.clock() where id = '00000000-0000-0000-0000-000000059d02';
delete from app.gate_duty;
delete from app.gate_reminders;
delete from app.push_outbox;
reset app.now;
