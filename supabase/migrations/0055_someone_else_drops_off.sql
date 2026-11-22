-- Someone else can drop a child off too (D58), not only collect: a parent sends a driver, a grandparent or a neighbour
-- the same one-time link. The gate sees who is coming and checks the child in as usual. The 4-digit code stays for
-- pickups only: it guards handing a child over, and a drop-off must never be stuck at the gate for a lost phone.
drop function public.invite_collector(uuid, integer, text, text, text, text);

create function public.invite_collector(p_child uuid, p_minutes integer, p_name text, p_phone text, p_relation text,
  p_reason text default null, p_direction public.trip_direction default 'pickup')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.trips;
  who text := btrim(p_name);
  rel text := nullif(btrim(p_relation), '');
  tok text;
  pin text;
  b bytea := extensions.gen_random_bytes(4);
begin
  if p_direction is null then
    raise exception 'direction_required: Say whether they are dropping off or collecting.' using errcode = 'P0001';
  end if;
  if who is null or length(who) not between 2 and 80 then
    raise exception 'name_required: Enter the full name of the person coming.' using errcode = 'P0001';
  end if;
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'phone_required: Enter their mobile number, with the country code for numbers outside India.' using errcode = 'P0001';
  end if;
  if rel is null or length(rel) > 40 then
    raise exception 'relation_required: Say how they know the child, for example Driver or Grandmother.' using errcode = 'P0001';
  end if;
  t := public.start_trip(p_child, p_direction, p_minutes, p_reason);
  update public.trips set traveller_kind = 'third_person', traveller_name = who, traveller_relation = rel, traveller_phone = p_phone, sharing = false
    where id = t.id returning * into t;
  tok := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  -- 32 random bits modulo 10000: every code equally likely to within 0.0003%. Made for a drop-off too, but only a pickup
  -- asks for it (gate_handover_code), and the link page shows it only for a pickup.
  pin := lpad((((get_byte(b, 0)::bigint << 24) | (get_byte(b, 1) << 16) | (get_byte(b, 2) << 8) | get_byte(b, 3)) % 10000)::text, 4, '0');
  insert into app.trip_links (trip_id, token_hash, code) values (t.id, app.sha256(tok), pin)
    on conflict (trip_id) do update
      set token_hash = excluded.token_hash, code = excluded.code, device_hash = null, confirmed_at = null, attempts = 0, locked_at = null,
          confirm_attempts = 0, created_at = app.clock();
  return jsonb_build_object('trip_id', t.id, 'token', tok, 'code', pin);
end $$;
revoke all on function public.invite_collector(uuid, integer, text, text, text, text, public.trip_direction) from public, anon;
grant execute on function public.invite_collector(uuid, integer, text, text, text, text, public.trip_direction) to authenticated;

-- The link stays open a few minutes after a drop-off, so the person who brought the child sees "checked in" instead of
-- a dead link; after a pickup it stays open on the way home, as before.
create or replace function app.live_link(p_token text) returns table (trip public.trips, link app.trip_links)
language sql stable security definer set search_path = '' as $$
  select t, l from app.trip_links l join public.trips t on t.id = l.trip_id
  where l.token_hash = app.sha256(coalesce(p_token, ''))
    and l.confirm_attempts < 3
    and t.day = (app.clock() at time zone 'Asia/Kolkata')::date
    and (t.status = 'en_route'
         or (t.status = 'handed_over' and t.home_at is null and t.closed_at > app.clock() - interval '60 minutes')
         or (t.status = 'checked_in' and t.closed_at > app.clock() - interval '15 minutes'))
$$;
