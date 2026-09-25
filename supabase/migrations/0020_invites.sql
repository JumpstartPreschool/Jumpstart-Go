-- The admin invites people they added (PRD D36): an email from the invite-send function (Brevo), or a text or WhatsApp
-- message the admin sends from their own phone. Inviting never creates a sign-in account: the first email code still does
-- (0002), so sign-in works the same whether or not someone was invited.

-- 1. Where the app lives, for the link in an invitation. Set in Admin → Settings; https only.
alter table public.settings add column app_url text check (app_url is null or app_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^\s]*)?$');

-- 2. When and how someone was last invited, shown next to their access.
alter table public.profiles add column invited_at timestamptz;
alter table public.profiles add column invited_via text check (invited_via in ('email', 'sms', 'whatsapp'));

-- Who to invite and what to say. Admin only; the person must have app access and not have signed in yet.
-- 10 invitations an hour per person (a mis-tap can't flood someone's inbox).
create function public.invite_details(p_profile uuid) returns jsonb
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
  select app_url into url from public.settings;
  if url is null then
    raise exception 'no_app_url: Add the app''s web address in Settings first.' using errcode = 'P0001';
  end if;
  perform app.throttle('invite:' || p.id, 10, interval '1 hour');
  return jsonb_build_object(
    'full_name', p.full_name, 'email', p.email, 'phone', p.phone, 'app_url', url,
    'staff', exists (select 1 from public.staff_roles r where r.profile_id = p.id),
    'children', coalesce((select jsonb_agg(coalesce(c.preferred_name, split_part(c.full_name, ' ', 1)) order by c.full_name)
      from public.guardianships g join public.children c on c.id = g.child_id and c.active where g.guardian_id = p.id), '[]'::jsonb)
  );
end $$;

-- Records an invitation once it's sent (email) or handed to the admin's phone (text, WhatsApp).
create function public.mark_invited(p_profile uuid, p_via text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can send invitations.' using errcode = '42501';
  end if;
  if p_via not in ('email', 'sms', 'whatsapp') then
    raise exception 'bad_channel: Invite by email, text message or WhatsApp.' using errcode = 'P0001';
  end if;
  update public.profiles set invited_at = app.clock(), invited_via = p_via where id = p_profile and active and user_id is null;
end $$;

revoke all on function public.invite_details(uuid), public.mark_invited(uuid, text) from public, anon;
grant execute on function public.invite_details(uuid), public.mark_invited(uuid, text) to authenticated;
