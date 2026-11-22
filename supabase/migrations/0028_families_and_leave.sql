-- 0028: the owner's changes of 2026-09-26 (PRD D44-D46).
-- 1. Staff names: "Coordinator" is now "Center leader" and "Core team" is "Head office" in every message people read.
--    The role keys ('coordinator', 'core') stay as they are.
-- 2. Parents add and remove relatives (grandparents, aunts, uncles) on their own child's record. The school still adds
--    and removes parents.
-- 3. Parents report an absence for several days at once (up to 31 days, starting within the next 90).
-- 4. Bulk upload takes children whose date of birth isn't known yet; the school adds it later on the child's page.

-- 1. Staff names ---------------------------------------------------------------------------------------------------------
do $$
declare
  f record;
  src text;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app') and p.prokind = 'f'
      and (p.prosrc like '%core team%' or p.prosrc like '%Only coordinators can%' or p.prosrc like '%the Coordinator role%')
  loop
    src := pg_get_functiondef(f.oid);
    src := replace(src, 'core team', 'head office');
    src := replace(src, 'Only coordinators can', 'Only center leaders can');
    src := replace(src, 'the Coordinator role', 'the Center leader role');
    execute src;
  end loop;
end $$;

update public.announcements set sender_role = 'head office' where sender_role = 'core team';

-- 2. Relatives added by parents ------------------------------------------------------------------------------------------
-- Only a parent on the record (not a relative) may change it. New people only: linking someone already registered
-- stays with the school, so a parent can't learn who else is registered.
create function app.is_parent_of(p_child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.guardianships g where g.child_id = p_child and g.guardian_id = app.me() and g.kind = 'parent')
$$;

-- p_person: {"full_name", "relation", "phone" (+91...), "email" (optional; with it they can sign in to the app)}.
create function public.parent_add_relative(p_child uuid, p_person jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  nm text := btrim(coalesce(p_person ->> 'full_name', ''));
  rel text := btrim(coalesce(p_person ->> 'relation', ''));
  ph text := nullif(btrim(coalesce(p_person ->> 'phone', '')), '');
  em text := nullif(lower(btrim(coalesce(p_person ->> 'email', ''))), '');
  pid uuid;
begin
  if app.me() is null or not app.is_parent_of(p_child) then
    raise exception 'Only this child''s parents can do this.' using errcode = '42501';
  end if;
  perform app.throttle('family:' || app.me(), 20, interval '1 hour');
  if length(nm) not between 2 and 80 then
    raise exception 'name_required: Enter their first and last name.' using errcode = 'P0001';
  end if;
  if length(rel) not between 1 and 40 then
    raise exception 'relation_required: Say how they are related, like Grandmother.' using errcode = 'P0001';
  end if;
  if ph is null or ph !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'phone_required: Enter their mobile number, so the gate can check who they are.' using errcode = 'P0001';
  end if;
  if em is not null and em !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'bad_email: That email doesn''t look right.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where phone = ph or (em is not null and email = em)) then
    raise exception 'already_registered: This person is already registered with the school. Ask the school to add them.' using errcode = 'P0001';
  end if;
  insert into public.profiles (full_name, email, phone, abroad, app_access)
  values (nm, em, ph, false, em is not null)
  returning id into pid;
  insert into public.guardianships (child_id, guardian_id, relation, kind) values (p_child, pid, rel, 'family');
  return pid;
end $$;

create function public.parent_remove_relative(p_child uuid, p_person uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is null or not app.is_parent_of(p_child) then
    raise exception 'Only this child''s parents can do this.' using errcode = '42501';
  end if;
  delete from public.guardianships where child_id = p_child and guardian_id = p_person and kind = 'family';
  if not found then
    raise exception 'not_family: Only relatives can be removed here. Call the school to change a parent.' using errcode = 'P0001';
  end if;
end $$;

-- my_family now says who each person is, so a parent can remove a relative.
drop function public.my_family();
create function public.my_family() returns table (child_id uuid, guardian_id uuid, full_name text, relation text, kind public.guardian_kind, abroad boolean, has_app boolean)
language sql stable security definer set search_path = '' as $$
  select g.child_id, g.guardian_id, p.full_name, g.relation, g.kind, p.abroad, p.app_access and p.user_id is not null
  from public.guardianships g
  join public.profiles p on p.id = g.guardian_id and p.active
  join public.children c on c.id = g.child_id and c.active
  where g.guardian_id <> app.me() and app.is_guardian_of(g.child_id)
  order by g.kind, p.full_name
$$;

-- 3. Absence for several days ------------------------------------------------------------------------------------------
-- Marks every school day of the child's programme between the two dates. Days they're already checked in are skipped.
-- Returns how many days were marked.
create function public.report_absence_range(p_child uuid, p_from date, p_to date, p_reason text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  why text := nullif(btrim(p_reason), '');
  prog uuid;
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
  select programme_id into prog from public.children where id = p_child and active;
  for d in select generate_series(p_from, p_to, interval '1 day')::date loop
    continue when not app.runs_on(prog, d);
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

revoke all on function app.is_parent_of(uuid) from public, anon;
grant execute on function app.is_parent_of(uuid) to authenticated;
revoke all on function public.parent_add_relative(uuid, jsonb), public.parent_remove_relative(uuid, uuid), public.my_family(),
  public.report_absence_range(uuid, date, date, text) from public, anon;
grant execute on function public.parent_add_relative(uuid, jsonb), public.parent_remove_relative(uuid, uuid), public.my_family(),
  public.report_absence_range(uuid, date, date, text) to authenticated;

-- 4. Date of birth can wait -----------------------------------------------------------------------------------------------
alter table public.children alter column date_of_birth drop not null;

-- The duplicate check also catches the same name twice with no date of birth.
create or replace function public.import_child(p_child jsonb, p_people jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  name text := btrim(coalesce(p_child ->> 'full_name', ''));
  dob date;
  resolved jsonb := '[]'::jsonb;
  p jsonb;
  by_email uuid;
  by_phone uuid;
begin
  if not app.has_role('admin', 'core') then
    raise exception 'Only the admin or the head office can import children.' using errcode = '42501';
  end if;
  if length(name) < 2 then
    raise exception 'name_required: Enter the child''s first and last name.' using errcode = 'P0001';
  end if;
  begin
    dob := nullif(p_child ->> 'date_of_birth', '')::date;
  exception when others then
    raise exception 'bad_date: The date of birth isn''t a date.' using errcode = 'P0001';
  end;
  if exists (select 1 from public.children where active and lower(full_name) = lower(name) and date_of_birth is not distinct from dob) then
    raise exception 'duplicate: % is already registered%.', name, coalesce(' (born ' || to_char(dob, 'DD Mon YYYY') || ')', '') using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_people) is distinct from 'array' then
    raise exception 'people_required: Add at least one parent or relative.' using errcode = 'P0001';
  end if;

  for p in select value from jsonb_array_elements(p_people) loop
    select id into by_email from public.profiles where active and email is not null and email = nullif(lower(btrim(p ->> 'email')), '');
    select id into by_phone from public.profiles where active and phone is not null and phone = nullif(btrim(p ->> 'phone'), '');
    if by_email is not null and by_phone is not null and by_email <> by_phone then
      raise exception 'person_conflict: %''s email and mobile belong to two different people on the school''s records.', btrim(p ->> 'full_name') using errcode = 'P0001';
    end if;
    resolved := resolved || case when coalesce(by_email, by_phone) is not null
      then jsonb_build_object('id', coalesce(by_email, by_phone), 'relation', p ->> 'relation', 'kind', p ->> 'kind')
      else p end;
  end loop;

  return public.admin_save_child(p_child, resolved);
end $$;
