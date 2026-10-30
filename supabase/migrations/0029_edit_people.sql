-- 0029: the admin edits anyone's details after they're added (owner, 2026-09-26): name, email, mobile, lives outside
-- India, app access and, on a child's record, how they're related. Someone who has already signed in keeps their
-- account: a new email moves their sign-in to it, so the next code goes to the new address.

-- p_person: {"full_name", "email", "phone" (+country code), "abroad", "app_access", "relation", "kind"}.
-- p_child: the child's record the relation belongs to, or null for someone edited from the staff list.
create function public.admin_update_person(p_profile uuid, p_child uuid, p_person jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  nm text := btrim(regexp_replace(coalesce(p_person ->> 'full_name', ''), '\s+', ' ', 'g'));
  em text := nullif(lower(btrim(coalesce(p_person ->> 'email', ''))), '');
  ph text := nullif(btrim(coalesce(p_person ->> 'phone', '')), '');
  access boolean := coalesce((p_person ->> 'app_access')::boolean, true);
  rel text := btrim(coalesce(p_person ->> 'relation', ''));
  old public.profiles;
  other text;
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can change people''s details.' using errcode = '42501';
  end if;
  select * into old from public.profiles where id = p_profile for update;
  if not found then
    raise exception 'person_missing: This person is no longer registered. Refresh and try again.' using errcode = 'P0001';
  end if;
  if length(nm) not between 2 and 80 then
    raise exception 'name_required: Enter their first and last name.' using errcode = 'P0001';
  end if;
  if em is not null and em !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'bad_email: That email doesn''t look right.' using errcode = 'P0001';
  end if;
  if ph is not null and ph !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'bad_phone: Enter a mobile number with its country code.' using errcode = 'P0001';
  end if;
  if access and em is null then
    raise exception 'email_required: An email is needed for app access (the sign-in code goes there).' using errcode = 'P0001';
  end if;
  if em is null and ph is null then
    raise exception 'contact_required: Add a mobile number or an email.' using errcode = 'P0001';
  end if;
  select full_name into other from public.profiles where id <> p_profile and ((em is not null and email = em) or (ph is not null and phone = ph)) limit 1;
  if other is not null then
    raise exception 'taken: That email or mobile already belongs to %. Link them instead, or use another.', other using errcode = 'P0001';
  end if;
  -- Someone signed in: their sign-in follows the new email, so the next code goes there.
  if old.user_id is not null and em is distinct from old.email and em is not null then
    if exists (select 1 from auth.users where lower(email) = em and id <> old.user_id) then
      raise exception 'taken: Another sign-in already uses that email.' using errcode = 'P0001';
    end if;
    update auth.users set email = em where id = old.user_id;
  end if;

  update public.profiles
  set full_name = nm, email = em, phone = ph, app_access = access,
      abroad = coalesce((p_person ->> 'abroad')::boolean, abroad)
  where id = p_profile;

  if p_child is not null then
    if length(rel) not between 1 and 40 then
      raise exception 'relation_required: Choose how they''re related.' using errcode = 'P0001';
    end if;
    update public.guardianships
    set relation = rel, kind = coalesce((p_person ->> 'kind')::public.guardian_kind, kind)
    where child_id = p_child and guardian_id = p_profile;
    if not found then
      raise exception 'not_listed: They''re no longer on this child''s record. Refresh and try again.' using errcode = 'P0001';
    end if;
  end if;
end $$;

revoke all on function public.admin_update_person(uuid, uuid, jsonb) from public, anon;
grant execute on function public.admin_update_person(uuid, uuid, jsonb) to authenticated;
