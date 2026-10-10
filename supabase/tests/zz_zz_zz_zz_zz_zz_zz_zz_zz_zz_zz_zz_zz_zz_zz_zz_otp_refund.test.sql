-- 0047: a failed send gives its place back; a sent one keeps it.
do $$
declare i int;
begin
  delete from app.throttle_log where key = 'otp:+919844470001';
  for i in 1..6 loop
    assert public.otp_send_allowed('919844470001'), 'send ' || i;
    perform public.otp_send_refund('919844470001'); -- every one failed at WATI
  end loop;
  assert public.otp_send_allowed('+919844470001'), 'failed sends never lock the number';
  for i in 1..5 loop assert public.otp_send_allowed('919844470001'), 'sent ' || i; end loop;
  assert not public.otp_send_allowed('919844470001'), 'six real sends still use up the hour';
end $$;
do $$
begin
  set local role authenticated;
  perform public.otp_send_refund('919844470001');
  raise exception 'FAIL: a signed-in person could give back sign-in code places';
exception when insufficient_privilege then null;
end $$;
