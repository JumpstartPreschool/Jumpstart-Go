-- Phone sign-in (owner, 2026-10-02). People sign in with their mobile number and a 6-digit one-time code that arrives on
-- WhatsApp. Supabase Auth still generates and checks the code; a "Send SMS" hook hands it to WhatsApp (WATI). There is no
-- email and no password in sign-in any more, and nothing here sends an email.
--
-- How it works now
--   * Invite-only stays. Only an active person with app access and a mobile number can get a code, and every public
--     answer reads the same whether or not a number is registered.
--   * public.profiles.phone holds the number in full international form with the + (+919220991947). Supabase's
--     auth.users.phone holds the same digits without the +. Any country works.
--   * Email addresses stay on the records but nothing reads them to sign anyone in.
--
-- Cutover
--   * Someone who already has an account keeps it: their profile's number is copied into their auth.users row below, so
--     a phone sign-in finds the same account (same user, same profile, same history).
--   * Staff with no mobile number on their profile cannot sign in until one is added. People already signed in stay
--     signed in; the profile check below applies to anything saved from now on.
--   * Old accounts keep their email column; it is simply never used.

-- 1. One way to read a typed number -------------------------------------------------------------------------------------
-- Strips spaces, dashes, dots and brackets; adds the + if missing; a bare 10-digit number is an Indian mobile (+91).
-- Null when the result is not a plausible international number.
create function app.e164(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when digits ~ '^\+[1-9][0-9]{7,14}$' then digits
    when digits ~ '^[6-9][0-9]{9}$' then '+91' || digits
    when digits ~ '^[1-9][0-9]{7,14}$' then '+' || digits
  end
  from (select regexp_replace(coalesce(p, ''), '[\s().-]', '', 'g') as digits) x
$$;
revoke execute on function app.e164(text) from public;
grant execute on function app.e164(text) to authenticated;

-- 2. The sign-in screen's check ------------------------------------------------------------------------------------------
-- True only for an active person with app access whose profile has this number. 10 checks an hour per number, so the
-- screen can't be used to spam someone's WhatsApp. The screen shows the same message either way.
create function public.phone_login_allowed(p_phone text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  e164 text := app.e164(p_phone);
begin
  if e164 is null then return false; end if;
  if not exists (select 1 from public.profiles where active and app_access and phone = e164) then return false; end if;
  perform app.throttle('login:' || e164, 10, interval '1 hour');
  return true;
end $$;
revoke execute on function public.phone_login_allowed(text) from public;
grant execute on function public.phone_login_allowed(text) to anon, authenticated;

-- 3. Passwords and email codes are gone ----------------------------------------------------------------------------------
-- whoami first, so nothing is left reading has_password.
create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile_id', p.id,
    'full_name', p.full_name,
    'phone', p.phone,
    'active', p.active and p.app_access,
    'consent_version', p.consent_version,
    'roles', coalesce((select jsonb_agg(r.role order by r.role) from public.staff_roles r where r.profile_id = p.id), '[]'::jsonb),
    'children', (select count(*) from public.guardianships g join public.children c on c.id = g.child_id
                 where g.guardian_id = p.id and c.active)
  )
  from public.profiles p where p.user_id = auth.uid()
$$;

drop function public.login_allowed(text, text);
drop function public.login_allowed(text);
drop function app.has_password();

-- 4. Accounts are created by phone only ----------------------------------------------------------------------------------
-- Supabase stores phones without the leading +.
create or replace function app.guard_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is null or app.invited_profile(new.phone) is null then
    raise exception 'not_invited: this mobile number is not registered with Jumpstart';
  end if;
  return new;
end $$;

create or replace function app.link_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set user_id = new.id where id = app.invited_profile(new.phone);
  return null;
end $$;

drop function app.invited_profile(text, text);
create function app.invited_profile(p_phone text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles
  where active and app_access and user_id is null and phone = '+' || ltrim(p_phone, '+')
  limit 1
$$;
revoke execute on function app.invited_profile(text) from public;

-- Existing accounts: the profile's number becomes the sign-in number. A number another account already holds is
-- skipped (that person is fixed by hand); the profile keeps it either way.
update auth.users u
set phone = ltrim(p.phone, '+'), phone_confirmed_at = coalesce(u.phone_confirmed_at, now())
from public.profiles p
where p.user_id = u.id and p.phone is not null
  and not exists (select 1 from auth.users o where o.phone = ltrim(p.phone, '+') and o.id <> u.id);

-- When the school changes a signed-in person's number, their sign-in number follows, so the next code goes to the new
-- one. Refused if another account already signs in with it.
create function app.sync_auth_phone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is null then return new; end if;
  if new.phone is not null and exists (select 1 from auth.users where phone = ltrim(new.phone, '+') and id <> new.user_id) then
    raise exception 'taken: Another sign-in already uses that mobile number.' using errcode = 'P0001';
  end if;
  update auth.users
  set phone = ltrim(new.phone, '+'),
      phone_confirmed_at = case when new.phone is null then null else coalesce(phone_confirmed_at, now()) end
  where id = new.user_id;
  return new;
end $$;
revoke execute on function app.sync_auth_phone() from public;
create trigger sync_auth_phone after update of phone on public.profiles
  for each row when (old.phone is distinct from new.phone) execute function app.sync_auth_phone();

-- 5. Who the code may go to ----------------------------------------------------------------------------------------------
-- Called by the Send SMS hook (service role only) to decide whether to spend a WhatsApp message. Takes the number with
-- or without the +. Null for anyone not allowed to sign in.
create function public.otp_recipient(p_phone text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles
  where active and app_access and phone = '+' || ltrim(coalesce(p_phone, ''), '+')
  limit 1
$$;
revoke execute on function public.otp_recipient(text) from public, anon, authenticated;
grant execute on function public.otp_recipient(text) to service_role;

-- 6. App access needs a mobile -------------------------------------------------------------------------------------------
alter table public.profiles add constraint profiles_app_access_needs_phone check (phone is not null or not app_access) not valid;

-- One person on a child's record (0012), now needing a mobile for app access.
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

-- Staff and other people added from the staff list: a valid mobile is required (the code goes to WhatsApp on it).
create or replace function public.admin_add_person(
  p_full_name text,
  p_email text,
  p_phone text,
  p_roles public.app_role[] default '{}'
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  new_id uuid;
  ph text := app.e164(p_phone);
begin
  if nullif(btrim(coalesce(p_phone, '')), '') is null then
    raise exception 'phone_required: A mobile number is needed for app access (the code goes to WhatsApp on it).' using errcode = 'P0001';
  end if;
  if ph is null then
    raise exception 'bad_phone: Enter a mobile number with its country code.' using errcode = 'P0001';
  end if;
  insert into public.profiles (full_name, email, phone)
  values (btrim(p_full_name), nullif(lower(btrim(p_email)), ''), ph)
  returning id into new_id;
  insert into public.staff_roles (profile_id, role) select new_id, r from unnest(coalesce(p_roles, '{}')) as r;
  return new_id;
end $$;

-- The admin edits anyone's details (0029). App access now needs a mobile; the sign-in number follows a changed mobile
-- through the sync_auth_phone trigger above.
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
  select full_name into other from public.profiles where id <> p_profile and ((em is not null and email = em) or (ph is not null and phone = ph)) limit 1;
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

-- A parent adds a relative (0028). The relative signs in with their mobile, so they get app access straight away.
-- p_person: {"full_name", "relation", "phone" (+country code), "email" (optional, kept on the record only)}.
create or replace function public.parent_add_relative(p_child uuid, p_person jsonb) returns uuid
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
  values (nm, em, ph, false, true)
  returning id into pid;
  insert into public.guardianships (child_id, guardian_id, relation, kind) values (p_child, pid, rel, 'family');
  return pid;
end $$;

-- Bulk import (0028). Each person is matched to someone already on the records by mobile number alone, so brothers and
-- sisters share their parents. A new person without a mobile is saved without app access (nothing to send a code to).
create or replace function public.import_child(p_child jsonb, p_people jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  name text := btrim(coalesce(p_child ->> 'full_name', ''));
  dob date;
  resolved jsonb := '[]'::jsonb;
  p jsonb;
  ph text;
  found_id uuid;
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
    ph := app.e164(p ->> 'phone');
    if nullif(btrim(coalesce(p ->> 'phone', '')), '') is not null and ph is null then
      raise exception 'bad_phone: %''s mobile number isn''t valid. Use the country code, like +91.', btrim(p ->> 'full_name') using errcode = 'P0001';
    end if;
    select id into found_id from public.profiles where active and phone = ph;
    -- Someone already here keeps their own details; only this child's relation to them is new.
    resolved := resolved || case when found_id is not null
      then jsonb_build_object('id', found_id, 'relation', p ->> 'relation', 'kind', p ->> 'kind')
      else p || jsonb_build_object('phone', ph, 'app_access', ph is not null and coalesce((p ->> 'app_access')::boolean, true)) end;
  end loop;

  return public.admin_save_child(p_child, resolved);
end $$;

-- 7. Invitations ---------------------------------------------------------------------------------------------------------
-- Who to invite and what to say. Admin only; the person needs app access, a mobile and no sign-in yet.
create or replace function public.invite_details(p_profile uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  url text;
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can send invitations.' using errcode = '42501';
  end if;
  select * into p from public.profiles where id = p_profile;
  if not found or not p.active then
    raise exception 'gone: This person is no longer on the list.' using errcode = 'P0001';
  end if;
  if not p.app_access then
    raise exception 'no_access: Turn on app access for % first.', p.full_name using errcode = 'P0001';
  end if;
  if p.user_id is not null then
    raise exception 'signed_in: % has already signed in.', p.full_name using errcode = 'P0001';
  end if;
  if p.phone is null then
    raise exception 'phone_required: Add a mobile number first.' using errcode = 'P0001';
  end if;
  select app_url into url from public.settings;
  if url is null then
    raise exception 'no_app_url: Add the app''s web address in Settings first.' using errcode = 'P0001';
  end if;
  perform app.throttle('invite:' || p.id, 10, interval '1 hour');
  return jsonb_build_object(
    'full_name', p.full_name, 'phone', p.phone, 'app_url', url,
    'staff', exists (select 1 from public.staff_roles r where r.profile_id = p.id),
    'children', coalesce((select jsonb_agg(coalesce(c.preferred_name, split_part(c.full_name, ' ', 1)) order by c.full_name)
      from public.guardianships g join public.children c on c.id = g.child_id and c.active where g.guardian_id = p.id), '[]'::jsonb)
  );
end $$;

-- Records an invitation once it's sent on WhatsApp or handed to the admin's own phone as a text.
create or replace function public.mark_invited(p_profile uuid, p_via text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can send invitations.' using errcode = '42501';
  end if;
  if p_via is null or p_via not in ('whatsapp', 'sms') then
    raise exception 'bad_channel: Invite by WhatsApp or text message.' using errcode = 'P0001';
  end if;
  update public.profiles set invited_at = app.clock(), invited_via = p_via where id = p_profile and active and user_id is null;
end $$;

-- 8. WhatsApp delivery log -----------------------------------------------------------------------------------------------
-- One row per message handed to WATI, so the admin can see whether codes and invitations arrive. A code is never stored.
-- Only the edge functions (service role) write here; the admin reads a summary through whatsapp_recent().
create table app.whatsapp_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  phone text not null,
  kind text check (kind in ('signin_code', 'invitation', 'staff_invitation')),
  template text not null,
  local_message_id text unique not null,
  broadcast_id text,
  status text not null default 'accepted' check (status in ('accepted', 'failed_to_send', 'sent', 'delivered', 'read', 'failed')),
  error_category text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz
);
create index on app.whatsapp_log (created_at);
revoke all on app.whatsapp_log from public, anon, authenticated;

-- Adds a row. The same local id twice (a retried send) is kept once.
create function public.whatsapp_log_add(p_profile uuid, p_phone text, p_kind text, p_template text, p_local_id text,
                                        p_broadcast_id text, p_status text, p_error text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into app.whatsapp_log (profile_id, phone, kind, template, local_message_id, broadcast_id, status, error_category, failed_at)
  values (p_profile, p_phone, p_kind, p_template, p_local_id, p_broadcast_id, coalesce(p_status, 'accepted'), p_error,
          case when p_status in ('failed_to_send', 'failed') then now() end)
  on conflict (local_message_id) do nothing;
end $$;

-- Moves a message along: accepted, sent, delivered, read. It never goes backwards, and repeating a status changes nothing.
-- "failed" is always recorded. False when the id is unknown.
create function public.whatsapp_log_status(p_local_id text, p_status text, p_error text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  cur text;
  rank_new int := case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 end;
  rank_cur int;
begin
  if p_status <> 'failed' and rank_new is null then
    raise exception 'bad_status: Use sent, delivered, read or failed.' using errcode = 'P0001';
  end if;
  select status into cur from app.whatsapp_log where local_message_id = p_local_id for update;
  if not found then return false; end if;
  if p_status = 'failed' then
    update app.whatsapp_log
    set status = 'failed', failed_at = coalesce(failed_at, now()), error_category = coalesce(p_error, error_category)
    where local_message_id = p_local_id;
    return true;
  end if;
  rank_cur := case cur when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'accepted' then 0 end;
  if rank_cur is null or rank_new <= rank_cur then return true; end if; -- failed rows and repeats stay as they are
  update app.whatsapp_log
  set status = p_status,
      sent_at = coalesce(sent_at, now()),
      delivered_at = case when rank_new >= 2 then coalesce(delivered_at, now()) else delivered_at end,
      read_at = case when rank_new >= 3 then coalesce(read_at, now()) else read_at end
  where local_message_id = p_local_id;
  return true;
end $$;

-- The admin's health check, last 7 days: handed on, reached the phone, failed.
create function public.whatsapp_recent() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  last_fail record;
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can see this.' using errcode = '42501';
  end if;
  select coalesce(failed_at, created_at) as at, kind into last_fail
  from app.whatsapp_log where status in ('failed', 'failed_to_send') order by coalesce(failed_at, created_at) desc limit 1;
  return jsonb_build_object(
    'sent_7d', (select count(*) from app.whatsapp_log where created_at > now() - interval '7 days' and status in ('sent', 'delivered', 'read')),
    'delivered_7d', (select count(*) from app.whatsapp_log where created_at > now() - interval '7 days' and status in ('delivered', 'read')),
    'failed_7d', (select count(*) from app.whatsapp_log where created_at > now() - interval '7 days' and status in ('failed', 'failed_to_send')),
    'last_failure_at', last_fail.at,
    'last_failure_kind', last_fail.kind
  );
end $$;

revoke execute on function public.whatsapp_log_add(uuid, text, text, text, text, text, text, text),
  public.whatsapp_log_status(text, text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_log_add(uuid, text, text, text, text, text, text, text),
  public.whatsapp_log_status(text, text, text) to service_role;
revoke execute on function public.whatsapp_recent() from public, anon;
grant execute on function public.whatsapp_recent() to authenticated;

-- Rows are kept 90 days, then removed by a daily job where pg_cron is available.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-whatsapp-log', '45 3 * * *', $job$delete from app.whatsapp_log where created_at < now() - interval '90 days'$job$);
  end if;
end $$;
