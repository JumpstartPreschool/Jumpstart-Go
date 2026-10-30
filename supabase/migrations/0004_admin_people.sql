-- M1: the admin adds people and children in one step each (PRO-1, PRO-2, PRO-4).
-- SECURITY INVOKER: they run as the signed-in admin, so row-level security still decides who may do this,
-- and each call is one transaction (a child is never saved without its guardians).

create function public.admin_add_person(
  p_full_name text,
  p_email text,
  p_phone text,
  p_roles public.app_role[] default '{}'
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  new_id uuid;
begin
  insert into public.profiles (full_name, email, phone)
  values (btrim(p_full_name), nullif(lower(btrim(p_email)), ''), nullif(btrim(p_phone), ''))
  returning id into new_id;
  insert into public.staff_roles (profile_id, role) select new_id, r from unnest(coalesce(p_roles, '{}')) as r;
  return new_id;
end $$;

-- p_guardians: [{"guardian_id": "...", "relation": "Mother"}, ...] — at least one.
create function public.admin_add_child(
  p_full_name text,
  p_preferred_name text,
  p_date_of_birth date,
  p_class_id uuid,
  p_programme_id uuid,
  p_guardians jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  new_id uuid;
begin
  if jsonb_typeof(p_guardians) is distinct from 'array' or jsonb_array_length(p_guardians) = 0 then
    raise exception 'A child needs at least one guardian' using errcode = 'check_violation';
  end if;
  if p_date_of_birth > current_date then
    raise exception 'The date of birth cannot be in the future' using errcode = 'check_violation';
  end if;
  insert into public.children (full_name, preferred_name, date_of_birth, class_id, programme_id)
  values (btrim(p_full_name), nullif(btrim(p_preferred_name), ''), p_date_of_birth, p_class_id, p_programme_id)
  returning id into new_id;
  insert into public.guardianships (child_id, guardian_id, relation)
  select new_id, (g ->> 'guardian_id')::uuid, btrim(g ->> 'relation') from jsonb_array_elements(p_guardians) as g;
  return new_id;
end $$;

revoke execute on function public.admin_add_person(text, text, text, public.app_role[]), public.admin_add_child(text, text, date, uuid, uuid, jsonb) from public;
grant execute on function public.admin_add_person(text, text, text, public.app_role[]), public.admin_add_child(text, text, date, uuid, uuid, jsonb) to authenticated;
