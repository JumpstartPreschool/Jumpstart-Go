-- 0054 (D57): a family's message reaches the office's phones, each opening their own inbox; the school's reply reaches
-- the family; nobody hears their own message. c1 is Head office; Farida (ff01) is Front desk; Parent B (e2) is Meera's
-- (c0002) father.
insert into public.profiles (id, full_name, active, phone) values ('00000000-0000-0000-0000-00000000ff01', 'Farida Desk', true, '+919811500001');
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-00000000ff01', '919811500001');
update public.profiles set user_id = id where id = '00000000-0000-0000-0000-00000000ff01';
insert into public.staff_roles values ('00000000-0000-0000-0000-00000000ff01', 'pro');
update public.profiles set app_access = true, active = true
  where id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000ff01', '00000000-0000-0000-0000-0000000000e2');
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-0000000000c1', 'https://fcm.googleapis.com/fcm/send/msg-c1', repeat('p', 60), repeat('a', 20)),
  ('00000000-0000-0000-0000-00000000ff01', 'https://fcm.googleapis.com/fcm/send/msg-ff01', repeat('p', 60), repeat('a', 20)),
  ('00000000-0000-0000-0000-0000000000e2', 'https://fcm.googleapis.com/fcm/send/msg-e2', repeat('p', 60), repeat('a', 20));
delete from app.push_outbox;

set role authenticated;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
select (public.send_message('00000000-0000-0000-0000-0000000c0002', 'Meera has a cough today')).id is not null;
reset role;
do $$ begin
  assert (select url from app.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000c1') = '/core/messages?child=00000000-0000-0000-0000-0000000c0002', 'Head office opens its inbox';
  assert (select url from app.push_outbox where profile_id = '00000000-0000-0000-0000-00000000ff01') = '/pro/messages?child=00000000-0000-0000-0000-0000000c0002', 'the front desk opens its own';
  assert (select body from app.push_outbox where profile_id = '00000000-0000-0000-0000-00000000ff01') like 'Parent: Meera has a cough today', 'says who and what';
  assert not exists (select 1 from app.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000e2'), 'the father does not hear his own message';
end $$;
delete from app.push_outbox;

set role authenticated;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000ff01"}';
select (public.send_message('00000000-0000-0000-0000-0000000c0002', 'Thanks, we will keep an eye on her')).id is not null;
reset role;
do $$ begin
  assert (select url from app.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000e2') = '/parent/messages/00000000-0000-0000-0000-0000000c0002', 'the family hears the reply';
  assert not exists (select 1 from app.push_outbox where profile_id = '00000000-0000-0000-0000-00000000ff01'), 'the sender does not hear their own reply';
  -- c1 is also Meera's aunt (zz_school_day.test.sql), so she hears the reply as family, with the family's link.
  assert (select url from app.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000c1') = '/parent/messages/00000000-0000-0000-0000-0000000c0002', 'staff who are family hear it as family';
end $$;
