-- Boy or girl, optional (owner, 2026-09-25, PRD D39): picks the child's 3D picture in the app instead of an initial.
-- Adults' pictures come from their relation (Mother, Grandfather…), so nothing new is stored for them.
alter table public.children add column gender text check (gender in ('boy', 'girl'));

-- Adding a child (one at a time, or from bulk upload through import_child) saves it too. Otherwise as in 0012.
create or replace function public.admin_save_child(p_child jsonb, p_people jsonb) returns uuid
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
  insert into public.children (full_name, preferred_name, date_of_birth, class_id, programme_id, gender)
  select btrim(p_child ->> 'full_name'), nullif(btrim(p_child ->> 'preferred_name'), ''), (p_child ->> 'date_of_birth')::date,
         pr.class_id, pr.id, nullif(p_child ->> 'gender', '')
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

