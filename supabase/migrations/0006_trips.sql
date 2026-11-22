-- "I'm on my way" (PRD D2, D4, D11, D19; TRIP-1, TRIP-2). A parent, or the school for them, says when they will
-- reach the school for a drop-off or a pickup; coordinators acknowledge, get the child ready and hand over.
-- Trips are written only through the functions below, which check every rule; everyone reads under row-level security.

create type public.trip_direction as enum ('dropoff', 'pickup');
create type public.trip_status as enum ('en_route', 'handed_over', 'checked_in', 'cancelled');

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  direction public.trip_direction not null,
  day date not null,
  status public.trip_status not null default 'en_route',
  arrive_at timestamptz not null,
  off_schedule boolean not null default false,
  reason text check (reason is null or length(btrim(reason)) between 1 and 200),
  -- Who is coming, copied when the trip is made so every screen can name them.
  created_by uuid not null references public.profiles (id),
  traveller_name text not null,
  traveller_relation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  acknowledged_by uuid references public.profiles (id),
  acknowledged_at timestamptz,
  ready_by uuid references public.profiles (id),
  ready_at timestamptz,
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  handed_to uuid references public.profiles (id),
  check (not off_schedule or reason is not null),
  check (direction = 'pickup' or ready_at is null),
  check ((status = 'en_route') = (closed_at is null)),
  check (status <> 'handed_over' or (direction = 'pickup' and handed_to is not null)),
  check (status <> 'checked_in' or direction = 'dropoff')
);
-- At most one open trip per child, direction and day (TRIP-1).
create unique index trips_one_open on public.trips (child_id, direction, day) where status = 'en_route';
create index on public.trips (day);
create trigger audit after insert or update or delete on public.trips for each row execute function app.audit();

alter table public.trips enable row level security;
create policy read on public.trips for select to authenticated using (app.is_staff() or app.is_guardian_of(child_id));
revoke all on public.trips from public, anon, authenticated;
grant select on public.trips to authenticated;

-- The coordinators' iPads and the parents' phones hear changes live.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.trips;
  end if;
end $$;

-- The time the rules use. Tests pin it with SET app.now; that only works in a direct database-owner session,
-- never through the API (which connects as another user).
create function app.clock() returns timestamptz
language sql stable set search_path = '' as $$
  select case when session_user = 'postgres' and nullif(current_setting('app.now', true), '') is not null
    then current_setting('app.now')::timestamptz else now() end
$$;

-- Does a programme run on a date: its days, its term, no holiday, and the 2nd/last Saturday rule (D19).
create function app.runs_on(p_programme uuid, d date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.programmes p
    where p.id = p_programme and p.active
      and extract(isodow from d)::smallint = any (p.weekdays)
      and (p.term_start is null or d between p.term_start and p.term_end)
      and not exists (select 1 from public.holidays h where h.day = d)
      and not (extract(isodow from d) = 6 and p.saturday_rule = 'except_2nd_and_last'
               and (ceil(extract(day from d) / 7.0) = 2 or d + 7 > (date_trunc('month', d) + interval '1 month - 1 day')::date))
  )
$$;

-- A parent (or the core team or admin for them) is on the way, arriving in p_minutes.
-- Calling it again while the trip is open changes the time and announces it again.
create function public.start_trip(p_child uuid, p_direction public.trip_direction, p_minutes int, p_reason text default null)
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
  if (arrive at time zone 'Asia/Kolkata')::date <> today or at_local < '09:00' or at_local > '19:00' then
    raise exception 'outside_hours: The school is open from 9 AM to 7 PM. Choose a time inside those hours.' using errcode = 'P0001';
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

create function public.cancel_trip(p_trip uuid) returns public.trips
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or not (app.is_guardian_of(t.child_id) or app.has_role('admin', 'core')) then
    raise exception 'Only this child''s parents or the school can do this.' using errcode = '42501';
  end if;
  if t.status <> 'en_route' then
    raise exception 'This trip is already finished.' using errcode = 'P0001';
  end if;
  update public.trips set status = 'cancelled', closed_by = app.me(), closed_at = now(), updated_at = now()
    where id = p_trip returning * into t;
  return t;
end $$;

-- The coordinator's steps at the gate: 'acknowledge', 'ready' (pickups), and 'close' (hand over or check in).
-- A pickup is handed only to one of the child's registered, active guardians (D4); closing records attendance.
create function public.gate_step(p_trip uuid, p_step text, p_handed_to uuid default null) returns public.trips
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.me();
  t public.trips;
begin
  if me is null or not app.has_role('admin', 'coordinator') then
    raise exception 'Only coordinators can do this at the gate.' using errcode = '42501';
  end if;
  select * into t from public.trips where id = p_trip for update;
  if not found then
    raise exception 'This trip no longer exists.' using errcode = 'P0001';
  end if;
  if t.status <> 'en_route' then
    raise exception 'This trip is already finished.' using errcode = 'P0001';
  end if;

  case p_step
    when 'acknowledge' then
      update public.trips set acknowledged_by = coalesce(acknowledged_by, me), acknowledged_at = coalesce(acknowledged_at, now()), updated_at = now()
        where id = p_trip returning * into t;
    when 'ready' then
      if t.direction <> 'pickup' then
        raise exception 'Only a pickup can be marked ready.' using errcode = 'P0001';
      end if;
      update public.trips set ready_by = coalesce(ready_by, me), ready_at = coalesce(ready_at, now()),
          acknowledged_by = coalesce(acknowledged_by, me), acknowledged_at = coalesce(acknowledged_at, now()), updated_at = now()
        where id = p_trip returning * into t;
    when 'close' then
      if t.direction = 'pickup' then
        if p_handed_to is null or not exists (
          select 1 from public.guardianships g join public.profiles p on p.id = g.guardian_id
          where g.child_id = t.child_id and g.guardian_id = p_handed_to and p.active) then
          raise exception 'Choose one of the child''s registered guardians.' using errcode = 'P0001';
        end if;
        update public.trips set status = 'handed_over', handed_to = p_handed_to, closed_by = me, closed_at = now(), updated_at = now(),
            acknowledged_by = coalesce(acknowledged_by, me), acknowledged_at = coalesce(acknowledged_at, now())
          where id = p_trip returning * into t;
        insert into public.attendance (child_id, day, status, checked_out_at) values (t.child_id, t.day, 'present', now())
          on conflict (child_id, day) do update set status = 'present', checked_out_at = now();
      else
        update public.trips set status = 'checked_in', closed_by = me, closed_at = now(), updated_at = now(),
            acknowledged_by = coalesce(acknowledged_by, me), acknowledged_at = coalesce(acknowledged_at, now())
          where id = p_trip returning * into t;
        insert into public.attendance (child_id, day, status, checked_in_at) values (t.child_id, t.day, 'present', now())
          on conflict (child_id, day) do update set status = 'present', checked_in_at = coalesce(public.attendance.checked_in_at, now());
      end if;
    else
      raise exception 'Unknown step.' using errcode = 'P0001';
  end case;
  return t;
end $$;

revoke all on function public.start_trip(uuid, public.trip_direction, int, text), public.cancel_trip(uuid),
  public.gate_step(uuid, text, uuid) from public, anon;
grant execute on function public.start_trip(uuid, public.trip_direction, int, text), public.cancel_trip(uuid),
  public.gate_step(uuid, text, uuid) to authenticated;
