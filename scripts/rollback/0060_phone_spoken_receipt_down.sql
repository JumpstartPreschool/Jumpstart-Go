-- Undoes 0060 (the Android app's 'spoken' receipt). Any order with the apps and functions: an app or push-send that
-- still sends 'spoken' just has it refused. The spoken_at column and the heard rows already recorded stay.
begin;
-- As 0059.
create or replace function public.push_receipt(p_outbox bigint, p_receipt uuid, p_event text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare o app.push_outbox;
begin
  select * into o from app.push_outbox
  where id = p_outbox and receipt = p_receipt and p_event in ('displayed', 'opened') and created_at > now() - interval '1 day'
  for update;
  if not found then return false; end if;
  update app.push_outbox set
    displayed_at = coalesce(displayed_at, now()),
    opened_at = case when p_event = 'opened' then coalesce(opened_at, now()) else opened_at end
  where id = o.id;
  -- The device's evidence moves only on the first report, and only while it still belongs to the person it was sent to.
  if o.displayed_at is null then
    update public.push_subscriptions set last_displayed_at = now(),
      last_test_at = case when o.tag like 'test-%' then now() else last_test_at end
    where id = o.subscription_id and profile_id = o.profile_id;
  end if;
  return true;
end $$;
commit;
