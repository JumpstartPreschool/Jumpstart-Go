-- Several programmes per child, and drop-off and pickup at any time (D56).
--
-- children.programme_id stays the child's main programme: it gives the class, so the gate team and everything else
-- that reads it work as before. child_programmes adds the standalone programmes the child is also in (After School,
-- Learning Center, Preschool Readiness): at most one class programme per child, always the main one.
--
-- Programmes are information now. A parent, the front desk or a third person can say they are coming at any time:
-- nothing checks a time against a programme's windows, asks for a reason or flags it off-schedule. The child's school
-- days are the days any of their programmes runs.

create table public.child_programmes (
  child_id uuid not null references public.children (id) on delete cascade,
  programme_id uuid not null references public.programmes (id),
  primary key (child_id, programme_id)
);
create index on public.child_programmes (programme_id);
alter table public.child_programmes enable row level security;
create policy read on public.child_programmes for select to authenticated using (app.is_staff() or app.is_guardian_of(child_id));
create policy front_desk_read on public.child_programmes for select to authenticated using (app.is_front_desk());
-- Written only through admin_save_child and admin_set_programmes.
grant select on public.child_programmes to authenticated;
create trigger audit after insert or delete or update on public.child_programmes for each row execute function app.audit();

-- A standalone programme has no plan in its name ("After School Program", not "Jr KG · Half day"), as the app reads it.
create function app.is_standalone(p_programme uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.programmes p where p.id = p_programme and position(' · ' in p.name) = 0)
$$;

create function app.check_child_programme() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.programmes p where p.id = new.programme_id and p.active) then
    raise exception 'gone: That programme no longer exists.' using errcode = 'P0001';
  end if;
  if not app.is_standalone(new.programme_id) then
    raise exception 'one_class: A child is in one class programme. Make it the main programme instead.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.children c where c.id = new.child_id and c.programme_id = new.programme_id) then
    raise exception 'already_main: That is already the child''s main programme.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger check_programme before insert or update on public.child_programmes
  for each row execute function app.check_child_programme();

-- A programme that becomes the main one is no longer listed as an extra.
create function app.drop_extra_now_main() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.child_programmes where child_id = new.id and programme_id = new.programme_id;
  return null;
end $$;
create trigger drop_extra_now_main after update of programme_id on public.children
  for each row execute function app.drop_extra_now_main();

-- Is this a school day for the child: does any of their programmes run on it?
create function app.child_runs_on(p_child uuid, d date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.children c
    where c.id = p_child
      and (app.runs_on(c.programme_id, d)
           or exists (select 1 from public.child_programmes x where x.child_id = c.id and app.runs_on(x.programme_id, d)))
  )
$$;

-- The admin sets the main programme and the extras together.
create function public.admin_set_programmes(p_child uuid, p_main uuid, p_also uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  also uuid[] := array(select distinct x from unnest(coalesce(p_also, '{}')) x where x is not null and x is distinct from p_main);
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can change a child''s programmes.' using errcode = '42501';
  end if;
  if cardinality(also) > 5 then
    raise exception 'too_many: Choose up to five more programmes.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.children where id = p_child and active) then
    raise exception 'This child is not registered with the school.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.programmes where id = p_main and active) then
    raise exception 'programme_required: Choose the class and programme.' using errcode = 'P0001';
  end if;
  update public.children set programme_id = p_main where id = p_child and programme_id <> p_main;
  delete from public.child_programmes where child_id = p_child and programme_id <> all (also);
  insert into public.child_programmes (child_id, programme_id) select p_child, x from unnest(also) x on conflict do nothing;
end $$;

-- Adding a child: the extras come in p_child.also, saved with the child or not at all.
create or replace function public.admin_save_child(p_child jsonb, p_people jsonb) returns uuid
language plpgsql set search_path = '' as $$
declare
  kid uuid;
  p jsonb;
  pid uuid;
begin
  if jsonb_typeof(p_people) is distinct from 'array' or jsonb_array_length(p_people) = 0 then
    raise exception 'people_required: Add at least one parent or relative.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from jsonb_array_elements(p_people) x
                 where nullif(x ->> 'id', '') is not null or not coalesce((x ->> 'abroad')::boolean, false)) then
    raise exception 'collector_required: Add at least one parent or relative who lives in India, to collect from the gate.' using errcode = 'P0001';
  end if;
  if (p_child ->> 'date_of_birth')::date > current_date then
    raise exception 'The date of birth cannot be in the future.' using errcode = 'check_violation';
  end if;
  insert into public.children (full_name, preferred_name, date_of_birth, class_id, programme_id, gender)
  select btrim(p_child ->> 'full_name'), nullif(btrim(p_child ->> 'preferred_name'), ''), (p_child ->> 'date_of_birth')::date,
         pr.class_id, pr.id, nullif(p_child ->> 'gender', '')
  from public.programmes pr where pr.id = (p_child ->> 'programme_id')::uuid
  returning id into kid;
  if kid is null then
    raise exception 'programme_required: Choose the class and programme.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_child -> 'also') = 'array' then
    perform public.admin_set_programmes(kid, (p_child ->> 'programme_id')::uuid,
      array(select x::uuid from jsonb_array_elements_text(p_child -> 'also') x));
  end if;
  for p in select value from jsonb_array_elements(p_people) loop
    pid := app.person_for_record(p);
    insert into public.guardianships (child_id, guardian_id, relation, kind)
    values (kid, pid, btrim(p ->> 'relation'), coalesce((p ->> 'kind')::public.guardian_kind, 'parent'));
  end loop;
  return kid;
end $$;

-- Trips and today's times: any time today, never checked against a window (D56). A reason, when given, is kept.
create or replace function app.book_trip(p_child uuid, p_direction public.trip_direction, p_minutes integer, p_reason text, p_for uuid)
returns public.trips language plpgsql security definer set search_path = '' as $$
declare
  today date := (app.clock() at time zone 'Asia/Kolkata')::date;
  arrive timestamptz := date_trunc('minute', app.clock()) + make_interval(mins => p_minutes);
  why text := nullif(btrim(p_reason), '');
  who_name text;
  who_relation text;
  t public.trips;
begin
  if p_minutes is null or p_minutes < 0 or p_minutes > 180 then
    raise exception 'Choose when you will reach the school.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.children ch where ch.id = p_child and ch.active) then
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
  select p.full_name, g.relation into who_name, who_relation
    from public.profiles p left join public.guardianships g on g.guardian_id = p.id and g.child_id = p_child
    where p.id = p_for;

  insert into public.trips as tr (child_id, direction, day, arrive_at, off_schedule, reason, created_by, traveller_name, traveller_relation)
  values (p_child, p_direction, today, arrive, false, why, p_for, who_name, who_relation)
  on conflict (child_id, direction, day) where status = 'en_route' do update
    set arrive_at = excluded.arrive_at, off_schedule = false, reason = excluded.reason,
        created_by = case when tr.traveller_kind = 'third_person' then tr.created_by else excluded.created_by end,
        traveller_name = case when tr.traveller_kind = 'third_person' then tr.traveller_name else excluded.traveller_name end,
        traveller_relation = case when tr.traveller_kind = 'third_person' then tr.traveller_relation else excluded.traveller_relation end,
        phoned_in_by = null, updated_at = now(), acknowledged_by = null, acknowledged_at = null
  returning * into t;
  return t;
end $$;

create or replace function app.set_day_time(p_child uuid, p_direction public.trip_direction, p_at time, p_reason text, p_by uuid)
returns public.day_times language plpgsql security definer set search_path = '' as $$
declare
  d date := app.today();
  now_local time := (app.clock() at time zone 'Asia/Kolkata')::time;
  why text := nullif(btrim(p_reason), '');
  r public.day_times;
begin
  if not exists (select 1 from public.children ch where ch.id = p_child and ch.active) then
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
  insert into public.day_times (child_id, day, direction, at, reason, set_by)
  values (p_child, d, p_direction, p_at, why, p_by)
  on conflict (child_id, day, direction) do update set at = excluded.at, reason = excluded.reason, set_by = excluded.set_by, set_at = now()
  returning * into r;
  -- Someone already on the way: their arrival moves too, and the gate hears it again.
  update public.trips set arrive_at = (d + p_at) at time zone 'Asia/Kolkata', off_schedule = false, reason = why,
      updated_at = app.clock(), acknowledged_by = null, acknowledged_at = null
    where child_id = p_child and direction = p_direction and day = d and status = 'en_route';
  return r;
end $$;

create or replace function public.running_late(p_trip uuid, p_minutes integer default null, p_at timestamptz default null,
  p_note text default null, p_expected_from timestamptz default null)
returns public.trips language plpgsql security definer set search_path = '' as $$
declare
  t public.trips;
  now_at timestamptz := date_trunc('minute', app.clock());
  arrive timestamptz;
  note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]+', ' ', 'g')), '');
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or app.me() is null or not (app.is_guardian_of(t.child_id) or app.has_role('admin', 'core')) then
    raise exception 'Only this child''s parents or the school can do this.' using errcode = '42501';
  end if;
  if t.status <> 'en_route' then
    raise exception 'trip_closed: This % has already finished.', case t.direction when 'pickup' then 'pickup' else 'drop-off' end using errcode = 'P0001';
  end if;
  if t.arrived_at is not null then
    raise exception 'already_here: You''ve already told the school you''ve arrived.' using errcode = 'P0001';
  end if;
  if (p_minutes is null) = (p_at is null) then
    raise exception 'bad_time: Choose +5, +10, +15 minutes or a time.' using errcode = 'P0001';
  end if;
  if p_minutes is not null and p_minutes not in (5, 10, 15) then
    raise exception 'bad_time: Choose +5, +10 or +15 minutes.' using errcode = 'P0001';
  end if;
  if note is not null and length(note) > 120 then
    raise exception 'note_too_long: Keep the note under 120 characters.' using errcode = 'P0001';
  end if;
  -- The arrival the caller was looking at. A retry after a lost reply, or the other parent's change in the meantime, finds
  -- it moved: say so instead of adding the minutes a second time.
  if p_expected_from is not null and t.arrive_at is distinct from p_expected_from then
    raise exception 'stale: The time changed. Here''s the new time.' using errcode = 'P0001';
  end if;
  perform app.throttle('late:' || p_trip, 6, interval '10 minutes');

  arrive := coalesce(greatest(t.arrive_at, now_at) + make_interval(mins => p_minutes), date_trunc('minute', p_at));
  if arrive <= now_at or arrive <= t.arrive_at then
    raise exception 'not_later: Choose a time later than about %.', app.hm(greatest(t.arrive_at, now_at)) using errcode = 'P0001';
  end if;
  if (arrive at time zone 'Asia/Kolkata')::date <> t.day then
    raise exception 'outside_hours: That would be after midnight. Please call the school.' using errcode = 'P0001';
  end if;
  if arrive > now_at + interval '3 hours' then
    raise exception 'too_far: Choose a time within the next 3 hours.' using errcode = 'P0001';
  end if;

  update public.trips
  set arrive_at = arrive, late_from = t.arrive_at, late_at = app.clock(), late_by = app.me(), late_note = note,
      off_schedule = false, updated_at = app.clock(), acknowledged_by = null, acknowledged_at = null
  where id = p_trip
  returning * into t;
  return t;
end $$;

create or replace function public.link_late(p_token text, p_device text, p_extra integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record;
  t public.trips;
  arrive timestamptz;
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
  if (arrive at time zone 'Asia/Kolkata')::date <> t.day then
    raise exception 'outside_hours: That would be after midnight. Please call the school.' using errcode = 'P0001';
  end if;
  update public.trips set arrive_at = arrive, off_schedule = false, updated_at = app.clock(), acknowledged_by = null, acknowledged_at = null
    where id = t.id returning * into t;
  return app.link_summary(t, r.link, true);
end $$;

-- Regular times: every day any of the child's programmes runs, at any time in the gate's day.
create or replace function app.check_child_schedule() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.children c join public.programmes p on p.id = c.programme_id
                                       or p.id in (select x.programme_id from public.child_programmes x where x.child_id = c.id)
    where c.id = new.child_id and new.weekday = any (p.weekdays)
  ) then
    raise exception 'None of this child''s programmes runs on this day' using errcode = 'check_violation';
  end if;
  if new.dropoff < '08:45' or new.pickup > '19:15' then
    raise exception 'Times must be within the gate''s day, 8:45 AM to 7:15 PM' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace function public.set_regular_times(p_child uuid, p_dropoff time, p_pickup time) returns void
language plpgsql security definer set search_path = '' as $$
declare
  days smallint[];
begin
  if not app.is_planner() then
    raise exception 'Only the head office or the admin can set regular times.' using errcode = '42501';
  end if;
  select array(select distinct d from public.children c
                 join public.programmes p on p.id = c.programme_id
                   or p.id in (select x.programme_id from public.child_programmes x where x.child_id = c.id)
                 cross join unnest(p.weekdays) d
               where c.id = p_child and c.active order by 1)
    into days;
  if cardinality(days) = 0 then
    raise exception 'This child is not registered with the school.' using errcode = 'P0001';
  end if;
  delete from public.child_schedules where child_id = p_child;
  if p_dropoff is not null and p_pickup is not null then
    insert into public.child_schedules (child_id, weekday, dropoff, pickup) select p_child, d, p_dropoff, p_pickup from unnest(days) d;
  end if;
end $$;

-- The windows no longer limit anything, so there is no list of times outside them.
drop view public.schedules_outside_windows;

-- School days: any of the child's programmes.
create or replace function public.gate_load(p_direction public.trip_direction)
returns table (at time, children integer) language sql stable security definer set search_path = '' as $$
  with d as (select app.today() as day, extract(isodow from app.today())::smallint as wd)
  select x.at, count(*)::int
  from (
    select coalesce(
             (select (t.arrive_at at time zone 'Asia/Kolkata')::time from public.trips t
                where t.child_id = c.id and t.day = d.day and t.direction = p_direction and t.status = 'en_route'),
             (select dt.at from public.day_times dt where dt.child_id = c.id and dt.day = d.day and dt.direction = p_direction),
             (select case when p_direction = 'pickup' then s.pickup else s.dropoff end from public.child_schedules s where s.child_id = c.id and s.weekday = d.wd)
           ) as at
    from public.children c, d
    where c.active and app.me() is not null and app.child_runs_on(c.id, d.day)
      and not exists (select 1 from public.attendance a where a.child_id = c.id and a.day = d.day and a.status <> 'present')
      and not exists (select 1 from public.trips t where t.child_id = c.id and t.day = d.day and t.direction = p_direction and t.status in ('handed_over', 'checked_in'))
  ) x
  where x.at is not null
  group by x.at
$$;

-- The morning reminder: the regular or changed time, else the first drop-off and last pickup of the programmes running today.
create or replace function app.queue_morning_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  d date := app.today();
  wd smallint := extract(isodow from app.today())::smallint;
  n int := 0;
  r record;
begin
  for r in
    select g.guardian_id, c.id as child_id, coalesce(c.preferred_name, split_part(c.full_name, ' ', 1)) as kid,
           coalesce((select dt.at from public.day_times dt where dt.child_id = c.id and dt.day = d and dt.direction = 'dropoff'), s.dropoff, span.drop_at) as drop_at,
           coalesce((select dt.at from public.day_times dt where dt.child_id = c.id and dt.day = d and dt.direction = 'pickup'), s.pickup, span.pick_at) as pick_at
    from public.guardianships g
    join public.profiles pr on pr.id = g.guardian_id and pr.notify_morning
    join public.children c on c.id = g.child_id and c.active
    left join public.child_schedules s on s.child_id = c.id and s.weekday = wd
    cross join lateral (
      select min(coalesce(p.dropoff_from, p.starts)) as drop_at, max(coalesce(p.pickup_from, p.ends)) as pick_at
      from public.programmes p
      where (p.id = c.programme_id or p.id in (select x.programme_id from public.child_programmes x where x.child_id = c.id))
        and app.runs_on(p.id, d)
    ) span
    where app.child_runs_on(c.id, d)
      and not exists (select 1 from public.attendance a where a.child_id = c.id and a.day = d and a.status <> 'present')
  loop
    perform app.notify(array[r.guardian_id], format('Today for %s', r.kid),
      format('Drop-off %s, pickup %s. Tap to change.', to_char(r.drop_at, 'FMHH12:MI AM'), to_char(r.pick_at, 'FMHH12:MI AM')), '/parent', 'morning-' || r.child_id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.report_absence_range(p_child uuid, p_from date, p_to date, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  why text := nullif(btrim(p_reason), '');
  d date;
  n int := 0;
begin
  if app.me() is null or not app.is_guardian_of(p_child) then
    raise exception 'Only this child''s parents can do this.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from < app.today() or p_to < p_from then
    raise exception 'bad_day: Choose a first day from today on, and a last day after it.' using errcode = 'P0001';
  end if;
  if p_from > app.today() + 90 or p_to - p_from > 30 then
    raise exception 'too_long: Choose up to 31 days, starting in the next three months. For longer, call the school.' using errcode = 'P0001';
  end if;
  if why is null or length(why) > 80 then
    raise exception 'reason_required: Say why, in a few words.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.children where id = p_child and active) then
    raise exception 'This child is not registered with the school.' using errcode = 'P0001';
  end if;
  for d in select generate_series(p_from, p_to, interval '1 day')::date loop
    continue when not app.child_runs_on(p_child, d);
    continue when exists (select 1 from public.attendance where child_id = p_child and day = d and checked_in_at is not null);
    insert into public.attendance (child_id, day, status, note, reported_by)
    values (p_child, d, 'absent', why, app.me())
    on conflict (child_id, day) do update set status = 'absent', note = excluded.note, reported_by = excluded.reported_by;
    perform app.cancel_day(p_child, d);
    n := n + 1;
  end loop;
  if n = 0 then
    raise exception 'no_school_days: There''s no school on those days, so nothing needs reporting.' using errcode = 'P0001';
  end if;
  return n;
end $$;

-- The child's last handover today. A check-in and a pickup closed at the same instant (one clock reading at the gate)
-- count the pickup as the later one, instead of whichever row the database reads first.
create or replace function app.last_handover(p_child uuid, p_day date) returns public.trip_direction
language sql stable security definer set search_path = '' as $$
  select direction from public.trips
  where child_id = p_child and day = p_day and status in ('checked_in', 'handed_over')
  order by closed_at desc nulls last, (direction = 'pickup') desc limit 1
$$;

revoke all on function app.is_standalone(uuid), app.check_child_programme(), app.drop_extra_now_main(),
  app.child_runs_on(uuid, date), public.admin_set_programmes(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_programmes(uuid, uuid, uuid[]) to authenticated;
