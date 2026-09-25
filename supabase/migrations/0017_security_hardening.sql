-- Security review of 0008–0016 (2026-09-25), before any family data goes live:
-- 1. A pickup link alone no longer gets the gate code: the person confirms with the last 4 digits of the mobile the parent
--    entered (3 tries, then the link ends and the parent sends a new one). One phone only, even if two confirm at once.
-- 2. Once confirmed, opening the link shows nothing but "in use".
-- 3. Staff stop seeing points at the handover by the server's clock, not the phone's.
-- 4. Admin can't be granted or removed by editing a role either. 5. Push devices can't be taken over, and only real push
--    services are accepted. 6. Parents can take back only today's or future absences. 7. Codes are evenly random.

-- 1, 2. The link ------------------------------------------------------------------------------------------------------------
alter table app.trip_links add column confirm_attempts smallint not null default 0 check (confirm_attempts between 0 and 3);

-- A link is alive for today's trip until three wrong confirmations; then only a new link works.
create or replace function app.live_link(p_token text)
returns table (trip public.trips, link app.trip_links)
language sql stable security definer set search_path = '' as $$
  select t, l from app.trip_links l join public.trips t on t.id = l.trip_id
  where l.token_hash = app.sha256(coalesce(p_token, ''))
    and l.confirm_attempts < 3
    and t.day = (app.clock() at time zone 'Asia/Kolkata')::date
    and (t.status = 'en_route' or (t.status = 'handed_over' and t.home_at is null and t.closed_at > app.clock() - interval '60 minutes'))
$$;

-- Before confirming: who, which child and when (the person needs to know it's for them). After: only that it's taken.
create or replace function public.link_open(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select * into r from app.live_link(p_token);
  if not found then
    raise exception 'link_expired: This link has expired or was replaced. Ask the parent to send a new one.' using errcode = 'P0001';
  end if;
  if (r.link).confirmed_at is not null then
    return jsonb_build_object('confirmed', true);
  end if;
  return app.link_summary(r.trip, r.link, false) || jsonb_build_object('confirm_tries_left', 3 - (r.link).confirm_attempts);
end $$;

drop function public.link_confirm(text, text);
-- Confirm on this phone with the last 4 digits of the mobile the parent gave. Right: the link is bound to this phone and
-- the code is returned. Wrong: {ok: false, tries_left} (not raised, so the try is counted).
create function public.link_confirm(p_token text, p_device text, p_last4 text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  l app.trip_links;
begin
  if p_device is null or length(p_device) < 32 then
    raise exception 'bad_device: Open the link again on this phone.' using errcode = 'P0001';
  end if;
  select * into r from app.live_link(p_token);
  if not found then
    raise exception 'link_expired: This link has expired or was replaced. Ask the parent to send a new one.' using errcode = 'P0001';
  end if;
  -- Locked, so two phones confirming at the same moment are taken one after the other.
  select * into l from app.trip_links where trip_id = (r.trip).id for update;
  if l.device_hash is not null then
    if l.device_hash <> app.sha256(p_device) then
      raise exception 'in_use: This link is already open on another phone. Only that phone can use it.' using errcode = 'P0001';
    end if;
  else
    if p_last4 is null or p_last4 !~ '^[0-9]{4}$' or right((r.trip).traveller_phone, 4) <> p_last4 then
      update app.trip_links set confirm_attempts = confirm_attempts + 1 where trip_id = l.trip_id returning * into l;
      return jsonb_build_object('ok', false, 'tries_left', 3 - l.confirm_attempts);
    end if;
    update app.trip_links set device_hash = app.sha256(p_device), confirmed_at = app.clock()
      where trip_id = l.trip_id and device_hash is null;
  end if;
  select * into r from app.live_link(p_token);
  return app.link_summary(r.trip, r.link, true);
end $$;
revoke all on function public.link_confirm(text, text, text) from public;
grant execute on function public.link_confirm(text, text, text) to anon, authenticated;

-- A new link resets the tries too; codes are evenly random (7).
create or replace function public.invite_collector(p_child uuid, p_minutes int, p_name text, p_phone text, p_relation text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips;
  who text := btrim(p_name);
  rel text := nullif(btrim(p_relation), '');
  tok text;
  pin text;
  b bytea := extensions.gen_random_bytes(4);
begin
  if who is null or length(who) not between 2 and 80 then
    raise exception 'name_required: Enter the full name of the person collecting.' using errcode = 'P0001';
  end if;
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'phone_required: Enter their mobile number, with the country code for numbers outside India.' using errcode = 'P0001';
  end if;
  if rel is null or length(rel) > 40 then
    raise exception 'relation_required: Say how they know the child, for example Driver or Grandmother.' using errcode = 'P0001';
  end if;
  t := public.start_trip(p_child, 'pickup', p_minutes, p_reason);
  update public.trips set traveller_kind = 'third_person', traveller_name = who, traveller_relation = rel, traveller_phone = p_phone, sharing = false
    where id = t.id returning * into t;
  tok := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  -- 32 random bits modulo 10000: every code equally likely to within 0.0003%.
  pin := lpad((((get_byte(b, 0)::bigint << 24) | (get_byte(b, 1) << 16) | (get_byte(b, 2) << 8) | get_byte(b, 3)) % 10000)::text, 4, '0');
  insert into app.trip_links (trip_id, token_hash, code) values (t.id, app.sha256(tok), pin)
    on conflict (trip_id) do update
      set token_hash = excluded.token_hash, code = excluded.code, device_hash = null, confirmed_at = null, attempts = 0, locked_at = null,
          confirm_attempts = 0, created_at = app.clock();
  return jsonb_build_object('trip_id', t.id, 'token', tok, 'code', pin);
end $$;

-- 3. Staff see a trip's points up to the handover by the server's clock ----------------------------------------------------
drop policy read on public.trip_points;
create policy read on public.trip_points for select to authenticated using (
  exists (select 1 from public.trips t where t.id = trip_points.trip_id
          and (app.is_guardian_of(t.child_id) or (app.is_staff() and (t.closed_at is null or trip_points.received_at <= t.closed_at))))
);

-- 4. Admin can't be given or taken by editing a role row either (D27) --------------------------------------------------------
create or replace function app.guard_admin_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is not null and ((tg_op in ('INSERT', 'UPDATE') and new.role = 'admin') or (tg_op in ('DELETE', 'UPDATE') and old.role = 'admin')) then
    raise exception 'admin_locked: Only the school''s owners are admins, and that can''t be changed in the app.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger guard_admin_role on public.staff_roles;
create trigger guard_admin_role before insert or update or delete on public.staff_roles for each row execute function app.guard_admin_role();

-- 5. Push devices: only real push services, and a device can't be taken from someone else ------------------------------------
alter table public.push_subscriptions drop constraint push_subscriptions_endpoint_check;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_check check (
  endpoint ~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'
);
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  -- The same device (same keys) moves to whoever signs in on it; someone else's endpoint with other keys is refused.
  if exists (select 1 from public.push_subscriptions s where s.endpoint = p_endpoint and s.profile_id <> app.me() and (s.p256dh <> p_p256dh or s.auth <> p_auth)) then
    raise exception 'device_in_use: This device is registered to someone else.' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (app.me(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, created_at = now();
end $$;

-- 6. Parents take back only today's or a future absence ----------------------------------------------------------------------
create or replace function public.undo_absence(p_child uuid, p_day date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is null or not app.is_guardian_of(p_child) then
    raise exception 'Only this child''s parents can do this.' using errcode = '42501';
  end if;
  if p_day < app.today() then
    raise exception 'past_day: A past day can''t be changed. Please call the school.' using errcode = 'P0001';
  end if;
  delete from public.attendance a
  where a.child_id = p_child and a.day = p_day and a.status = 'absent' and a.checked_in_at is null
    and exists (select 1 from public.guardianships g where g.child_id = p_child and g.guardian_id = a.reported_by);
  if not found then
    raise exception 'not_yours: The school marked this. Please call the school to change it.' using errcode = 'P0001';
  end if;
end $$;
