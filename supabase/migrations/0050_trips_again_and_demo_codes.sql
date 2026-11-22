-- 0050: more than one drop-off and pickup a day (owner, 2026-10-06: "allow the parent to create multiple pickups and drop
-- offs", for every child, first asked for the Learning Center and 360°). A drop-off is refused only while the child is
-- at school, a pickup only once they've gone home; one open trip each way at a time stays (trips_one_open). Also: demo
-- numbers get their sign-in code on the sign-in screen instead of WhatsApp.

-- 1. The child's last handover today: 'dropoff' (at school), 'pickup' (gone home) or null (neither yet).
create function app.last_handover(p_child uuid, p_day date) returns public.trip_direction
language sql stable security definer set search_path = '' as $$
  select direction from public.trips
  where child_id = p_child and day = p_day and status in ('checked_in', 'handed_over')
  order by closed_at desc nulls last limit 1
$$;
revoke execute on function app.last_handover(uuid, date) from public, anon;
grant execute on function app.last_handover(uuid, date) to authenticated;

-- 2. Booking a trip (0026), with the once-a-day check replaced by the at-school / gone-home one.
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
  if app.last_handover(p_child, today) = p_direction then
    raise exception 'already_done: %', case p_direction when 'pickup' then 'This child has already been collected.'
      else 'This child is already at school.' end using errcode = 'P0001';
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

-- 3. Today's time for a drop-off or pickup (0026): no longer refused once one has happened today.
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

-- 4. Walk-in at the gate (0038), with the same check as booking.
create or replace function public.gate_walk_in(p_child uuid, p_direction public.trip_direction, p_handed_to uuid default null)
returns public.trips language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.me();
  d date := app.today();
  c record;
  g_name text;
  g_relation text;
  t public.trips;
begin
  if me is null or not app.has_role('coordinator') then
    raise exception 'Only a center coordinator can check a child in or hand them over.' using errcode = '42501';
  end if;
  select ch.active, ch.programme_id into c from public.children ch where ch.id = p_child;
  if not found or not c.active then
    raise exception 'This child is not registered with the school.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.attendance a where a.child_id = p_child and a.day = d and a.status <> 'present') then
    raise exception 'not_coming: This child is marked as not coming today. Check with the head office first.' using errcode = 'P0001';
  end if;
  if app.last_handover(p_child, d) = p_direction then
    raise exception 'already_done: %', case p_direction when 'pickup' then 'This child has already been collected.' else 'This child is already checked in.' end using errcode = 'P0001';
  end if;
  if exists (select 1 from public.trips x where x.child_id = p_child and x.day = d and x.direction = p_direction and x.status = 'en_route') then
    raise exception 'on_the_way: Someone already said they''re on the way. Use that request in the queue.' using errcode = 'P0001';
  end if;
  if p_direction = 'pickup' then
    select p.full_name, gs.relation into g_name, g_relation from public.guardianships gs join public.profiles p on p.id = gs.guardian_id and p.active
      where gs.child_id = p_child and gs.guardian_id = p_handed_to;
    if not found then
      raise exception 'guardian_required: Choose one of the child''s registered parents or family. Anyone else needs a link and a code from a parent.' using errcode = 'P0001';
    end if;
  end if;
  insert into public.trips (child_id, direction, day, status, arrive_at, created_by, traveller_name, traveller_relation,
                            acknowledged_by, acknowledged_at, closed_by, closed_at, handed_to)
  values (p_child, p_direction, d, case p_direction when 'pickup' then 'handed_over'::public.trip_status else 'checked_in'::public.trip_status end,
          app.clock(), coalesce(p_handed_to, me), coalesce(g_name, 'At the gate'), g_relation,
          me, app.clock(), me, app.clock(), p_handed_to)
  returning * into t;
  insert into public.attendance (child_id, day, status, checked_in_at, checked_out_at)
  values (p_child, d, 'present', case when p_direction = 'dropoff' then app.clock() end, case when p_direction = 'pickup' then app.clock() end)
  on conflict (child_id, day) do update set status = 'present',
    checked_in_at = coalesce(public.attendance.checked_in_at, excluded.checked_in_at),
    checked_out_at = coalesce(excluded.checked_out_at, public.attendance.checked_out_at);
  return t;
end $$;

-- 5. Brought back after a pickup: attendance shows the child at school again until the next pickup.
create function app.back_at_school() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.attendance set checked_out_at = null
  where child_id = new.child_id and day = new.day and checked_out_at is not null;
  return new;
end $$;
revoke execute on function app.back_at_school() from public, anon, authenticated;
create trigger back_at_school_insert after insert on public.trips
  for each row when (new.status = 'checked_in') execute function app.back_at_school();
create trigger back_at_school_update after update of status on public.trips
  for each row when (new.status = 'checked_in' and old.status is distinct from 'checked_in') execute function app.back_at_school();

-- 6. Demo sign-ins (temporary, scripts/demo): the Send SMS hook keeps a demo number's code here instead of sending it on
-- WhatsApp, and the sign-in screen reads it back. Only "… Demo" parents on +91 90000 00001 to 00010, never staff.
create table app.demo_codes (phone text primary key, code text not null, made_at timestamptz not null default now());
alter table app.demo_codes enable row level security;

create function app.is_demo_number(p_phone text) returns boolean
language sql stable security definer set search_path = '' as $$
  select '+' || ltrim(coalesce(p_phone, ''), '+') ~ '^\+9190000000(0[1-9]|10)$'
    and exists (select 1 from public.profiles p
                where p.phone = '+' || ltrim(p_phone, '+') and p.active and p.full_name like '% Demo'
                  and not exists (select 1 from public.staff_roles r where r.profile_id = p.id))
$$;
revoke execute on function app.is_demo_number(text) from public, anon, authenticated;

-- Called by the Send SMS hook: true when the number is a demo number and its code is kept (nothing is sent).
create function public.demo_code_keep(p_phone text, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_demo_number(p_phone) then return false; end if;
  insert into app.demo_codes (phone, code) values ('+' || ltrim(p_phone, '+'), p_code)
  on conflict (phone) do update set code = excluded.code, made_at = now();
  return true;
end $$;
revoke execute on function public.demo_code_keep(text, text) from public, anon, authenticated;
grant execute on function public.demo_code_keep(text, text) to service_role;

-- The sign-in screen: a demo number's code from the last 10 minutes, else null. Anyone may ask: these are demo accounts.
create function public.demo_code(p_phone text) returns text
language sql stable security definer set search_path = '' as $$
  select code from app.demo_codes
  where phone = '+' || ltrim(coalesce(p_phone, ''), '+') and made_at > now() - interval '10 minutes'
    and app.is_demo_number(p_phone)
$$;
revoke execute on function public.demo_code(text) from public;
grant execute on function public.demo_code(text) to anon, authenticated;
