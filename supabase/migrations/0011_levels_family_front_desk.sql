-- The owner's decisions of 2026-09-24 in the data (PRD D18, D25, D26, D27):
-- classes are the levels; family who can collect and parents who live abroad; the PRO team's front desk with
-- "Log a call"; and Admin held only by the two owners.

-- 1. A child's class is their level (D18) ----------------------------------------------------------------------------
-- The classes are fixed: the four preschool levels and the three programmes of their own. Each programme belongs to one,
-- and a child's class always follows their programme (never typed in). Coordinators are assigned to these.
alter table public.classes add column sort smallint;
insert into public.classes (name, sort) values
  ('Playgroup', 1), ('Nursery', 2), ('Jr KG', 3), ('Sr KG', 4), ('Learning Center', 5), ('Preschool Readiness', 6), ('After School', 7)
on conflict (name) do update set sort = excluded.sort, active = true;

alter table public.programmes add column class_id uuid references public.classes (id);
update public.programmes p set class_id = c.id
from public.classes c
where c.name = case
  when p.name like 'Playgroup%' then 'Playgroup'
  when p.name like 'Nursery%' then 'Nursery'
  when p.name like 'Jr KG%' then 'Jr KG'
  when p.name like 'Sr KG%' then 'Sr KG'
  when p.name like 'Learning Center%' then 'Learning Center'
  when p.name like 'Preschool Readiness%' then 'Preschool Readiness'
  when p.name like 'After School%' then 'After School'
end;
do $$ begin
  if exists (select 1 from public.programmes where class_id is null) then
    raise exception 'A programme has no level: %', (select string_agg(name, ', ') from public.programmes where class_id is null);
  end if;
end $$;
alter table public.programmes alter column class_id set not null;

create function app.class_from_programme() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select p.class_id into new.class_id from public.programmes p where p.id = new.programme_id;
  return new;
end $$;
create trigger class_from_programme before insert or update of programme_id, class_id on public.children
  for each row execute function app.class_from_programme();
update public.children ch set class_id = p.class_id from public.programmes p where p.id = ch.programme_id and ch.class_id <> p.class_id;

-- The old admin-named groups go, with any coordinator assignments to them (the core team assigns levels instead).
delete from public.coordinator_classes cc where not exists (select 1 from public.programmes p where p.class_id = cc.class_id);
delete from public.classes c where not exists (select 1 from public.programmes p where p.class_id = c.id);
alter table public.classes alter column sort set not null;
drop policy admin_write on public.classes;
revoke insert, update, delete on public.classes from authenticated;

-- 2. Family who can collect, and parents who live abroad (D26) ---------------------------------------------------------
create type public.guardian_kind as enum ('parent', 'family');
alter table public.guardianships add column kind public.guardian_kind not null default 'parent';
update public.guardianships set kind = 'family'
  where lower(relation) not in ('mother', 'father', 'parent', 'legal guardian', 'guardian');
alter table public.profiles add column abroad boolean not null default false;
-- Family abroad, and parents who live there, have numbers from other countries.
alter table public.profiles drop constraint profiles_phone_check;
alter table public.profiles add constraint profiles_phone_check check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');

-- The admin adds a child with parents and family in one step. p_guardians: [{"guardian_id", "relation", "kind"}].
create or replace function public.admin_add_child(
  p_full_name text, p_preferred_name text, p_date_of_birth date, p_class_id uuid, p_programme_id uuid, p_guardians jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  new_id uuid;
begin
  if jsonb_typeof(p_guardians) is distinct from 'array' or jsonb_array_length(p_guardians) = 0 then
    raise exception 'A child needs at least one parent or family member.' using errcode = 'check_violation';
  end if;
  if p_date_of_birth > current_date then
    raise exception 'The date of birth cannot be in the future.' using errcode = 'check_violation';
  end if;
  -- The class comes from the programme (the trigger above); p_class_id is kept for older app versions and ignored.
  insert into public.children (full_name, preferred_name, date_of_birth, class_id, programme_id)
  values (btrim(p_full_name), nullif(btrim(p_preferred_name), ''), p_date_of_birth,
          (select class_id from public.programmes where id = p_programme_id), p_programme_id)
  returning id into new_id;
  insert into public.guardianships (child_id, guardian_id, relation, kind)
  select new_id, (g ->> 'guardian_id')::uuid, btrim(g ->> 'relation'), coalesce((g ->> 'kind')::public.guardian_kind, 'parent')
  from jsonb_array_elements(p_guardians) as g;
  return new_id;
end $$;

-- 3. Admin is held only by the two owners (D27) -------------------------------------------------------------------------
-- Nobody signed in to the app can give or take the Admin role, or switch an admin off; the owner changes admins in the
-- database itself (where there is no app user).
create function app.guard_admin_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is not null and ((tg_op = 'INSERT' and new.role = 'admin') or (tg_op = 'DELETE' and old.role = 'admin')) then
    raise exception 'admin_locked: Only the school''s owners are admins, and that can''t be changed in the app.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_admin_role before insert or delete on public.staff_roles for each row execute function app.guard_admin_role();

create function app.guard_admin_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is not null and old.active and not new.active
     and exists (select 1 from public.staff_roles r where r.profile_id = old.id and r.role = 'admin') then
    raise exception 'admin_locked: An admin''s access can''t be switched off in the app.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_admin_access before update of active on public.profiles for each row execute function app.guard_admin_access();

-- 4. The PRO team's front desk (D25) -------------------------------------------------------------------------------------
-- They see the day (children, their parents and family, programmes, trips and attendance) to answer calls, but not live
-- locations, roles or the audit log.
create function app.is_front_desk() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_role('pro')
$$;
create policy front_desk_read on public.children for select to authenticated using (app.is_front_desk());
create policy front_desk_read on public.guardianships for select to authenticated using (app.is_front_desk());
create policy front_desk_read on public.profiles for select to authenticated using (app.is_front_desk());
create policy front_desk_read on public.child_schedules for select to authenticated using (app.is_front_desk());
create policy front_desk_read on public.attendance for select to authenticated using (app.is_front_desk());
create policy front_desk_read on public.trips for select to authenticated using (app.is_front_desk());

-- "Log a call": a parent or family member phones or walks in, and staff book the trip for them. It reaches the gate like
-- their own tap, marked "Phoned in" with who took the call.
alter table public.trips add column phoned_in_by uuid references public.profiles (id);

-- The booking itself, shared by a parent's own "I'm on my way" and a logged call. Callers check who may do it.
create function app.book_trip(p_child uuid, p_direction public.trip_direction, p_minutes int, p_reason text, p_for uuid)
returns public.trips
language plpgsql security definer set search_path = '' as $$
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
end $$;

create or replace function public.start_trip(p_child uuid, p_direction public.trip_direction, p_minutes int, p_reason text default null)
returns public.trips
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is null or not (app.is_guardian_of(p_child) or app.has_role('admin', 'core')) then
    raise exception 'Only this child''s parents or the school can do this.' using errcode = '42501';
  end if;
  return app.book_trip(p_child, p_direction, p_minutes, p_reason, app.me());
end $$;

create function public.log_call_trip(p_child uuid, p_direction public.trip_direction, p_minutes int, p_guardian uuid, p_reason text default null)
returns public.trips
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips;
begin
  if app.me() is null or not app.has_role('admin', 'core', 'coordinator', 'pro') then
    raise exception 'Only school staff can log a call.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.guardianships g join public.profiles p on p.id = g.guardian_id
                 where g.child_id = p_child and g.guardian_id = p_guardian and p.active) then
    raise exception 'guardian_required: Choose one of the child''s parents or family.' using errcode = 'P0001';
  end if;
  t := app.book_trip(p_child, p_direction, p_minutes, p_reason, p_guardian);
  update public.trips set phoned_in_by = app.me() where id = t.id returning * into t;
  return t;
end $$;

revoke all on function app.book_trip(uuid, public.trip_direction, int, text, uuid) from public, anon, authenticated;
revoke all on function public.log_call_trip(uuid, public.trip_direction, int, uuid, text) from public, anon;
grant execute on function public.log_call_trip(uuid, public.trip_direction, int, uuid, text) to authenticated;
grant execute on function app.is_front_desk() to authenticated;
