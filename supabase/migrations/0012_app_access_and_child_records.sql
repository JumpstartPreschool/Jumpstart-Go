-- The admin works child-first (Screen Book v3, PRD D26): a child is saved with their parents and family in one step,
-- and each person's app access is a switch of its own. Turning app access off signs the person out everywhere but keeps
-- them on the child's list, so the gate can still hand the child over to them. "Active" stays the record itself.

-- 1. App access, separate from being on the record ---------------------------------------------------------------------
alter table public.profiles add column app_access boolean not null default true;

create or replace function app.me() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles where user_id = auth.uid() and active and app_access
$$;

create or replace function app.invited_profile(p_email text, p_phone text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles
  where active and app_access and user_id is null
    and ((p_email is not null and lower(email) = lower(p_email))
      or (p_phone is not null and phone = '+' || ltrim(p_phone, '+')))
  limit 1
$$;

create or replace function public.login_allowed(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select length(btrim(coalesce(p_email, ''))) between 3 and 254
     and exists (select 1 from public.profiles where active and app_access and lower(email) = lower(btrim(p_email)))
$$;

create or replace function app.end_sessions_on_deactivate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if ((old.active and not new.active) or (old.app_access and not new.app_access)) and new.user_id is not null then
    begin
      delete from auth.sessions where user_id = new.user_id;
    exception when insufficient_privilege or undefined_table then
      null; -- access is still refused by row-level security
    end;
  end if;
  return new;
end $$;
drop trigger end_sessions_on_deactivate on public.profiles;
create trigger end_sessions_on_deactivate after update of active, app_access on public.profiles
  for each row execute function app.end_sessions_on_deactivate();

-- Admins keep their access (D27): neither switch can be turned off for them in the app.
create or replace function app.guard_admin_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.me() is not null and ((old.active and not new.active) or (old.app_access and not new.app_access))
     and exists (select 1 from public.staff_roles r where r.profile_id = old.id and r.role = 'admin') then
    raise exception 'admin_locked: An admin''s access can''t be switched off in the app.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger guard_admin_access on public.profiles;
create trigger guard_admin_access before update of active, app_access on public.profiles
  for each row execute function app.guard_admin_access();

-- 2. People on a child's record ----------------------------------------------------------------------------------------
-- One person: {"id"} for someone already here, or {"full_name", "email", "phone", "abroad", "app_access"} for someone new;
-- plus "relation" and "kind" ('parent' or 'family'). Returns their profile id. Runs as the admin (row-level security).
create function app.person_for_record(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  pid uuid := nullif(p ->> 'id', '')::uuid;
begin
  if pid is not null then
    if not exists (select 1 from public.profiles where id = pid and active) then
      raise exception 'person_missing: Someone you linked is no longer registered. Refresh and try again.' using errcode = 'P0001';
    end if;
    return pid;
  end if;
  if length(btrim(coalesce(p ->> 'full_name', ''))) < 2 then
    raise exception 'name_required: Enter each person''s first and last name.' using errcode = 'P0001';
  end if;
  if coalesce((p ->> 'app_access')::boolean, true) and nullif(btrim(p ->> 'email'), '') is null then
    raise exception 'email_required: An email is needed for app access (the sign-in code goes there).' using errcode = 'P0001';
  end if;
  insert into public.profiles (full_name, email, phone, abroad, app_access)
  values (btrim(p ->> 'full_name'), nullif(lower(btrim(p ->> 'email')), ''), nullif(btrim(p ->> 'phone'), ''),
          coalesce((p ->> 'abroad')::boolean, false), coalesce((p ->> 'app_access')::boolean, true))
  returning id into pid;
  return pid;
end $$;

-- A child and everyone on their record, saved together or not at all.
-- p_child: {"full_name", "preferred_name", "date_of_birth", "programme_id"}; p_people: people as above.
create function public.admin_save_child(p_child jsonb, p_people jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
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
  insert into public.children (full_name, preferred_name, date_of_birth, class_id, programme_id)
  select btrim(p_child ->> 'full_name'), nullif(btrim(p_child ->> 'preferred_name'), ''), (p_child ->> 'date_of_birth')::date,
         pr.class_id, pr.id
  from public.programmes pr where pr.id = (p_child ->> 'programme_id')::uuid
  returning id into kid;
  if kid is null then
    raise exception 'programme_required: Choose the class and programme.' using errcode = 'P0001';
  end if;
  for p in select value from jsonb_array_elements(p_people) loop
    pid := app.person_for_record(p);
    insert into public.guardianships (child_id, guardian_id, relation, kind)
    values (kid, pid, btrim(p ->> 'relation'), coalesce((p ->> 'kind')::public.guardian_kind, 'parent'));
  end loop;
  return kid;
end $$;

create function public.admin_add_guardian(p_child uuid, p_person jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare pid uuid;
begin
  pid := app.person_for_record(p_person);
  insert into public.guardianships (child_id, guardian_id, relation, kind)
  values (p_child, pid, btrim(p_person ->> 'relation'), coalesce((p_person ->> 'kind')::public.guardian_kind, 'parent'));
  return pid;
end $$;

-- The last parent or relative can't be removed: the gate would have nobody to hand the child to.
create function app.keep_one_guardian() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.children c where c.id = old.child_id and c.active)
     and not exists (select 1 from public.guardianships g where g.child_id = old.child_id and g.guardian_id <> old.guardian_id) then
    raise exception 'last_guardian: The last parent or relative can''t be removed. Add another first.' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger keep_one_guardian before delete on public.guardianships for each row execute function app.keep_one_guardian();

-- A child has left: off every list today. Records stay; parents with no other child here lose app access.
create function public.admin_child_left(p_child uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.children set active = false where id = p_child and active;
  if not found then
    raise exception 'This child isn''t on the list any more.' using errcode = 'P0001';
  end if;
  update public.profiles p set app_access = false
  where p.app_access
    and p.id in (select guardian_id from public.guardianships where child_id = p_child)
    and not exists (select 1 from public.guardianships g join public.children c on c.id = g.child_id
                    where g.guardian_id = p.id and c.active)
    and not exists (select 1 from public.staff_roles r where r.profile_id = p.id);
end $$;

revoke all on function app.person_for_record(jsonb) from public, anon, authenticated;
grant execute on function app.person_for_record(jsonb) to authenticated;
revoke all on function public.admin_save_child(jsonb, jsonb), public.admin_add_guardian(uuid, jsonb), public.admin_child_left(uuid) from public, anon;
grant execute on function public.admin_save_child(jsonb, jsonb), public.admin_add_guardian(uuid, jsonb), public.admin_child_left(uuid) to authenticated;
