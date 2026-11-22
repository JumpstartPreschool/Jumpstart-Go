-- Bulk upload of children with their families (owner, 2026-09-25, PRD D37): the admin and the core team import a
-- spreadsheet, one child per row, each row saved on its own so good rows go in and the rest are listed to fix. The core
-- team may add children this way but not remove them; everything else about people stays with the admin.

-- One child and their family. p_people as for admin_save_child, but each person is matched to someone already on the
-- school's records by email or mobile first, so brothers and sisters share their parents instead of duplicating them.
create function public.import_child(p_child jsonb, p_people jsonb) returns uuid
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
    raise exception 'Only the admin or the core team can import children.' using errcode = '42501';
  end if;
  if length(name) < 2 then
    raise exception 'name_required: Enter the child''s first and last name.' using errcode = 'P0001';
  end if;
  begin
    dob := (p_child ->> 'date_of_birth')::date;
  exception when others then
    raise exception 'bad_date: The date of birth isn''t a date.' using errcode = 'P0001';
  end;
  if exists (select 1 from public.children where active and lower(full_name) = lower(name) and date_of_birth = dob) then
    raise exception 'duplicate: % (born %) is already registered.', name, to_char(dob, 'DD Mon YYYY') using errcode = 'P0001';
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
    -- Someone already here keeps their own details; only this child's relation to them is new.
    resolved := resolved || case when coalesce(by_email, by_phone) is not null
      then jsonb_build_object('id', coalesce(by_email, by_phone), 'relation', p ->> 'relation', 'kind', p ->> 'kind')
      else p end;
  end loop;

  -- The same checks and saving as adding one child (0012), run as the owner so the core team can use it.
  return public.admin_save_child(p_child, resolved);
end $$;

revoke all on function public.import_child(jsonb, jsonb) from public, anon;
grant execute on function public.import_child(jsonb, jsonb) to authenticated;
