-- The owner's timing rule (PRD D24, 2026-09-24): drop-off is the 15 minutes before a class starts and pickup the 15 minutes
-- after it ends. 360°+ has hours the child must be in school, with drop-off any time before them and pickup any time after
-- them until 19:00; the Learning Center takes children 08:45–09:00 and they can be collected any time until 19:00.
-- School hours stay 09:00–19:00 (D6); the gate is open 08:45–19:15, the earliest drop-off to the latest pickup.
-- Replaces the first-and-last-30-minutes windows loaded by 0003.

-- 1. Windows may now sit outside a programme's hours (before it starts, after it ends), inside the gate day.
do $$
declare c text;
begin
  select conname into c from pg_constraint
    where conrelid = 'public.programmes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%dropoff_from >= starts%';
  if c is not null then execute format('alter table public.programmes drop constraint %I', c); end if;
end $$;

alter table public.programmes add constraint programme_windows check (
  (flexible and dropoff_from is null and dropoff_to is null and pickup_from is null and pickup_to is null)
  or (not flexible
    and dropoff_from >= '08:45' and dropoff_from <= dropoff_to and dropoff_to <= ends
    and pickup_from >= starts and pickup_from <= pickup_to and pickup_to <= '19:15')
);

-- 2. The Karve Road programmes (PRD §5) with the owner's windows. Every programme now has explicit windows.
update public.programmes p
set flexible = false, starts = v.starts::time, ends = v.ends::time,
    dropoff_from = v.df::time, dropoff_to = v.dt::time, pickup_from = v.pf::time, pickup_to = v.pt::time
from (values
  ('Playgroup · Half day (morning)',   '09:00', '11:30', '08:45', '09:00', '11:30', '11:45'),
  ('Playgroup · Half day (afternoon)', '11:45', '14:15', '11:30', '11:45', '14:15', '14:30'),
  ('Playgroup · 360°',                 '11:45', '17:30', '11:30', '11:45', '17:30', '17:45'),
  ('Playgroup · 360°+',                '11:45', '17:30', '09:00', '11:45', '17:30', '19:00'),
  ('Nursery · Half day (morning)',     '09:00', '11:30', '08:45', '09:00', '11:30', '11:45'),
  ('Nursery · Half day (afternoon)',   '11:45', '14:15', '11:30', '11:45', '14:15', '14:30'),
  ('Nursery · 360°',                   '11:45', '17:30', '11:30', '11:45', '17:30', '17:45'),
  ('Nursery · 360°+',                  '11:45', '17:30', '09:00', '11:45', '17:30', '19:00'),
  ('Jr KG · Half day',                 '09:00', '13:00', '08:45', '09:00', '13:00', '13:15'),
  ('Jr KG · 360°',                     '09:00', '16:30', '08:45', '09:00', '16:30', '16:45'),
  ('Jr KG · 360°+',                    '09:00', '16:30', '08:45', '09:00', '16:30', '19:00'),
  ('Sr KG · Half day',                 '09:00', '13:00', '08:45', '09:00', '13:00', '13:15'),
  ('Sr KG · 360°',                     '09:00', '16:30', '08:45', '09:00', '16:30', '16:45'),
  ('Sr KG · 360°+',                    '09:00', '16:30', '08:45', '09:00', '16:30', '19:00'),
  ('Learning Center',                  '09:00', '19:00', '08:45', '09:00', '09:00', '19:00'),
  ('After School Program',             '16:00', '19:00', '15:45', '16:00', '19:00', '19:15'),
  ('Preschool Readiness Program',      '11:30', '13:00', '11:15', '11:30', '13:00', '13:15')
) as v(name, starts, ends, df, dt, pf, pt)
where p.name = v.name;

-- 3. "I'm on my way" can now be booked for any time the gate is open, 08:45–19:15 (it was 09:00–19:00).
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
        created_by = excluded.created_by, traveller_name = excluded.traveller_name, traveller_relation = excluded.traveller_relation,
        updated_at = now(), acknowledged_by = null, acknowledged_at = null
  returning * into t;
  return t;
end $$;
