-- The school's day beyond the gate (Screen Book v3): attendance and absences, today's time for a child (D15),
-- programme hours with windows worked out from them (D24), regular times, messages, announcements, logged calls
-- (D25), a parent's saved people and notification choices.

-- Who may plan the day: the admin and the core team. The front desk (PRO) acts only through a logged call.
create function app.is_planner() returns boolean
language sql stable security definer set search_path = '' as $$ select app.has_role('admin', 'core') $$;
-- Who talks to families: admin, core team and front desk (coordinators work the gate).
create function app.is_office() returns boolean
language sql stable security definer set search_path = '' as $$ select app.has_role('admin', 'core', 'pro') $$;

create function app.today() returns date
language sql stable set search_path = '' as $$ select (app.clock() at time zone 'Asia/Kolkata')::date $$;

-- Cancels a child's open trips on a day (they're not coming), recorded as closed by the caller.
create function app.cancel_day(p_child uuid, p_day date) returns void
language sql security definer set search_path = '' as $$
  update public.trips set status = 'cancelled', closed_by = app.me(), closed_at = app.clock(), updated_at = app.clock()
  where child_id = p_child and day = p_day and status = 'en_route'
$$;

-- 1. Attendance and absences ---------------------------------------------------------------------------------------------
alter table public.attendance add column reported_by uuid references public.profiles (id);

-- The core team (or admin) marks a child for a day. Away cancels that day's trips, so nothing is announced.
create function public.set_attendance(p_child uuid, p_day date, p_status public.attendance_status, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_planner() then
    raise exception 'Only the core team or the admin can mark attendance.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.children where id = p_child and active) then
    raise exception 'This child is not registered with the school.' using errcode = 'P0001';
  end if;
  insert into public.attendance (child_id, day, status, note, reported_by)
  values (p_child, p_day, p_status, nullif(btrim(p_note), ''), app.me())
  on conflict (child_id, day) do update set status = excluded.status, note = excluded.note, reported_by = excluded.reported_by;
  if p_status <> 'present' then perform app.cancel_day(p_child, p_day); end if;
end $$;

-- A parent reports an absence, today or up to two weeks ahead (never after the child is checked in).
create function public.report_absence(p_child uuid, p_day date, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  why text := nullif(btrim(p_reason), '');
begin
  if app.me() is null or not app.is_guardian_of(p_child) then
    raise exception 'Only this child''s parents can do this.' using errcode = '42501';
  end if;
  if p_day < app.today() or p_day > app.today() + 14 then
    raise exception 'bad_day: Choose today or a day in the next two weeks.' using errcode = 'P0001';
  end if;
  if why is null or length(why) > 80 then
    raise exception 'reason_required: Say why, in a few words.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.attendance where child_id = p_child and day = p_day and checked_in_at is not null) then
    raise exception 'already_here: This child is already checked in today. Call the school.' using errcode = 'P0001';
  end if;
  insert into public.attendance (child_id, day, status, note, reported_by)
  values (p_child, p_day, 'absent', why, app.me())
  on conflict (child_id, day) do update set status = 'absent', note = excluded.note, reported_by = excluded.reported_by;
  perform app.cancel_day(p_child, p_day);
end $$;

-- A parent takes back an absence they (or the other parent) reported; one the school set stays with the school.
create function public.undo_absence(p_child uuid, p_day date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is null or not app.is_guardian_of(p_child) then
    raise exception 'Only this child''s parents can do this.' using errcode = '42501';
  end if;
  delete from public.attendance a
  where a.child_id = p_child and a.day = p_day and a.status = 'absent' and a.checked_in_at is null
    and exists (select 1 from public.guardianships g where g.child_id = p_child and g.guardian_id = a.reported_by);
  if not found then
    raise exception 'not_yours: The school marked this. Please call the school to change it.' using errcode = 'P0001';
  end if;
end $$;

-- 2. Today's time (D15) --------------------------------------------------------------------------------------------------
-- A different drop-off or pickup time for one day. The gate's "coming up" list and the parent's tiles use it.
create table public.day_times (
  child_id uuid not null references public.children (id) on delete cascade,
  day date not null,
  direction public.trip_direction not null,
  at time not null check (at between '08:45' and '19:15'),
  reason text check (reason is null or length(btrim(reason)) between 1 and 200),
  set_by uuid not null references public.profiles (id),
  set_at timestamptz not null default now(),
  primary key (child_id, day, direction)
);
alter table public.day_times enable row level security;
create policy read on public.day_times for select to authenticated
  using (app.is_staff() or app.is_front_desk() or app.is_guardian_of(child_id));
revoke all on public.day_times from public, anon, authenticated;
grant select on public.day_times to authenticated;
create trigger audit after insert or update or delete on public.day_times for each row execute function app.audit();

-- p_for: the parent it's for, when the school sets it on their behalf (a logged call, or the core team).
create function app.set_day_time(p_child uuid, p_direction public.trip_direction, p_at time, p_reason text, p_by uuid) returns public.day_times
language plpgsql security definer set search_path = '' as $$
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
  if not app.runs_on(c.programme_id, d) then
    raise exception 'no_school: There is no school for this child today.' using errcode = 'P0001';
  end if;
  if p_at is null or p_at < '08:45' or p_at > '19:15' then
    raise exception 'outside_hours: The gate is open from 8:45 AM to 7:15 PM.' using errcode = 'P0001';
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
end $$;

create function public.change_day_time(p_child uuid, p_direction public.trip_direction, p_at time, p_reason text default null) returns public.day_times
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is null or not (app.is_guardian_of(p_child) or app.is_planner()) then
    raise exception 'Only this child''s parents or the school can do this.' using errcode = '42501';
  end if;
  return app.set_day_time(p_child, p_direction, p_at, p_reason, app.me());
end $$;

-- 3. Programme hours; the windows follow the school's rule (D24) ---------------------------------------------------------
alter table public.programmes add column extended boolean not null default false;
update public.programmes set extended = true where name like '%360°+';

create function public.set_programme_hours(p_programme uuid, p_starts time, p_ends time, p_extended boolean) returns public.programmes
language plpgsql security definer set search_path = '' as $$
declare
  p public.programmes;
begin
  if not app.is_planner() then
    raise exception 'Only the core team or the admin can change timings.' using errcode = '42501';
  end if;
  select * into p from public.programmes where id = p_programme for update;
  if not found then
    raise exception 'This programme no longer exists.' using errcode = 'P0001';
  end if;
  if p.name like 'Learning Center%' then
    raise exception 'school_rule: The Learning Center''s times are the school''s rule: in at 8:45 to 9:00, collected any time until 7:00 PM.' using errcode = 'P0001';
  end if;
  if p_starts is null or p_ends is null or p_starts < '09:00' or p_ends > '19:00' then
    raise exception 'outside_hours: Classes run inside 9:00 AM to 7:00 PM.' using errcode = 'P0001';
  end if;
  if p_ends < p_starts + interval '30 minutes' then
    raise exception 'too_short: A class needs at least 30 minutes between start and end.' using errcode = 'P0001';
  end if;
  update public.programmes set starts = p_starts, ends = p_ends, extended = p_extended, flexible = false,
    -- Drop-off: the 15 minutes before; an extended day takes children from 9:00 (8:45 for a 9:00 start).
    dropoff_from = case when p_extended and p_starts > '09:00' then '09:00'::time else p_starts - interval '15 minutes' end,
    dropoff_to = p_starts,
    -- Pickup: the 15 minutes after; an extended day any time until 7:00 PM.
    pickup_from = p_ends,
    pickup_to = case when p_extended then greatest(p_ends, '19:00'::time) else least(p_ends + interval '15 minutes', '19:15'::time) end
  where id = p_programme returning * into p;
  return p;
end $$;

-- 4. Regular times: one drop-off and one pickup for every day the programme runs (checked by app.check_child_schedule).
create function public.set_regular_times(p_child uuid, p_dropoff time, p_pickup time) returns void
language plpgsql security definer set search_path = '' as $$
declare
  days smallint[];
begin
  if not app.is_planner() then
    raise exception 'Only the core team or the admin can set regular times.' using errcode = '42501';
  end if;
  select p.weekdays into days from public.children c join public.programmes p on p.id = c.programme_id where c.id = p_child and c.active;
  if days is null then
    raise exception 'This child is not registered with the school.' using errcode = 'P0001';
  end if;
  delete from public.child_schedules where child_id = p_child;
  if p_dropoff is not null and p_pickup is not null then
    insert into public.child_schedules (child_id, weekday, dropoff, pickup) select p_child, d, p_dropoff, p_pickup from unnest(days) d;
  end if;
end $$;

-- 5. Messages: one conversation per child, with every guardian who has the app and the school's office -------------------
create table public.messages (
  id bigint generated always as identity primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  sender uuid not null references public.profiles (id),
  -- Kept with the message, so a parent sees "Meera, core team" without reading the staff list.
  sender_name text not null,
  sender_role text not null check (sender_role in ('parent', 'family', 'admin', 'core', 'pro')),
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index on public.messages (child_id, created_at);
alter table public.messages enable row level security;
create policy read on public.messages for select to authenticated using (app.is_office() or app.is_guardian_of(child_id));
revoke all on public.messages from public, anon, authenticated;
grant select on public.messages to authenticated;

create table public.message_reads (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (profile_id, child_id)
);
alter table public.message_reads enable row level security;
create policy own on public.message_reads for select to authenticated using (profile_id = app.me());
revoke all on public.message_reads from public, anon, authenticated;
grant select on public.message_reads to authenticated;

create function public.send_message(p_child uuid, p_body text) returns public.messages
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.me();
  who record;
  role text;
  m public.messages;
begin
  if me is null or not (app.is_guardian_of(p_child) or app.is_office()) then
    raise exception 'Only this child''s family or the school office can write here.' using errcode = '42501';
  end if;
  if (select count(*) from public.messages where sender = me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate_limited: That''s a lot of messages at once. Wait a moment and try again.' using errcode = 'P0001';
  end if;
  select p.full_name, g.kind into who from public.profiles p left join public.guardianships g on g.guardian_id = p.id and g.child_id = p_child where p.id = me;
  role := case when who.kind is not null then who.kind::text
               when app.has_role('core') then 'core' when app.has_role('pro') then 'pro' else 'admin' end;
  insert into public.messages (child_id, sender, sender_name, sender_role, body)
  values (p_child, me, who.full_name, role, btrim(p_body)) returning * into m;
  insert into public.message_reads (profile_id, child_id) values (me, p_child)
    on conflict (profile_id, child_id) do update set read_at = now();
  return m;
end $$;

create function public.mark_read(p_child uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.message_reads (profile_id, child_id)
  select app.me(), p_child where app.me() is not null and (app.is_guardian_of(p_child) or app.is_office())
  on conflict (profile_id, child_id) do update set read_at = now()
$$;

-- 6. Announcements: instant, no approval step, to all parents or one class -------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 60),
  body text not null check (length(btrim(body)) between 5 and 300),
  class_id uuid references public.classes (id),
  sent_by uuid not null references public.profiles (id),
  sender_name text not null,
  sender_role text not null,
  created_at timestamptz not null default now()
);
create index on public.announcements (created_at desc);
alter table public.announcements enable row level security;
create policy read on public.announcements for select to authenticated using (
  app.is_staff() or app.is_front_desk()
  or exists (select 1 from public.guardianships g join public.children c on c.id = g.child_id
             where g.guardian_id = app.me() and c.active and (announcements.class_id is null or c.class_id = announcements.class_id))
);
revoke all on public.announcements from public, anon, authenticated;
grant select on public.announcements to authenticated;
create trigger audit after insert or update or delete on public.announcements for each row execute function app.audit();

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);
alter table public.announcement_reads enable row level security;
create policy own on public.announcement_reads for select to authenticated using (profile_id = app.me());
revoke all on public.announcement_reads from public, anon, authenticated;
grant select on public.announcement_reads to authenticated;

-- The guardians an announcement reaches: on the record, with the app, for an active child in the class (or any).
create function app.recipients(p_class uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct g.guardian_id from public.guardianships g
  join public.children c on c.id = g.child_id and c.active
  join public.profiles p on p.id = g.guardian_id and p.active and p.app_access
  where p_class is null or c.class_id = p_class
$$;

create function public.send_announcement(p_title text, p_body text, p_class uuid default null) returns public.announcements
language plpgsql security definer set search_path = '' as $$
declare
  a public.announcements;
begin
  if not app.is_office() then
    raise exception 'Only the admin, the core team or the front desk can send announcements.' using errcode = '42501';
  end if;
  if (select count(*) from public.announcements where sent_by = app.me() and created_at > now() - interval '1 minute') >= 3 then
    raise exception 'rate_limited: Several announcements just went out. Wait a moment before sending another.' using errcode = 'P0001';
  end if;
  insert into public.announcements (title, body, class_id, sent_by, sender_name, sender_role)
  select btrim(p_title), btrim(p_body), p_class, p.id, p.full_name,
         case when app.has_role('core') then 'core team' when app.has_role('pro') then 'front desk' else 'admin' end
  from public.profiles p where p.id = app.me()
  returning * into a;
  return a;
end $$;

create function public.mark_announcement_read(p_announcement uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.announcement_reads (announcement_id, profile_id)
  select a.id, app.me() from public.announcements a where a.id = p_announcement and app.me() in (select app.recipients(a.class_id))
  on conflict do nothing
$$;

-- For the office: how many each announcement reached, and how many have read it.
create function public.announcement_stats() returns table (announcement_id uuid, recipients int, reads int)
language sql stable security definer set search_path = '' as $$
  select a.id, (select count(*)::int from app.recipients(a.class_id)),
         (select count(*)::int from public.announcement_reads r where r.announcement_id = a.id)
  from public.announcements a where app.is_office()
$$;

-- How many parents a new announcement would reach (the "Send to 12 parents" button).
create function public.recipient_count(p_class uuid default null) returns int
language sql stable security definer set search_path = '' as $$
  select case when app.is_office() then (select count(*)::int from app.recipients(p_class)) end
$$;

-- 7. Logged calls: a parent phones or walks in; the office does it for them in one step (D25) --------------------------------
create table public.calls (
  id bigint generated always as identity primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  guardian_id uuid not null references public.profiles (id),
  what text not null check (what in ('otw', 'time', 'absent', 'note')),
  summary text not null check (length(summary) between 1 and 300),
  logged_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.calls (created_at desc);
alter table public.calls enable row level security;
create policy read on public.calls for select to authenticated using (app.is_staff() or app.is_front_desk());
revoke all on public.calls from public, anon, authenticated;
grant select on public.calls to authenticated;

-- p_what: 'otw' (p_direction, p_minutes), 'time' (p_direction, p_at), 'absent' (p_reason) or 'note' (p_note).
create function public.log_call(p_child uuid, p_guardian uuid, p_what text, p_direction public.trip_direction default null,
  p_minutes int default null, p_at time default null, p_reason text default null, p_note text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.me();
  g record;
  summary text;
  t public.trips;
  id_ bigint;
begin
  if me is null or not app.has_role('admin', 'core', 'coordinator', 'pro') then
    raise exception 'Only school staff can log a call.' using errcode = '42501';
  end if;
  select p.full_name, gs.relation into g from public.guardianships gs join public.profiles p on p.id = gs.guardian_id and p.active
    where gs.child_id = p_child and gs.guardian_id = p_guardian;
  if not found then
    raise exception 'guardian_required: Choose one of the child''s parents or family.' using errcode = 'P0001';
  end if;
  if p_what = 'otw' then
    t := app.book_trip(p_child, p_direction, p_minutes, p_reason, p_guardian);
    update public.trips set phoned_in_by = me where id = t.id returning * into t;
    summary := format('On the way for the %s, about %s', replace(p_direction::text, 'dropoff', 'drop-off'), to_char(t.arrive_at at time zone 'Asia/Kolkata', 'FMHH12:MI AM'));
  elsif p_what = 'time' then
    perform app.set_day_time(p_child, p_direction, p_at, p_reason, p_guardian);
    summary := format('New %s time today, %s', replace(p_direction::text, 'dropoff', 'drop-off'), to_char(p_at, 'FMHH12:MI AM'));
  elsif p_what = 'absent' then
    if nullif(btrim(p_reason), '') is null then
      raise exception 'reason_required: Say why, in a few words.' using errcode = 'P0001';
    end if;
    insert into public.attendance (child_id, day, status, note, reported_by) values (p_child, app.today(), 'absent', btrim(p_reason), p_guardian)
      on conflict (child_id, day) do update set status = 'absent', note = excluded.note, reported_by = excluded.reported_by;
    perform app.cancel_day(p_child, app.today());
    summary := format('Absent today: %s', btrim(p_reason));
  elsif p_what = 'note' then
    if length(btrim(coalesce(p_note, ''))) not between 1 and 280 then
      raise exception 'note_required: Write what they said (up to 280 characters).' using errcode = 'P0001';
    end if;
    summary := btrim(p_note);
  else
    raise exception 'Unknown kind of call.' using errcode = 'P0001';
  end if;
  insert into public.calls (child_id, guardian_id, what, summary, logged_by) values (p_child, p_guardian, p_what, summary, me) returning id into id_;
  return id_;
end $$;

-- 8. A parent's saved people (a regular driver; not family) and notification choices ----------------------------------------
create table public.saved_people (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 2 and 80),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  relation text not null check (length(btrim(relation)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (owner, phone)
);
alter table public.saved_people enable row level security;
create policy own on public.saved_people for all to authenticated using (owner = app.me()) with check (owner = app.me());
revoke all on public.saved_people from public, anon, authenticated;
grant select, insert, delete on public.saved_people to authenticated;

alter table public.profiles add column notify_morning boolean not null default true,
  add column notify_family boolean not null default true;
create function public.set_my_notifications(p_morning boolean, p_family boolean) returns void
language sql security definer set search_path = '' as $$
  update public.profiles set notify_morning = p_morning, notify_family = p_family where id = app.me()
$$;

-- Realtime for what screens show live.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.announcements, public.day_times, public.attendance, public.calls;
  end if;
end $$;

-- 9. Who may call what ------------------------------------------------------------------------------------------------------
revoke all on function app.is_planner(), app.is_office(), app.today(), app.cancel_day(uuid, date), app.set_day_time(uuid, public.trip_direction, time, text, uuid),
  app.recipients(uuid) from public, anon, authenticated;
grant execute on function app.is_planner(), app.is_office(), app.today() to authenticated;
revoke all on function public.set_attendance(uuid, date, public.attendance_status, text), public.report_absence(uuid, date, text), public.undo_absence(uuid, date),
  public.change_day_time(uuid, public.trip_direction, time, text), public.set_programme_hours(uuid, time, time, boolean), public.set_regular_times(uuid, time, time),
  public.send_message(uuid, text), public.mark_read(uuid), public.send_announcement(text, text, uuid), public.mark_announcement_read(uuid),
  public.announcement_stats(), public.recipient_count(uuid),
  public.log_call(uuid, uuid, text, public.trip_direction, int, time, text, text), public.set_my_notifications(boolean, boolean) from public, anon;
grant execute on function public.set_attendance(uuid, date, public.attendance_status, text), public.report_absence(uuid, date, text), public.undo_absence(uuid, date),
  public.change_day_time(uuid, public.trip_direction, time, text), public.set_programme_hours(uuid, time, time, boolean), public.set_regular_times(uuid, time, time),
  public.send_message(uuid, text), public.mark_read(uuid), public.send_announcement(text, text, uuid), public.mark_announcement_read(uuid),
  public.announcement_stats(), public.recipient_count(uuid),
  public.log_call(uuid, uuid, text, public.trip_direction, int, time, text, text), public.set_my_notifications(boolean, boolean) to authenticated;
