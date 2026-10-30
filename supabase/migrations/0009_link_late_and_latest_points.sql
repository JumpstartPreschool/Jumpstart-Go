-- What the location screens need on top of 0008: the newest point of several trips in one call (the gate shows freshness
-- and distance on every row), and "Running late" for the person collecting, who has no sign-in (TRIP-3).

-- 1. Newest live point per trip. Security invoker, so trip_points' row-level security still decides who sees what
-- (guardians the whole trip, staff only up to the handover). Late backfill points never count as the newest.
create function public.latest_points(p_trips uuid[])
returns table (trip_id uuid, lat double precision, lng double precision, accuracy real, fix_at timestamptz, received_at timestamptz, coarse boolean)
language sql stable security invoker set search_path = '' as $$
  select distinct on (tp.trip_id) tp.trip_id, tp.lat, tp.lng, tp.accuracy, tp.fix_at, tp.received_at, tp.coarse
  from public.trip_points tp
  where tp.trip_id = any(p_trips[1:50]) and not tp.backfill
  order by tp.trip_id, tp.fix_at desc
$$;

-- 2. The person collecting pushes their arrival back by 10, 20 or 30 minutes from the link page. Outside the child's
-- window it is flagged "Running late" for the gate to acknowledge, like the parent's own Running late.
create function public.link_late(p_token text, p_device text, p_extra int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  t public.trips;
  c record;
  arrive timestamptz;
  at_local time;
  win_from time;
  win_to time;
  flagged boolean;
begin
  if p_extra is null or p_extra not in (10, 20, 30) then
    raise exception 'bad_minutes: Choose 10, 20 or 30 minutes.' using errcode = 'P0001';
  end if;
  select * into r from app.link_for_device(p_token, p_device);
  t := r.trip;
  if t.status <> 'en_route' then
    raise exception 'trip_closed: The child has already been handed over.' using errcode = 'P0001';
  end if;
  arrive := greatest(t.arrive_at, date_trunc('minute', app.clock())) + make_interval(mins => p_extra);
  at_local := (arrive at time zone 'Asia/Kolkata')::time;
  if (arrive at time zone 'Asia/Kolkata')::date <> t.day or at_local > '19:15' then
    raise exception 'outside_hours: The gate closes at 7:15 PM. Please call the school.' using errcode = 'P0001';
  end if;
  select p.flexible, p.starts, p.ends, p.pickup_from, p.pickup_to into c
    from public.children ch join public.programmes p on p.id = ch.programme_id where ch.id = t.child_id;
  if c.flexible then win_from := c.starts; win_to := c.ends; else win_from := c.pickup_from; win_to := c.pickup_to; end if;
  flagged := at_local < win_from or at_local > win_to;
  update public.trips set arrive_at = arrive, off_schedule = flagged, reason = case when flagged then 'Running late' end,
      updated_at = app.clock(), acknowledged_by = null, acknowledged_at = null
    where id = t.id returning * into t;
  return app.link_summary(t, r.link, true);
end $$;

revoke all on function public.latest_points(uuid[]), public.link_late(text, text, int) from public, anon;
grant execute on function public.latest_points(uuid[]) to authenticated;
grant execute on function public.link_late(text, text, int) to anon, authenticated;

-- 3. A parent's Running late or Change time on a pickup someone else is doing moves the time only: the person collecting,
-- their link and their code stay the same (0008 made invite_collector turn the trip into theirs).
create or replace function public.start_trip(p_child uuid, p_direction public.trip_direction, p_minutes int, p_reason text default null)
returns public.trips
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.me();
  today date := (app.clock() at time zone 'Asia/Kolkata')::date;
  arrive timestamptz := date_trunc('minute', app.clock()) + make_interval(mins => p_minutes);
  at_local time := (arrive at time zone 'Asia/Kolkata')::time;
  why text := nullif(btrim(p_reason), '');
  c record;
  win_from time;
  win_to time;
  flagged boolean;
  who_name text;
  who_relation text;
  t public.trips;
begin
  if me is null or not (app.is_guardian_of(p_child) or app.has_role('admin', 'core')) then
    raise exception 'Only this child''s parents or the school can do this.' using errcode = '42501';
  end if;
  if p_minutes is null or p_minutes < 0 or p_minutes > 180 then
    raise exception 'Choose when you will reach the school.' using errcode = 'P0001';
  end if;
  select ch.active, ch.programme_id, p.flexible, p.starts, p.ends, p.dropoff_from, p.dropoff_to, p.pickup_from, p.pickup_to
    into c from public.children ch join public.programmes p on p.id = ch.programme_id where ch.id = p_child;
  if not found or not c.active then
    raise exception 'This child is not registered with the school.' using errcode = 'P0001';
  end if;
  if not app.runs_on(c.programme_id, today) then
    raise exception 'no_school: There is no school for this child today.' using errcode = 'P0001';
  end if;
  if (arrive at time zone 'Asia/Kolkata')::date <> today or at_local < '08:45' or at_local > '19:15' then
    raise exception 'outside_hours: The gate is open from 8:45 AM to 7:15 PM. Choose a time inside those hours.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.attendance a where a.child_id = p_child and a.day = today and a.status <> 'present') then
    raise exception 'not_coming: This child is marked as not coming today. Call the school to change that.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.trips x where x.child_id = p_child and x.direction = p_direction and x.day = today
             and x.status in ('handed_over', 'checked_in')) then
    raise exception 'already_done: %', case p_direction when 'pickup' then 'This child has already been collected today.'
      else 'This child has already been checked in today.' end using errcode = 'P0001';
  end if;

  if c.flexible then win_from := c.starts; win_to := c.ends;
  elsif p_direction = 'pickup' then win_from := c.pickup_from; win_to := c.pickup_to;
  else win_from := c.dropoff_from; win_to := c.dropoff_to;
  end if;
  flagged := at_local < win_from or at_local > win_to;
  if flagged and why is null then
    raise exception 'reason_required: This time is outside the child''s window. Tell the school why.' using errcode = 'P0001';
  end if;

  select p.full_name, g.relation into who_name, who_relation
    from public.profiles p left join public.guardianships g on g.guardian_id = p.id and g.child_id = p_child
    where p.id = me;

  insert into public.trips as tr (child_id, direction, day, arrive_at, off_schedule, reason, created_by, traveller_name, traveller_relation)
  values (p_child, p_direction, today, arrive, flagged, case when flagged then why end, me, who_name, who_relation)
  on conflict (child_id, direction, day) where status = 'en_route' do update
    set arrive_at = excluded.arrive_at, off_schedule = excluded.off_schedule, reason = excluded.reason,
        created_by = case when tr.traveller_kind = 'third_person' then tr.created_by else excluded.created_by end,
        traveller_name = case when tr.traveller_kind = 'third_person' then tr.traveller_name else excluded.traveller_name end,
        traveller_relation = case when tr.traveller_kind = 'third_person' then tr.traveller_relation else excluded.traveller_relation end,
        updated_at = now(), acknowledged_by = null, acknowledged_at = null
  returning * into t;
  return t;
end $$;
