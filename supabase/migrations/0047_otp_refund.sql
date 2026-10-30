-- 0047: a sign-in code that WATI never sent gives its place back, so a WATI problem (no credit, a template awaiting
-- approval) never locks people out with "Too many attempts". Only codes that really went out count toward the
-- 6 an hour per number (0044).
create function public.otp_send_refund(p_phone text) returns void
language sql volatile security definer set search_path = '' as $$
  delete from app.throttle_log
  where ctid = (select ctid from app.throttle_log where key = 'otp:+' || ltrim(coalesce(p_phone, ''), '+') order by at desc limit 1);
$$;
revoke execute on function public.otp_send_refund(text) from public, anon, authenticated;
grant execute on function public.otp_send_refund(text) to service_role;
