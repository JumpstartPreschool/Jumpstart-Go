-- 0026: trips work any day and any time (owner, 2026-09-26: "make the buttons clickable to check"). Being on the way,
-- collecting, running late and changing a day's time no longer check that the programme runs today or that the time is
-- inside 8:45 AM to 7:15 PM. Programme timings and windows are unchanged: a time outside a child's window is still
-- flagged and asks for a reason, a trip still can't roll past midnight, and a new time must be 5 minutes away.

CREATE OR REPLACE FUNCTION public.link_late(p_token text, p_device text, p_extra integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if (arrive at time zone 'Asia/Kolkata')::date <> t.day then
    raise exception 'outside_hours: That would be after midnight. Please call the school.' using errcode = 'P0001';
  end if;
  select p.flexible, p.starts, p.ends, p.pickup_from, p.pickup_to into c
    from public.children ch join public.programmes p on p.id = ch.programme_id where ch.id = t.child_id;
  if c.flexible then win_from := c.starts; win_to := c.ends; else win_from := c.pickup_from; win_to := c.pickup_to; end if;
  flagged := at_local < win_from or at_local > win_to;
  update public.trips set arrive_at = arrive, off_schedule = flagged, reason = case when flagged then 'Running late' end,
      updated_at = app.clock(), acknowledged_by = null, acknowledged_at = null
    where id = t.id returning * into t;
  return app.link_summary(t, r.link, true);
end $function$
;

CREATE OR REPLACE FUNCTION app.book_trip(p_child uuid, p_direction trip_direction, p_minutes integer, p_reason text, p_for uuid)
 RETURNS trips
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
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
  if p_minutes is null or p_minutes < 0 or p_minutes > 180 then
    raise exception 'Choose when you will reach the school.' using errcode = 'P0001';
  end if;
  select ch.active, ch.programme_id, p.flexible, p.starts, p.ends, p.dropoff_from, p.dropoff_to, p.pickup_from, p.pickup_to
    into c from public.children ch join public.programmes p on p.id = ch.programme_id where ch.id = p_child;
  if not found or not c.active then
    raise exception 'This child is not registered with the school.' using errcode = 'P0001';
  end if;
  if (arrive at time zone 'Asia/Kolkata')::date <> today then
    raise exception 'outside_hours: That would be after midnight. Choose an earlier time.' using errcode = 'P0001';
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
    where p.id = p_for;

  insert into public.trips as tr (child_id, direction, day, arrive_at, off_schedule, reason, created_by, traveller_name, traveller_relation)
  values (p_child, p_direction, today, arrive, flagged, case when flagged then why end, p_for, who_name, who_relation)
  on conflict (child_id, direction, day) where status = 'en_route' do update
    set arrive_at = excluded.arrive_at, off_schedule = excluded.off_schedule, reason = excluded.reason,
        created_by = case when tr.traveller_kind = 'third_person' then tr.created_by else excluded.created_by end,
        traveller_name = case when tr.traveller_kind = 'third_person' then tr.traveller_name else excluded.traveller_name end,
        traveller_relation = case when tr.traveller_kind = 'third_person' then tr.traveller_relation else excluded.traveller_relation end,
        phoned_in_by = null, updated_at = now(), acknowledged_by = null, acknowledged_at = null
  returning * into t;
  return t;
end $function$
;

CREATE OR REPLACE FUNCTION app.set_day_time(p_child uuid, p_direction trip_direction, p_at time without time zone, p_reason text, p_by uuid)
 RETURNS day_times
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d date := app.today();
  now_local time := (app.clock() at time zone 'Asia/Kolkata')::time;
  why text := nullif(btrim(p_reason), '');
  c record;
  win_from time;
  win_to time;
  flagged boolean;
  r public.day_times;
begin
  select ch.active, ch.programme_id, p.flexible, p.starts, p.ends, p.dropoff_from, p.dropoff_to, p.pickup_from, p.pickup_to
    into c from public.children ch join public.programmes p on p.id = ch.programme_id where ch.id = p_child;
  if not found or not c.active then
    raise exception 'This child is not registered with the school.' using errcode = 'P0001';
  end if;
  if p_at is null then
    raise exception 'Choose a time.' using errcode = 'P0001';
  end if;
  if p_at < now_local + interval '5 minutes' then
    raise exception 'too_soon: Choose a time at least 5 minutes from now.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.attendance a where a.child_id = p_child and a.day = d and a.status <> 'present') then
    raise exception 'not_coming: This child is marked as not coming today.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.trips x where x.child_id = p_child and x.direction = p_direction and x.day = d and x.status in ('handed_over', 'checked_in')) then
    raise exception 'already_done: That has already happened today.' using errcode = 'P0001';
  end if;
  if c.flexible then win_from := c.starts; win_to := c.ends;
  elsif p_direction = 'pickup' then win_from := c.pickup_from; win_to := c.pickup_to;
  else win_from := c.dropoff_from; win_to := c.dropoff_to;
  end if;
  flagged := p_at < win_from or p_at > win_to;
  if flagged and why is null then
    raise exception 'reason_required: This time is outside the child''s window. Tell the school why.' using errcode = 'P0001';
  end if;
  insert into public.day_times (child_id, day, direction, at, reason, set_by)
  values (p_child, d, p_direction, p_at, case when flagged then why end, p_by)
  on conflict (child_id, day, direction) do update set at = excluded.at, reason = excluded.reason, set_by = excluded.set_by, set_at = now()
  returning * into r;
  -- Someone already on the way: their arrival moves too, and the gate hears it again.
  update public.trips set arrive_at = (d + p_at) at time zone 'Asia/Kolkata', off_schedule = flagged, reason = case when flagged then why end,
      updated_at = app.clock(), acknowledged_by = null, acknowledged_at = null
    where child_id = p_child and direction = p_direction and day = d and status = 'en_route';
  return r;
end $function$
;
