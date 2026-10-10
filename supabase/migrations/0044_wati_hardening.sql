-- WhatsApp sign-in hardening (follows 0039). Where the code goes and how it is limited, and how sends are logged.
--
--   * The hourly limit per number is counted where the code is sent (the send-sms hook), so calling Supabase Auth
--     directly cannot get round it, and phone_login_allowed no longer counts anything, so a stranger typing someone's
--     number into the sign-in screen cannot use up that person's codes.
--   * A send is logged before WATI is called, so WATI's status webhook always finds the row. whatsapp_log_finish adds
--     WATI's answer to it.
--   * A +91 number must be a real Indian mobile (10 digits starting 6 to 9), which is all WATI will deliver to.

-- 1. The sign-in screen's check is a plain lookup -------------------------------------------------------------------------
create or replace function public.phone_login_allowed(p_phone text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  e164 text := app.e164(p_phone);
begin
  if e164 is null then return false; end if;
  return exists (select 1 from public.profiles where active and app_access and phone = e164);
end $$;
revoke execute on function public.phone_login_allowed(text) from public;
grant execute on function public.phone_login_allowed(text) to anon, authenticated;

-- 2. The per-number limit, counted by the send-sms hook (service role only) ------------------------------------------------
-- 6 codes an hour per number. False when the hour's allowance is used up; true counts one send.
create function public.otp_send_allowed(p_phone text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.throttle('otp:+' || ltrim(coalesce(p_phone, ''), '+'), 6, interval '1 hour');
  return true;
exception when sqlstate 'P0001' then
  return false;
end $$;
revoke execute on function public.otp_send_allowed(text) from public, anon, authenticated;
grant execute on function public.otp_send_allowed(text) to service_role;

-- 3. Log first, finish after ----------------------------------------------------------------------------------------------
-- Adds WATI's answer to a row written before the send: the broadcast id, or the failure category (only while the row is
-- still "accepted", so a status the webhook already recorded is never overwritten).
create function public.whatsapp_log_finish(p_local_id text, p_broadcast_id text, p_error text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  update app.whatsapp_log
  set broadcast_id = coalesce(p_broadcast_id, broadcast_id),
      status = case when p_error is not null and status = 'accepted' then 'failed_to_send' else status end,
      failed_at = case when p_error is not null and status = 'accepted' then now() else failed_at end,
      error_category = case when p_error is not null and status = 'accepted' then left(p_error, 100) else error_category end
  where local_message_id = p_local_id;
end $$;
revoke execute on function public.whatsapp_log_finish(text, text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_log_finish(text, text, text) to service_role;

-- A send that timed out on our side may still have reached WATI: its later "sent", "delivered" or "read" moves a
-- failed_to_send row on, as it does an accepted one. "failed" is always recorded, and nothing goes backwards.
create or replace function public.whatsapp_log_status(p_local_id text, p_status text, p_error text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  cur text;
  rank_new int := case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 end;
  rank_cur int;
begin
  if p_status <> 'failed' and rank_new is null then
    raise exception 'bad_status: Use sent, delivered, read or failed.' using errcode = 'P0001';
  end if;
  select status into cur from app.whatsapp_log where local_message_id = p_local_id for update;
  if not found then return false; end if;
  if p_status = 'failed' then
    update app.whatsapp_log
    set status = 'failed', failed_at = coalesce(failed_at, now()), error_category = left(coalesce(p_error, error_category), 100)
    where local_message_id = p_local_id;
    return true;
  end if;
  rank_cur := case cur when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'accepted' then 0 when 'failed_to_send' then 0 end;
  if rank_cur is null or rank_new <= rank_cur then return true; end if; -- failed rows and repeats stay as they are
  update app.whatsapp_log
  set status = p_status,
      sent_at = coalesce(sent_at, now()),
      delivered_at = case when rank_new >= 2 then coalesce(delivered_at, now()) else delivered_at end,
      read_at = case when rank_new >= 3 then coalesce(read_at, now()) else read_at end
  where local_message_id = p_local_id;
  return true;
end $$;

-- 4. +91 numbers are Indian mobiles ---------------------------------------------------------------------------------------
-- app.e164 reads a +91 number only when it is a mobile; every place a number is saved (admin edits, relatives, bulk
-- import, new staff) goes through the trigger below as well.
create or replace function app.e164(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when digits ~ '^[6-9][0-9]{9}$' then '+91' || digits
    when digits ~ '^\+?91' then case when digits ~ '^\+?91[6-9][0-9]{9}$' then '+' || ltrim(digits, '+') end
    when digits ~ '^\+[1-9][0-9]{7,14}$' then digits
    when digits ~ '^[1-9][0-9]{7,14}$' then '+' || digits
  end
  from (select regexp_replace(coalesce(p, ''), '[\s().-]', '', 'g') as digits) x
$$;

create function app.guard_indian_mobile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.phone ~ '^\+91' and new.phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'bad_phone: Enter a mobile number: 10 digits starting with 6, 7, 8 or 9.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.guard_indian_mobile() from public, anon, authenticated;
create trigger guard_indian_mobile_insert before insert on public.profiles
  for each row execute function app.guard_indian_mobile();
create trigger guard_indian_mobile_update before update of phone on public.profiles
  for each row when (new.phone is distinct from old.phone) execute function app.guard_indian_mobile();
