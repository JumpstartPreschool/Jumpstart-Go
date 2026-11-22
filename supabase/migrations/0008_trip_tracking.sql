-- Live location during a trip, and one-trip links for someone else who collects (PRD D2–D5, D8, D12; TRIP-3, TRIP-4;
-- TRK-1…TRK-9; docs/architecture/tracking-architecture.md). Location comes only from the adult travelling, only during
-- the trip, only after they allow it, and it stops by itself. The handover check (a registered guardian, or the person
-- invited with the right 4-digit code) is the safety control; GPS only supports it.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- 1. Who is travelling ------------------------------------------------------------------------------------------------
create type public.traveller_kind as enum ('guardian', 'third_person');
alter table public.trips
  add column traveller_kind public.traveller_kind not null default 'guardian',
  add column traveller_phone text check (traveller_phone is null or traveller_phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column sharing boolean not null default false,
  add column handed_to_name text check (handed_to_name is null or length(btrim(handed_to_name)) between 1 and 80),
  add column home_at timestamptz;

-- A pickup is handed to a registered guardian (0006), or to the invited person who gave the right code.
do $$
declare c text;
begin
  select conname into c from pg_constraint
    where conrelid = 'public.trips'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%handed_over%handed_to IS NOT NULL%';
  if c is not null then execute format('alter table public.trips drop constraint %I', c); end if;
end $$;
alter table public.trips add constraint trips_handover check (
  status <> 'handed_over' or (direction = 'pickup' and (handed_to is not null or (traveller_kind = 'third_person' and handed_to_name is not null)))
);

-- 2. The link and code for someone else (never readable through the API: the app schema isn't exposed, and nobody is granted it)
create table app.trip_links (
  trip_id uuid primary key references public.trips (id) on delete cascade,
  token_hash bytea not null unique,     -- SHA-256 of the link token; the token itself is shown once, to the parent
  device_hash bytea,                    -- SHA-256 of the key made on the phone that tapped Confirm (TRIP-4)
  code text not null check (code ~ '^[0-9]{4}$'),
  confirmed_at timestamptz,
  attempts smallint not null default 0 check (attempts between 0 and 3),
  locked_at timestamptz,
  created_at timestamptz not null default now()
);
revoke all on app.trip_links from public, anon, authenticated;

-- 3. Location points (TRK-2) --------------------------------------------------------------------------------------------
create table public.trip_points (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  fix_at timestamptz not null,          -- from the phone
  received_at timestamptz not null,     -- from the server clock
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy real not null check (accuracy > 0 and accuracy <= 500),
  coarse boolean not null,              -- accuracy 100–500 m: shown with a ring, never used for arrival or ETA
  backfill boolean not null             -- sent late (over 2 minutes old): history only, never makes a marker look live
);
create index on public.trip_points (trip_id, fix_at);
alter table public.trip_points enable row level security;
-- Guardians see their child's trip, including the way home; staff only up to the handover (TRK-9).
create policy read on public.trip_points for select to authenticated using (
  exists (select 1 from public.trips t where t.id = trip_id
          and (app.is_guardian_of(t.child_id) or (app.is_staff() and (t.closed_at is null or fix_at <= t.closed_at))))
);
revoke all on public.trip_points from public, anon, authenticated;
grant select on public.trip_points to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.trip_points;
  end if;
end $$;

-- Points are kept 30 days (D9), then removed by a daily job where pg_cron is available.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-trip-points', '15 3 * * *', $job$delete from public.trip_points where received_at < now() - interval '30 days'$job$);
  end if;
end $$;

-- 4. Helpers ----------------------------------------------------------------------------------------------------------
create function app.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create function app.sha256(p text) returns bytea
language sql immutable set search_path = '' as $$
  select extensions.digest(convert_to(p, 'UTF8'), 'sha256')
$$;

-- Checks and stores a batch of points for a trip (tracking-architecture.md §4.3). Bad points are skipped, not stored;
-- returns how many were accepted.
create function app.accept_points(p_trip uuid, p_created timestamptz, p_points jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  now_ timestamptz := app.clock();
  pt jsonb;
  lat double precision; lng double precision; acc real; fix timestamptz;
  last_lat double precision; last_lng double precision; last_acc real; last_fix timestamptz;
  moved double precision;
  secs double precision;
  n int := 0;
begin
  if p_points is null or jsonb_typeof(p_points) <> 'array' or jsonb_array_length(p_points) not between 1 and 50 then
    raise exception 'bad_batch: Send between 1 and 50 points.' using errcode = 'P0001';
  end if;
  -- About one point every 2 seconds on average, with room for a batch sent after a gap in signal.
  if (select count(*) from public.trip_points where trip_id = p_trip and received_at > now_ - interval '60 seconds') >= 120 then
    raise exception 'rate_limited: Too many location updates. The phone will try again shortly.' using errcode = 'P0001';
  end if;
  select tp.lat, tp.lng, tp.accuracy, tp.fix_at into last_lat, last_lng, last_acc, last_fix
    from public.trip_points tp where tp.trip_id = p_trip and not tp.coarse order by tp.fix_at desc limit 1;

  for pt in select value from jsonb_array_elements(p_points) order by (value ->> 'fix_at') loop
    begin
      lat := (pt ->> 'lat')::double precision;
      lng := (pt ->> 'lng')::double precision;
      acc := (pt ->> 'accuracy')::real;
      fix := (pt ->> 'fix_at')::timestamptz;
    exception when others then
      continue;  -- a malformed point is skipped
    end;
    continue when lat is null or lng is null or acc is null or fix is null;
    continue when lat not between -90 and 90 or lng not between -180 and 180 or acc <= 0 or acc > 500;
    continue when fix > now_ + interval '30 seconds' or fix < p_created - interval '1 minute';
    if last_fix is not null then
      continue when fix <= last_fix;
      -- Faster than 120 km/h after allowing for both accuracies is a GPS jump. An anchor older than 2 minutes isn't
      -- trusted, so one bad point can never block the rest of the trip.
      -- ponytail: simple stale-anchor rule instead of the "5 rejections, then re-anchor" counter; add it if jumps persist.
      if fix - last_fix < interval '2 minutes' then
        moved := greatest(0, app.distance_m(last_lat, last_lng, lat, lng) - last_acc - acc);
        secs := extract(epoch from fix - last_fix);
        continue when moved / secs > 33;
      end if;
    end if;
    insert into public.trip_points (trip_id, fix_at, received_at, lat, lng, accuracy, coarse, backfill)
    values (p_trip, fix, now_, lat, lng, acc, acc > 100, fix < now_ - interval '2 minutes');
    n := n + 1;
    if acc <= 100 then
      last_lat := lat; last_lng := lng; last_acc := acc; last_fix := fix;
    end if;
  end loop;
  return n;
end $$;

-- 5. A guardian on the way shares their own location ------------------------------------------------------------------
create function public.share_location(p_trip uuid, p_points jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips;
  n int;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or t.traveller_kind <> 'guardian' or t.created_by is distinct from app.me() then
    raise exception 'Only the person on the way can share their location.' using errcode = '42501';
  end if;
  if t.status <> 'en_route' then
    raise exception 'trip_closed: This trip is finished, so sharing has stopped.' using errcode = 'P0001';
  end if;
  n := app.accept_points(t.id, t.created_at, p_points);
  if not t.sharing then update public.trips set sharing = true where id = t.id; end if;
  return n;
end $$;

create function public.stop_sharing(p_trip uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.trips set sharing = false
    where id = p_trip and traveller_kind = 'guardian' and created_by = app.me();
  if not found then
    raise exception 'Only the person on the way can stop sharing.' using errcode = '42501';
  end if;
end $$;

-- 6. Someone else collects: a one-trip link and a 4-digit code (D3–D5, TRIP-3) -----------------------------------------
-- Makes (or replaces) the pickup with the person's details. Returns the link token and the code once; only their hashes
-- and the code are kept. Sending again issues a new link and code, and the old ones stop working at once.
create function public.invite_collector(p_child uuid, p_minutes int, p_name text, p_phone text, p_relation text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips;
  who text := btrim(p_name);
  rel text := nullif(btrim(p_relation), '');
  tok text;
  pin text;
  b bytea := extensions.gen_random_bytes(2);
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
  -- All the pickup rules (who may ask, school day, hours, window and reason, not already collected).
  t := public.start_trip(p_child, 'pickup', p_minutes, p_reason);
  update public.trips set traveller_kind = 'third_person', traveller_name = who, traveller_relation = rel, traveller_phone = p_phone, sharing = false
    where id = t.id returning * into t;
  tok := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  pin := lpad(((get_byte(b, 0) * 256 + get_byte(b, 1)) % 10000)::text, 4, '0');
  insert into app.trip_links (trip_id, token_hash, code) values (t.id, app.sha256(tok), pin)
    on conflict (trip_id) do update
      set token_hash = excluded.token_hash, code = excluded.code, device_hash = null, confirmed_at = null, attempts = 0, locked_at = null, created_at = app.clock();
  return jsonb_build_object('trip_id', t.id, 'token', tok, 'code', pin);
end $$;

-- The code, for the child's guardians and the school's planners (so a parent can read it out again later).
create function public.collector_code(p_trip uuid) returns text
language sql stable security definer set search_path = '' as $$
  select l.code from app.trip_links l join public.trips t on t.id = l.trip_id
  where l.trip_id = p_trip and (app.is_guardian_of(t.child_id) or app.has_role('admin', 'core'))
$$;

-- 7. The link page (no sign-in: the token, then the device key, are the proof) ------------------------------------------
-- The trip behind a token, if the link is still alive today: until handover, then up to 60 minutes of the way home (TRK-7).
create function app.live_link(p_token text)
returns table (trip public.trips, link app.trip_links)
language sql stable security definer set search_path = '' as $$
  select t, l from app.trip_links l join public.trips t on t.id = l.trip_id
  where l.token_hash = app.sha256(coalesce(p_token, ''))
    and t.day = (app.clock() at time zone 'Asia/Kolkata')::date
    and (t.status = 'en_route' or (t.status = 'handed_over' and t.home_at is null and t.closed_at > app.clock() - interval '60 minutes'))
$$;

create function app.link_summary(t public.trips, l app.trip_links, p_with_code boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'child', coalesce(c.preferred_name, split_part(c.full_name, ' ', 1)),
    'direction', t.direction, 'status', t.status, 'arrive_at', t.arrive_at, 'ready_at', t.ready_at, 'closed_at', t.closed_at,
    'home_at', t.home_at, 'collector', t.traveller_name, 'relation', t.traveller_relation, 'sharing', t.sharing,
    'confirmed', l.confirmed_at is not null, 'locked', l.locked_at is not null,
    'school_phone', (select s.school_phone from public.settings s limit 1),
    'code', case when p_with_code then l.code end)
  from public.children c where c.id = t.child_id
$$;

-- Opening the link only reads (so WhatsApp previews and email scanners can't use it up).
create function public.link_open(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select * into r from app.live_link(p_token);
  if not found then
    raise exception 'link_expired: This link has expired or was replaced. Ask the parent to send a new one.' using errcode = 'P0001';
  end if;
  return app.link_summary(r.trip, r.link, false);
end $$;

-- Confirm on this phone: binds the link to it. Another phone with the same link gets "already in use" (TRIP-4).
create function public.link_confirm(p_token text, p_device text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if p_device is null or length(p_device) < 32 then
    raise exception 'bad_device: Open the link again on this phone.' using errcode = 'P0001';
  end if;
  select * into r from app.live_link(p_token);
  if not found then
    raise exception 'link_expired: This link has expired or was replaced. Ask the parent to send a new one.' using errcode = 'P0001';
  end if;
  if (r.link).device_hash is null then
    update app.trip_links set device_hash = app.sha256(p_device), confirmed_at = app.clock() where trip_id = (r.trip).id;
  elsif (r.link).device_hash <> app.sha256(p_device) then
    raise exception 'in_use: This link is already open on another phone. Only that phone can use it.' using errcode = 'P0001';
  end if;
  select * into r from app.live_link(p_token);
  return app.link_summary(r.trip, r.link, true);
end $$;

create function app.link_for_device(p_token text, p_device text) returns table (trip public.trips, link app.trip_links)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query select * from app.live_link(p_token) x where (x.link).device_hash = app.sha256(coalesce(p_device, ''));
  if not found then
    raise exception 'link_expired: This link has expired, was replaced, or is open on another phone.' using errcode = 'P0001';
  end if;
end $$;

-- What the person collecting sees while they travel (the page asks every few seconds; it has no sign-in for live updates).
create function public.link_status(p_token text, p_device text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select * into r from app.link_for_device(p_token, p_device);
  return app.link_summary(r.trip, r.link, true);
end $$;

create function public.link_share(p_token text, p_device text, p_points jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n int;
begin
  select * into r from app.link_for_device(p_token, p_device);
  n := app.accept_points((r.trip).id, (r.trip).created_at, p_points);
  if not (r.trip).sharing then update public.trips set sharing = true where id = (r.trip).id; end if;
  return n;
end $$;

-- "I'm home" after the handover: sharing stops and the link dies (TRK-7).
create function public.link_home(p_token text, p_device text) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select * into r from app.link_for_device(p_token, p_device);
  update public.trips set sharing = false, home_at = coalesce(home_at, app.clock()) where id = (r.trip).id and status = 'handed_over';
  if not found then
    raise exception 'not_yet: The child hasn''t been handed over yet.' using errcode = 'P0001';
  end if;
end $$;

-- 8. At the gate: hand over to the invited person with their code (3 tries, then locked; the parent sends a new link) -----
create function public.gate_handover_code(p_trip uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.me();
  t public.trips;
  l app.trip_links;
begin
  if me is null or not app.has_role('admin', 'coordinator') then
    raise exception 'Only coordinators can do this at the gate.' using errcode = '42501';
  end if;
  select * into t from public.trips where id = p_trip for update;
  if not found or t.status <> 'en_route' or t.direction <> 'pickup' or t.traveller_kind <> 'third_person' then
    raise exception 'This pickup isn''t waiting for a code.' using errcode = 'P0001';
  end if;
  select * into l from app.trip_links where trip_id = p_trip for update;
  if not found then
    raise exception 'There is no code for this pickup. Ask the parent to send the link again.' using errcode = 'P0001';
  end if;
  if l.locked_at is not null then
    return jsonb_build_object('ok', false, 'locked', true, 'tries_left', 0);
  end if;
  if p_code is null or p_code <> l.code then
    -- Not raised, so the wrong try is counted even though nothing else changes.
    update app.trip_links set attempts = least(3, attempts + 1), locked_at = case when attempts + 1 >= 3 then now() end
      where trip_id = p_trip returning * into l;
    return jsonb_build_object('ok', false, 'locked', l.locked_at is not null, 'tries_left', 3 - l.attempts);
  end if;
  update public.trips set status = 'handed_over', handed_to_name = t.traveller_name, closed_by = me, closed_at = app.clock(), updated_at = app.clock(),
      acknowledged_by = coalesce(acknowledged_by, me), acknowledged_at = coalesce(acknowledged_at, app.clock())
    where id = p_trip returning * into t;
  insert into public.attendance (child_id, day, status, checked_out_at) values (t.child_id, t.day, 'present', app.clock())
    on conflict (child_id, day) do update set status = 'present', checked_out_at = app.clock();
  return jsonb_build_object('ok', true, 'trip', to_jsonb(t));
end $$;

-- 9. Who may call what ------------------------------------------------------------------------------------------------
revoke execute on all functions in schema app from public;
grant execute on function app.me(), app.is_active(), app.has_role(public.app_role[]), app.is_staff(), app.is_guardian_of(uuid) to authenticated;
revoke all on function public.share_location(uuid, jsonb), public.stop_sharing(uuid),
  public.invite_collector(uuid, int, text, text, text, text), public.collector_code(uuid), public.gate_handover_code(uuid, text),
  public.link_open(text), public.link_confirm(text, text), public.link_status(text, text), public.link_share(text, text, jsonb),
  public.link_home(text, text) from public, anon;
grant execute on function public.share_location(uuid, jsonb), public.stop_sharing(uuid),
  public.invite_collector(uuid, int, text, text, text, text), public.collector_code(uuid), public.gate_handover_code(uuid, text) to authenticated;
grant execute on function public.link_open(text), public.link_confirm(text, text), public.link_status(text, text),
  public.link_share(text, text, jsonb), public.link_home(text, text) to anon, authenticated;
