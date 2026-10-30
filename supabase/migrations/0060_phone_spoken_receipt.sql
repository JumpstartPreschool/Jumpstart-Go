-- 0060: the Android app says gate alerts aloud in the school's voice in the background, and reports when it has.
--   push_receipt takes a third event, 'spoken': the phone said the alert to its end (the school's recording, or the
--   phone's own voice when a recording couldn't be had). It marks the alert displayed too (a phone speaks only what it
--   received), keeps when it was spoken, and for a gate request counts as the person having heard it (app.gate_heard),
--   as the duty screen's own report does. Accepted, displayed, spoken and acknowledged stay separate facts.
-- Rollback: the previous push_receipt is in 0059; the column can stay (nothing else writes it).

alter table app.push_outbox add column spoken_at timestamptz;

create or replace function public.push_receipt(p_outbox bigint, p_receipt uuid, p_event text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare o app.push_outbox;
begin
  select * into o from app.push_outbox
  where id = p_outbox and receipt = p_receipt and p_event in ('displayed', 'opened', 'spoken') and created_at > now() - interval '1 day'
  for update;
  if not found then return false; end if;
  update app.push_outbox set
    displayed_at = coalesce(displayed_at, now()),
    opened_at = case when p_event = 'opened' then coalesce(opened_at, now()) else opened_at end,
    spoken_at = case when p_event = 'spoken' then coalesce(spoken_at, now()) else spoken_at end
  where id = o.id;
  -- The device's evidence moves only on the first report, and only while it still belongs to the person it was sent to.
  if o.displayed_at is null then
    update public.push_subscriptions set last_displayed_at = now(),
      last_test_at = case when o.tag like 'test-%' then now() else last_test_at end
    where id = o.subscription_id and profile_id = o.profile_id;
  end if;
  -- Said aloud on a gate request: heard by the person it was sent to (only the gate team and leaders are sent these).
  if p_event = 'spoken' and o.url like '/coordinator%' then
    insert into app.gate_heard (trip_id, profile_id)
    select t.id, o.profile_id from public.trips t where o.tag = 'trip-' || t.id::text
    on conflict (trip_id, profile_id) do update set heard_at = now();
  end if;
  return true;
end $$;

revoke all on function public.push_receipt(bigint, uuid, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.push_receipt(bigint, uuid, text) to service_role;
  end if;
end $$;
