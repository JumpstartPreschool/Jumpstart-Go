-- M0 foundation: people, roles, programmes, classes, children, schedules, holidays, attendance, settings, audit log.
-- Every table has row-level security; nothing is readable or writable without a matching policy.
-- Single branch in release 1 (system-architecture A9).

create schema if not exists app;

create type public.app_role as enum ('admin', 'core', 'coordinator');
create type public.saturday_rule as enum ('every', 'except_2nd_and_last');
create type public.attendance_status as enum ('present', 'absent', 'on_leave', 'off');

-- People ---------------------------------------------------------------------

-- Parents and staff. Created by the admin (invite-only, PRD D1); login is through Supabase Auth.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  email text unique check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text unique check (phone is null or phone ~ '^\+91[6-9][0-9]{9}$'),
  active boolean not null default true,
  consent_version text,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create table public.staff_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  primary key (user_id, role)
);

-- Timing plans (PRD D19). Hours inside the fixed school hours 09:00–19:00 (D6);
-- fixed windows inside the hours, or flexible (no windows).
create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 80),
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 6 and weekdays <@ '{1,2,3,4,5,6}'),
  saturday_rule public.saturday_rule not null default 'every',
  term_start date,
  term_end date,
  starts time not null,
  ends time not null,
  flexible boolean not null default false,
  dropoff_from time,
  dropoff_to time,
  pickup_from time,
  pickup_to time,
  active boolean not null default true,
  check ((term_start is null) = (term_end is null) and (term_start is null or term_start <= term_end)),
  check (starts >= '09:00' and ends <= '19:00' and starts < ends),
  check (
    (flexible and dropoff_from is null and dropoff_to is null and pickup_from is null and pickup_to is null)
    or (not flexible
      and dropoff_from >= starts and dropoff_to <= ends and dropoff_from <= dropoff_to
      and pickup_from >= starts and pickup_to <= ends and pickup_from <= pickup_to)
  )
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 60),
  active boolean not null default true
);

-- Children are never hard-deleted by staff: "remove" sets active = false so attendance
-- history is kept for its retention period (PRD D9). Hard deletion is a retention job.
create table public.children (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  preferred_name text check (preferred_name is null or length(btrim(preferred_name)) between 1 and 60),
  date_of_birth date not null check (date_of_birth > '2010-01-01'),
  class_id uuid not null references public.classes (id),
  programme_id uuid not null references public.programmes (id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.guardianships (
  child_id uuid not null references public.children (id) on delete cascade,
  guardian_id uuid not null references public.profiles (id) on delete cascade,
  relation text not null check (length(btrim(relation)) between 1 and 40),
  primary key (child_id, guardian_id)
);
create index on public.guardianships (guardian_id);

-- Which coordinators hear which classes (PRD D11).
create table public.coordinator_classes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  primary key (user_id, class_id)
);
create index on public.coordinator_classes (class_id);

-- Each child's regular times per weekday (SCH-1), checked against the programme by a trigger.
create table public.child_schedules (
  child_id uuid not null references public.children (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 6),
  dropoff time not null,
  pickup time not null,
  primary key (child_id, weekday),
  check (dropoff < pickup)
);

create table public.holidays (
  day date primary key,
  name text not null check (length(btrim(name)) between 1 and 80)
);

create table public.attendance (
  child_id uuid not null references public.children (id) on delete cascade,
  day date not null,
  status public.attendance_status not null,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  note text check (note is null or length(note) <= 500),
  primary key (child_id, day),
  check (checked_out_at is null or checked_in_at is null or checked_out_at >= checked_in_at)
);
create index on public.attendance (day);

-- Admin settings (one row). School hours are not a setting (D6).
create table public.settings (
  id boolean primary key default true check (id),
  arrival_radius_m integer not null default 200 check (arrival_radius_m between 50 and 1000),
  get_ready_lead_min integer not null default 10 check (get_ready_lead_min between 1 and 30),
  late_threshold_min integer not null default 10 check (late_threshold_min between 5 and 60),
  morning_reminder boolean not null default true,
  school_phone text check (school_phone is null or school_phone ~ '^\+91[0-9]{10}$')
);
insert into public.settings default values;

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  table_name text not null,
  old_row jsonb,
  new_row jsonb
);
create index on public.audit_log (at desc);
create index on public.audit_log (actor, at desc);

-- Helpers used by the policies. SECURITY DEFINER so they can read roles without recursive RLS.
-- A deactivated profile has no roles and no guardianships in effect (AUTH-3).

create function app.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create function app.has_role(variadic roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_roles r join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid() and p.active and r.role = any (roles)
  )
$$;

create function app.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_role('admin', 'core', 'coordinator')
$$;

create function app.is_guardian_of(child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.guardianships g join public.profiles p on p.id = g.guardian_id
    where g.child_id = child and g.guardian_id = auth.uid() and p.active
  )
$$;

-- Regular times must fit the child's programme (SCH-1, SCH-9).
create function app.check_child_schedule() returns trigger
language plpgsql set search_path = '' as $$
declare
  p public.programmes;
begin
  select pr.* into p
  from public.children c join public.programmes pr on pr.id = c.programme_id
  where c.id = new.child_id;

  if not (new.weekday = any (p.weekdays)) then
    raise exception '% does not run on this day', p.name using errcode = 'check_violation';
  end if;
  if p.flexible then
    if new.dropoff < p.starts or new.pickup > p.ends then
      raise exception 'Times must be within % hours (% to %)', p.name, p.starts, p.ends using errcode = 'check_violation';
    end if;
  else
    if new.dropoff not between p.dropoff_from and p.dropoff_to then
      raise exception 'Drop-off must be within the % drop-off window (% to %)', p.name, p.dropoff_from, p.dropoff_to using errcode = 'check_violation';
    end if;
    if new.pickup not between p.pickup_from and p.pickup_to then
      raise exception 'Pickup must be within the % pickup window (% to %)', p.name, p.pickup_from, p.pickup_to using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger check_child_schedule before insert or update on public.child_schedules
for each row execute function app.check_child_schedule();

-- After a programme change, regular times that no longer fit are listed for the core team (SCH-9).
create view public.schedules_outside_windows with (security_invoker = true) as
select s.*, c.full_name, p.name as programme_name
from public.child_schedules s
join public.children c on c.id = s.child_id
join public.programmes p on p.id = c.programme_id
where not (s.weekday = any (p.weekdays))
   or (p.flexible and (s.dropoff < p.starts or s.pickup > p.ends))
   or (not p.flexible and (s.dropoff not between p.dropoff_from and p.dropoff_to
                        or s.pickup not between p.pickup_from and p.pickup_to));

-- Audit trail for every sensitive table (ADM-3). Written by trigger, readable only by the admin.
create function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor, action, table_name, old_row, new_row)
  values (auth.uid(), lower(tg_op), tg_table_name,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'staff_roles', 'programmes', 'classes', 'children', 'guardianships',
                           'coordinator_classes', 'child_schedules', 'holidays', 'attendance', 'settings'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit()', t);
  end loop;
end $$;

-- Row-level security -----------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.staff_roles enable row level security;
alter table public.programmes enable row level security;
alter table public.classes enable row level security;
alter table public.children enable row level security;
alter table public.guardianships enable row level security;
alter table public.coordinator_classes enable row level security;
alter table public.child_schedules enable row level security;
alter table public.holidays enable row level security;
alter table public.attendance enable row level security;
alter table public.settings enable row level security;
alter table public.audit_log enable row level security;

-- profiles: yourself, or any profile if you are staff. Only the admin writes (consent goes through a function in M1).
create policy read on public.profiles for select to authenticated using (id = auth.uid() or app.is_staff());
create policy admin_insert on public.profiles for insert to authenticated with check (app.has_role('admin'));
create policy admin_update on public.profiles for update to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));

create policy read on public.staff_roles for select to authenticated using (user_id = auth.uid() or app.is_staff());
create policy admin_write on public.staff_roles for all to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));

-- programmes and holidays: everyone signed in reads; core team and admin write (owner, 2026-09-24).
create policy read on public.programmes for select to authenticated using (app.is_active());
create policy planner_write on public.programmes for all to authenticated
  using (app.has_role('admin', 'core')) with check (app.has_role('admin', 'core'));

create policy read on public.holidays for select to authenticated using (app.is_active());
create policy planner_write on public.holidays for all to authenticated
  using (app.has_role('admin', 'core')) with check (app.has_role('admin', 'core'));

create policy read on public.classes for select to authenticated using (app.is_active());
create policy admin_write on public.classes for all to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));

-- children: staff read all, guardians read their own. Only the admin adds, edits or archives (D1).
create policy read on public.children for select to authenticated using (app.is_staff() or app.is_guardian_of(id));
create policy admin_insert on public.children for insert to authenticated with check (app.has_role('admin'));
create policy admin_update on public.children for update to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));

create policy read on public.guardianships for select to authenticated using (app.is_staff() or (guardian_id = auth.uid() and app.is_active()));
create policy admin_write on public.guardianships for all to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));

create policy read on public.coordinator_classes for select to authenticated using (app.is_staff());
create policy admin_write on public.coordinator_classes for all to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));

create policy read on public.child_schedules for select to authenticated using (app.is_staff() or app.is_guardian_of(child_id));
create policy planner_write on public.child_schedules for all to authenticated
  using (app.has_role('admin', 'core')) with check (app.has_role('admin', 'core'));

-- attendance: core team and admin set any status (ATT-2); gate check-in and parent absences arrive as functions later.
create policy read on public.attendance for select to authenticated using (app.is_staff() or app.is_guardian_of(child_id));
create policy planner_write on public.attendance for all to authenticated
  using (app.has_role('admin', 'core')) with check (app.has_role('admin', 'core'));

create policy read on public.settings for select to authenticated using (app.is_active());
create policy admin_update on public.settings for update to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));

create policy admin_read on public.audit_log for select to authenticated using (app.has_role('admin'));

-- Privileges: nothing for anonymous visitors; RLS narrows what signed-in users can do.
-- Supabase grants everything to anon and authenticated by default, so start from nothing.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.audit_log to authenticated;
grant select, insert, update on public.profiles, public.children to authenticated;
grant select, insert, update, delete on public.staff_roles, public.programmes, public.classes, public.guardianships,
  public.coordinator_classes, public.child_schedules, public.holidays, public.attendance to authenticated;
grant select, update on public.settings to authenticated;
grant select on public.schedules_outside_windows to authenticated;
grant usage on schema app to authenticated;
revoke execute on all functions in schema app from public;
grant execute on function app.is_active(), app.has_role(public.app_role[]), app.is_staff(), app.is_guardian_of(uuid) to authenticated;
