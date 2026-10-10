-- 0049: a mobile number can be given again once its person is removed, and one person can hold several roles.
-- Someone turned off keeps their records (trips, attendance, the audit log) but not their number: the moment the admin
-- adds or edits a person with it, it moves to them, and the old sign-in loses it. A parent re-added by typing their
-- mobile is linked to the same person, with app access back on.

-- 1. A removed person may have no contact left; everyone still at the school needs one (0001 asked it of everyone).
alter table public.profiles drop constraint profiles_check;
alter table public.profiles add constraint profiles_contact_when_active check (not active or email is not null or phone is not null);

-- 2. The number moves from someone turned off to the person now given it. Runs before the unique check.
create function app.release_inactive_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is not null then
    update public.profiles set phone = null, app_access = false
    where not active and id <> new.id and phone = new.phone;
  end if;
  return new;
end $$;
revoke execute on function app.release_inactive_contact() from public, anon, authenticated;
create trigger release_inactive_contact_insert before insert on public.profiles
  for each row execute function app.release_inactive_contact();
create trigger release_inactive_contact_update before update of phone on public.profiles
  for each row when (new.phone is distinct from old.phone) execute function app.release_inactive_contact();

-- 3. One person on a child's record (0039). Linking someone already here with "app_access": true (the admin typed
-- their mobile again, say after their child left) turns their app access back on.
create or replace function app.person_for_record(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  pid uuid := nullif(p ->> 'id', '')::uuid;
  raw text := nullif(btrim(coalesce(p ->> 'phone', '')), '');
  ph text := app.e164(p ->> 'phone');
  access boolean := coalesce((p ->> 'app_access')::boolean, true);
begin
  if pid is not null then
    if not exists (select 1 from public.profiles where id = pid and active) then
      raise exception 'person_missing: Someone you linked is no longer registered. Refresh and try again.' using errcode = 'P0001';
    end if;
    if (p ->> 'app_access')::boolean then
      update public.profiles set app_access = true where id = pid and not app_access and phone is not null;
    end if;
    return pid;
  end if;
  if length(btrim(coalesce(p ->> 'full_name', ''))) < 2 then
    raise exception 'name_required: Enter each person''s first and last name.' using errcode = 'P0001';
  end if;
  if raw is not null and ph is null then
    raise exception 'bad_phone: Enter a mobile number with its country code.' using errcode = 'P0001';
  end if;
  if access and ph is null then
    raise exception 'phone_required: A mobile number is needed for app access (the code goes to WhatsApp on it).' using errcode = 'P0001';
  end if;
  insert into public.profiles (full_name, email, phone, abroad, app_access)
  values (btrim(p ->> 'full_name'), nullif(lower(btrim(p ->> 'email')), ''), ph,
          coalesce((p ->> 'abroad')::boolean, false), access)
  returning id into pid;
  return pid;
end $$;

-- 4. The admin edits anyone's details (0039): a number held only by someone turned off is free to use.
create or replace function public.admin_update_person(p_profile uuid, p_child uuid, p_person jsonb) returns void
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
  if access and ph is null then
    raise exception 'phone_required: A mobile number is needed for app access (the code goes to WhatsApp on it).' using errcode = 'P0001';
  end if;
  if em is null and ph is null then
    raise exception 'contact_required: Add a mobile number or an email.' using errcode = 'P0001';
  end if;
  select full_name into other from public.profiles
  where id <> p_profile and ((em is not null and email = em) or (ph is not null and phone = ph and active)) limit 1;
  if other is not null then
    raise exception 'taken: That email or mobile already belongs to %. Link them instead, or use another.', other using errcode = 'P0001';
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
