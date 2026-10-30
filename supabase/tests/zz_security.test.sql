-- 0017: fixes from the security review. People from foundation.test.sql; Meera c0002 with Parent B e2. Friday 2 Oct 2026.
set app.now = '2026-10-02 16:00:00+05:30';
delete from public.attendance where child_id = '00000000-0000-0000-0000-0000000c0002' and day = '2026-10-02';

-- Three wrong confirmations end the link; a new link starts fresh.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.invite_collector('00000000-0000-0000-0000-0000000c0002', 20, 'Lata Joshi', '+971501234567', 'Aunt');
  perform set_config('test.stoken', r ->> 'token', false);
end $$;
reset role;
set request.jwt.claims to '';
set role anon;
do $$
declare s jsonb;
begin
  assert (public.link_open(current_setting('test.stoken')) ->> 'confirm_tries_left')::int = 3, 'three tries';
  perform public.link_confirm(current_setting('test.stoken'), repeat('d', 40), '1111');
  perform public.link_confirm(current_setting('test.stoken'), repeat('d', 40), '2222');
  s := public.link_confirm(current_setting('test.stoken'), repeat('d', 40), '3333');
  assert (s ->> 'tries_left')::int = 0, 'no tries left';
  begin
    perform public.link_confirm(current_setting('test.stoken'), repeat('d', 40), '4567');
    raise exception 'FAIL: confirmed after three wrong tries';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'link_expired%', sqlerrm;
  end;
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.invite_collector('00000000-0000-0000-0000-0000000c0002', 20, 'Lata Joshi', '+971501234567', 'Aunt');
  perform set_config('test.stoken', r ->> 'token', false);
end $$;
reset role;
set role anon;
do $$ begin
  assert public.link_confirm(current_setting('test.stoken'), repeat('d', 40), '4567') ->> 'code' ~ '^[0-9]{4}$', 'a new link works with the right digits';
end $$;
reset role;

-- An admin can't make someone an admin by editing a role row.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$ begin
  update public.staff_roles set role = 'admin' where profile_id = '00000000-0000-0000-0000-0000000000c1' and role = 'core';
  raise exception 'FAIL: Admin given by an update';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Push: only real push services; someone else's device can't be taken.
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values ('00000000-0000-0000-0000-0000000000d1', 'https://fcm.googleapis.com/fcm/send/ipad', repeat('p', 60), repeat('a', 20));
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$ begin
  perform public.save_push_subscription('https://fcm.googleapis.com/fcm/send/ipad', repeat('x', 60), repeat('y', 20));
  raise exception 'FAIL: took the coordinator''s device';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.save_push_subscription('https://attacker.example/collect', repeat('x', 60), repeat('y', 20));
  raise exception 'FAIL: accepted a non-push host';
exception when check_violation then null;
end $$;
-- A past absence can't be taken back.
do $$ begin
  perform public.undo_absence('00000000-0000-0000-0000-0000000c0002', '2026-09-30');
  raise exception 'FAIL: undid a past day';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'past_day%', sqlerrm;
end $$;
reset role;
delete from public.push_subscriptions;

-- Rate limits (0018): the call over the limit is refused, with the reason.
do $$ begin
  perform app.throttle('test:burst', 2, interval '1 minute');
  perform app.throttle('test:burst', 2, interval '1 minute');
  begin
    perform app.throttle('test:burst', 2, interval '1 minute');
    raise exception 'FAIL: third call allowed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'rate_limited%', sqlerrm;
  end;
  assert (select count(*) from app.throttle_log where key = 'test:burst') = 2, 'the refused call is not counted';
end $$;
