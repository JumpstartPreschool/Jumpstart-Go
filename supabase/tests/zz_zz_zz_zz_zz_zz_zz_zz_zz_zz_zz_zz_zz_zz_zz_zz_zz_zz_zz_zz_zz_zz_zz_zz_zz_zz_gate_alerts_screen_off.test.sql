-- 0058: phone tokens, server-side repeating gate alerts, the silent-device alert, first names on the lock screen.
-- Its own people:  K  Kavita, Center Coordinator on duty   M  Meena, Center Coordinator off duty   L  Lalita, Center Leader
--                  P  Pooja, parent of Arnav (Jr KG)
-- The app clock is pinned to Wednesday 11:00 India time, so none of this depends on when the tests run.
insert into public.profiles (id, full_name, active, app_access, phone, user_id) values
  ('00000000-0000-0000-0000-000000058a01', 'Kavita Coordinator', true, true, '+919811580001', null),
  ('00000000-0000-0000-0000-000000058a02', 'Meena Coordinator', true, true, '+919811580002', null),
  ('00000000-0000-0000-0000-000000058a03', 'Lalita Leader', true, true, '+919811580003', null),
  ('00000000-0000-0000-0000-000000058a04', 'Pooja Parent', true, true, '+919811580004', null);
insert into auth.users (id, phone) select id, right(phone, 12) from public.profiles where id::text like '00000000-0000-0000-0000-000000058a%';
update public.profiles set user_id = id where id::text like '00000000-0000-0000-0000-000000058a%';
insert into public.staff_roles values
  ('00000000-0000-0000-0000-000000058a01', 'coordinator'), ('00000000-0000-0000-0000-000000058a02', 'coordinator'), ('00000000-0000-0000-0000-000000058a03', 'leader');
insert into public.children (id, full_name, date_of_birth, class_id, programme_id) values
  ('00000000-0000-0000-0000-000000058c01', 'Arnav Rao', '2021-07-01', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001');
insert into public.guardianships values ('00000000-0000-0000-0000-000000058c01', '00000000-0000-0000-0000-000000058a04', 'Mother');
-- Nobody is assigned to a class, so every gate person covers every child.
delete from public.coordinator_classes;
delete from app.gate_duty;
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

-- 1. Phone tokens ---------------------------------------------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-000000058a01');
select public.save_device_token('android', repeat('k', 40), '1.0.0');
do $$ begin
  perform public.save_device_token('windows', repeat('k', 40));
  raise exception 'FAIL: a bad platform was saved';
exception when sqlstate 'P0001' then null;
end $$;
do $$ begin
  perform public.save_device_token('android', 'short');
  raise exception 'FAIL: a short token was saved';
exception when sqlstate 'P0001' then null;
end $$;
select pg_temp.as_who('00000000-0000-0000-0000-000000058a02');
select public.save_device_token('android', repeat('k', 40), '1.0.1');   -- the same phone, now Meena's
select pg_temp.as_who('00000000-0000-0000-0000-000000058a03');
select public.save_device_token('android', repeat('l', 40));
do $$ begin
  assert (select count(*) from public.device_tokens) = 1, 'a person sees only their own phones';
  perform public.delete_device_token(repeat('k', 40));
  assert (select count(*) from public.device_tokens) = 1, 'deleting someone else''s token does nothing';
end $$;
reset role;
do $$ begin
  assert (select profile_id from public.device_tokens where token = repeat('k', 40)) = '00000000-0000-0000-0000-000000058a02', 'the phone moved to whoever signed in';
  assert (select count(*) from public.device_tokens where token = repeat('k', 40)) = 1, 'one row per phone';
end $$;
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-000000058a02');
select public.delete_device_token(repeat('k', 40));
reset role;
do $$ begin
  assert not exists (select 1 from public.device_tokens where token = repeat('k', 40)), 'a person can delete their own token';
end $$;
-- Kavita and Pooja each get a phone that is the only way to reach them: notify counts a token as reachable.
insert into public.device_tokens (profile_id, platform, token) values
  ('00000000-0000-0000-0000-000000058a01', 'android', repeat('a', 40)),
  ('00000000-0000-0000-0000-000000058a02', 'android', repeat('b', 40));
do $$ begin
  perform app.notify(array['00000000-0000-0000-0000-000000058a01', '00000000-0000-0000-0000-000000058a04']::uuid[], 'Hello', 'Body', '/', 'x-1');
  assert (select count(*) from app.push_outbox where tag = 'x-1') = 1, 'a person with only a phone token is told; one with no device is not';
  assert (select profile_id from app.push_outbox where tag = 'x-1') = '00000000-0000-0000-0000-000000058a01', 'it was the token holder';
end $$;

-- 2. push_claim: web and native rows for one alert ------------------------------------------------------------------------------------
delete from app.push_outbox;
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-000000058a01', 'https://fcm.googleapis.com/fcm/send/ga-1', repeat('p', 60), repeat('a', 20));
select app.notify(array['00000000-0000-0000-0000-000000058a01']::uuid[], 'Both', 'Body', '/', 'x-2');
do $$ declare c int; begin
  select count(*) into c from public.push_claim(10);
  assert c = 2, 'one row for the web subscription and one for the phone, got ' || c;
  assert (select count(*) from app.push_outbox where sent_at is not null and result = 'sending') = 1, 'one outbox row claimed';
end $$;
update app.push_outbox set sent_at = null, attempts = 0, result = null;
do $$ begin
  assert (select count(*) from public.push_claim(10) where platform = 'web' and endpoint is not null and p256dh is not null and token is null and subscription_id is not null) = 1, 'the web row has endpoint and keys';
end $$;
update app.push_outbox set sent_at = null, attempts = 0, result = null;
do $$ begin
  assert (select count(*) from public.push_claim(10) where platform = 'android' and token = repeat('a', 40) and endpoint is null and subscription_id is null) = 1, 'the native row has the token';
end $$;
select public.push_forget_token(repeat('a', 40));
do $$ begin
  assert not exists (select 1 from public.device_tokens where token = repeat('a', 40)), 'a token Firebase refuses is forgotten';
end $$;
delete from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ga-1';
insert into public.device_tokens (profile_id, platform, token) values ('00000000-0000-0000-0000-000000058a01', 'android', repeat('a', 40));

delete from app.push_outbox;

-- 3. Repeating gate alerts -----------------------------------------------------------------------------------------------------------------
update public.gate_announcement_settings set reminder_min = 2;
-- Kavita is on duty today, Meena is not.
insert into app.gate_duty (profile_id, started_at, seen_at) values
  ('00000000-0000-0000-0000-000000058a01', app.clock() - interval '1 hour', app.clock());
insert into public.trips (id, child_id, direction, day, arrive_at, created_by, traveller_name, traveller_relation, created_at)
  values ('00000000-0000-0000-0000-000000058d01', '00000000-0000-0000-0000-000000058c01', 'pickup', app.today(), app.clock() + interval '12 minutes',
    '00000000-0000-0000-0000-000000058a04', 'Meera Rao', 'Aunt', app.clock());
-- The alert the trigger sent at once has the child's first name only.
do $$ begin
  assert exists (select 1 from app.push_outbox where profile_id = '00000000-0000-0000-0000-000000058a01' and title = 'Arnav, pickup at ' || app.hm(app.clock() + interval '12 minutes')), 'first name only in the gate alert: ' || (select string_agg(title, '|') from app.push_outbox);
  assert not exists (select 1 from app.push_outbox where title like '%Rao%'), 'no surname in the title';
end $$;
delete from app.push_outbox;

select pg_temp.clock(110);
do $$ begin
  assert app.send_gate_reminders() = 0, 'no reminder before reminder_min';
end $$;
select pg_temp.clock(120);
do $$ begin
  assert app.send_gate_reminders() = 1, 'a reminder at reminder_min';
  assert pg_temp.got('00000000-0000-0000-0000-000000058a01', 'Reminder: Arnav, pickup at %') = 1, 'the coordinator on duty hears it';
  assert pg_temp.got('00000000-0000-0000-0000-000000058a02', 'Reminder%') = 0 and pg_temp.got('00000000-0000-0000-0000-000000058a03', 'Reminder%') = 0, 'people off duty are left alone while someone is on duty';
  assert (select tag from app.push_outbox where title like 'Reminder%') = 'trip-00000000-0000-0000-0000-000000058d01', 'it replaces the trip''s older alert';
  assert app.send_gate_reminders() = 0, 'not twice in the same minute';
end $$;
select pg_temp.clock(180);
do $$ begin assert app.send_gate_reminders() = 0, 'not again after one minute'; end $$;
select pg_temp.clock(240);
do $$ begin
  assert app.send_gate_reminders() = 1, 'again after reminder_min more';
  assert (select sent from app.gate_reminders) = 2, 'counted';
end $$;
-- A cap of 30.
update app.gate_reminders set sent = 30;
select pg_temp.clock(400);
do $$ begin assert app.send_gate_reminders() = 0, 'stops after 30'; end $$;
-- New news after the cap (the collector arrives): a fresh count.
update public.trips set arrived_at = app.clock() where id = '00000000-0000-0000-0000-000000058d01';
do $$ begin assert not exists (select 1 from app.gate_reminders), 'an arrival after the cap starts a fresh count'; end $$;
update public.trips set arrived_at = null where id = '00000000-0000-0000-0000-000000058d01';

-- Acknowledged: it stops.
update public.trips set acknowledged_by = '00000000-0000-0000-0000-000000058a01', acknowledged_at = app.clock() where id = '00000000-0000-0000-0000-000000058d01';
do $$ begin
  assert not exists (select 1 from app.gate_reminders), 'acknowledging ends the cycle';
  assert app.send_gate_reminders() = 0, 'acknowledged, so no reminder';
end $$;
select pg_temp.clock(1000);
do $$ begin assert app.send_gate_reminders() = 0, 'still none later'; end $$;

-- The collector arrives after the acknowledgement: a fresh cycle, with the collector named.
update public.trips set arrived_at = app.clock() where id = '00000000-0000-0000-0000-000000058d01';
delete from app.push_outbox;
select pg_temp.clock(1060);
do $$ begin assert app.send_gate_reminders() = 0, 'a minute after arriving is too soon'; end $$;
select pg_temp.clock(1120);
do $$ begin
  assert app.send_gate_reminders() = 1, 'reminded about the arrival';
  assert pg_temp.got('00000000-0000-0000-0000-000000058a01', 'Reminder: Meera has arrived for Arnav') = 1, 'names the collector and the child';
  assert (select sent from app.gate_reminders) = 1, 'a new count';
end $$;
update public.trips set acknowledged_at = app.clock() where id = '00000000-0000-0000-0000-000000058d01';
do $$ begin assert not exists (select 1 from app.gate_reminders), 'acknowledging the arrival ends it'; end $$;

-- A finished trip is never reminded about.
update public.trips set status = 'cancelled', closed_by = '00000000-0000-0000-0000-000000058a01', closed_at = app.clock() where id = '00000000-0000-0000-0000-000000058d01';

-- Nobody on duty: everyone who covers the child hears it.
delete from app.gate_duty;
delete from app.push_outbox;
select pg_temp.clock(2000);
insert into public.trips (id, child_id, direction, day, arrive_at, created_by, traveller_name, created_at)
  values ('00000000-0000-0000-0000-000000058d02', '00000000-0000-0000-0000-000000058c01', 'dropoff', app.today(), app.clock() + interval '10 minutes',
    '00000000-0000-0000-0000-000000058a04', 'Pooja Rao', app.clock());
select pg_temp.clock(2120);
delete from app.push_outbox;
do $$ begin
  assert app.send_gate_reminders() = 1, 'one trip reminded';
  assert pg_temp.got('00000000-0000-0000-0000-000000058a01', 'Reminder: Arnav, drop-off at %') = 1
    and pg_temp.got('00000000-0000-0000-0000-000000058a02', 'Reminder: Arnav, drop-off at %') = 1
    and pg_temp.got('00000000-0000-0000-0000-000000058a03', 'Reminder: Arnav, drop-off at %') = 1, 'with nobody on duty, everyone covering the child hears it';
end $$;
-- A duty that began on an earlier day does not count as on duty today.
insert into app.gate_duty (profile_id, started_at, seen_at) values ('00000000-0000-0000-0000-000000058a02', app.clock() - interval '1 day', app.clock());
delete from app.push_outbox;
select pg_temp.clock(2240);
do $$ begin
  assert app.send_gate_reminders() = 1, 'reminded again';
  assert pg_temp.got('00000000-0000-0000-0000-000000058a01', 'Reminder%') = 1, 'yesterday''s duty is ignored, so everyone is told';
end $$;
update public.trips set status = 'cancelled', closed_by = '00000000-0000-0000-0000-000000058a01', closed_at = app.clock() where id = '00000000-0000-0000-0000-000000058d02';
delete from app.gate_duty;

-- 4. A device on duty that goes silent ------------------------------------------------------------------------------------------------------
select pg_temp.clock(3000);
delete from app.push_outbox;
insert into app.gate_duty (profile_id, started_at, seen_at) values
  ('00000000-0000-0000-0000-000000058a02', app.clock() - interval '1 hour', app.clock() - interval '90 seconds');
do $$ begin assert app.alert_silent_duty() = 0, 'seen 90 seconds ago is not silent'; end $$;
update app.gate_duty set seen_at = app.clock() - interval '3 minutes';
do $$ begin
  assert app.alert_silent_duty() = 1, 'silent for 3 minutes';
  assert pg_temp.got('00000000-0000-0000-0000-000000058a03', 'No signal from Meena''s device') = 1, 'the Center Leader is told';
  assert pg_temp.got('00000000-0000-0000-0000-000000058a02', 'No signal from Meena''s device') = 1, 'so is the person';
  assert app.alert_silent_duty() = 0, 'once only';
end $$;
-- The device comes back: duty goes on and the session keeps its start.
update app.gate_duty set started_at = now() - interval '1 minute';
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-000000058a02');
do $$ begin
  assert '00000000-0000-0000-0000-000000058a02'::uuid = any (public.gate_heartbeat(true)), 'back on duty';
end $$;
reset role;
do $$ begin
  assert (select started_at < now() - interval '30 seconds' from app.gate_duty), 'a heartbeat keeps the start of the session';
end $$;
-- Silent again soon after: the leaders are not told again within 30 minutes.
update app.gate_duty set started_at = app.clock() - interval '1 hour', silent_alerted_at = app.clock() - interval '10 minutes', seen_at = app.clock() - interval '3 minutes';
do $$ begin assert app.alert_silent_duty() = 0, 'not again within 30 minutes'; end $$;
-- Back after the alert, then silent again more than 30 minutes after it: told again.
update app.gate_duty set silent_alerted_at = app.clock() - interval '40 minutes', seen_at = app.clock() - interval '3 minutes';
do $$ begin assert app.alert_silent_duty() = 1, 'silent again after half an hour, alerted again'; end $$;
-- Silent the whole time since the alert: no repeat.
update app.gate_duty set silent_alerted_at = app.clock() - interval '40 minutes', seen_at = app.clock() - interval '50 minutes';
do $$ begin assert app.alert_silent_duty() = 0, 'one alert per silent spell'; end $$;
-- Ending duty removes the session.
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-000000058a02');
select public.gate_heartbeat(false);
reset role;
do $$ begin assert not exists (select 1 from app.gate_duty), 'ending duty deletes the session'; end $$;
-- Outside 08:00 to 19:30 nobody is woken.
insert into app.gate_duty (profile_id, started_at, seen_at) values
  ('00000000-0000-0000-0000-000000058a02', timestamptz '2026-03-04 07:00:00+05:30', timestamptz '2026-03-04 07:30:00+05:30');
select set_config('app.now', '2026-03-04 20:00:00+05:30', false);
do $$ begin assert app.alert_silent_duty() = 0, 'quiet in the evening'; end $$;
select set_config('app.now', '2026-03-04 07:45:00+05:30', false);
do $$ begin assert app.alert_silent_duty() = 0, 'quiet before 8'; end $$;
select set_config('app.now', '2026-03-04 08:30:00+05:30', false);
do $$ begin assert app.alert_silent_duty() = 1, 'fires in the day'; end $$;
reset app.now;
delete from app.gate_duty;
