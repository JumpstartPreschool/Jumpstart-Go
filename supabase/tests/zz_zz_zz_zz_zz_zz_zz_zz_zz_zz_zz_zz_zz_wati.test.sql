-- WhatsApp hardening (0044): the limit, log-first, status ordering and Indian mobile numbers.
set session_replication_role = replica;
insert into public.profiles (id, full_name, phone, active, app_access) values
  ('00000000-0000-0000-0000-000000044b01', 'Wati Parent', '+919844400001', true, true),
  ('00000000-0000-0000-0000-000000044b02', 'Singapore Parent', '+6591234567', true, true);
set session_replication_role = origin;

do $$
declare i int; ok boolean;
begin
  -- The sign-in screen's check never counts: 20 checks, then a code can still be sent.
  for i in 1..20 loop
    assert public.phone_login_allowed('+919844400001'), 'registered number refused';
  end loop;
  assert not public.phone_login_allowed('+919844499999'), 'unknown number allowed';
  assert not public.phone_login_allowed('+911234567890'), 'non-mobile +91 allowed';

  -- The send limit: 6 an hour, with or without the +; another number is unaffected.
  for i in 1..6 loop
    assert public.otp_send_allowed('919844400001'), 'send ' || i || ' refused';
  end loop;
  assert not public.otp_send_allowed('+919844400001'), 'seventh send allowed';
  assert public.otp_send_allowed('6591234567'), 'other number limited';
end $$;

-- Only the service role may count a send or finish a log row.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    execute format('set role %I', r);
    begin
      perform public.otp_send_allowed('919844400001');
      raise exception '% called otp_send_allowed', r;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.whatsapp_log_finish('x', null, null);
      raise exception '% called whatsapp_log_finish', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
end $$;

-- Log first, then finish; a webhook status that already arrived is never overwritten.
do $$
declare st text; bc text; err text;
begin
  perform public.whatsapp_log_add('00000000-0000-0000-0000-000000044b01', '+919844400001', 'signin_code', 't', 'L-ok', null, 'accepted', null);
  assert public.whatsapp_log_status('L-ok', 'delivered', null), 'row missing';
  perform public.whatsapp_log_finish('L-ok', 'bc-1', null);
  select status, broadcast_id into st, bc from app.whatsapp_log where local_message_id = 'L-ok';
  assert st = 'delivered' and bc = 'bc-1', 'finish changed status: ' || st;
  assert public.whatsapp_log_status('L-ok', 'sent', null), 'late sent refused';
  select status into st from app.whatsapp_log where local_message_id = 'L-ok';
  assert st = 'delivered', 'status went backwards: ' || st;

  -- A failed hand-over is recorded; a later webhook "sent" moves it on, and "failed" is always recorded.
  perform public.whatsapp_log_add('00000000-0000-0000-0000-000000044b01', '+919844400001', 'signin_code', 't', 'L-fail', null, 'accepted', null);
  perform public.whatsapp_log_finish('L-fail', null, 'timeout');
  select status, error_category into st, err from app.whatsapp_log where local_message_id = 'L-fail';
  assert st = 'failed_to_send' and err = 'timeout', 'failure not recorded';
  assert public.whatsapp_log_status('L-fail', 'sent', null), 'row missing';
  select status into st from app.whatsapp_log where local_message_id = 'L-fail';
  assert st = 'sent', 'late sent did not move a failed_to_send row: ' || st;
  assert public.whatsapp_log_status('L-fail', 'failed', 'Undeliverable'), 'row missing';
  select status, error_category into st, err from app.whatsapp_log where local_message_id = 'L-fail';
  assert st = 'failed' and err = 'Undeliverable', 'failed not recorded';
  assert not public.whatsapp_log_status('ghost', 'sent', null), 'unknown id found';
end $$;

-- +91 numbers must be Indian mobiles, whichever way they are saved.
do $$
begin
  assert app.e164('9844400002') = '+919844400002' and app.e164('+91 98444 00002') = '+919844400002', 'mobile not read';
  assert app.e164('+911234567890') is null and app.e164('911234567890') is null, 'non-mobile +91 read';
  assert app.e164('+6591234567') = '+6591234567' and app.e164('+14155552671') = '+14155552671', 'other country changed';
  begin
    insert into public.profiles (full_name, phone) values ('Bad Number', '+911234567890');
    raise exception 'a non-mobile +91 number was saved';
  exception when sqlstate 'P0001' then
    assert sqlerrm like 'bad_phone:%', sqlerrm;
  end;
  begin
    update public.profiles set phone = '+91984440' where id = '00000000-0000-0000-0000-000000044b01';
    raise exception 'a short +91 number was saved';
  exception when sqlstate 'P0001' then null;
  end;
  update public.profiles set phone = '+919844400003' where id = '00000000-0000-0000-0000-000000044b01';
  update public.profiles set phone = '+14155552671' where id = '00000000-0000-0000-0000-000000044b02';
end $$;
