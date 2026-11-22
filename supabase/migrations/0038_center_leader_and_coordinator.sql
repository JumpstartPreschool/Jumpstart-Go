-- 0038: Center Leader and Center Coordinator, two gate roles (owner, 2026-10-02).
--
--   Center Leader ('leader', new in 0037): hears the gate, sees the queue, acknowledges and marks a child Ready.
--   Center Coordinator ('coordinator', the existing gate role): all of that, plus the physical gate transaction:
--     check in, hand over to a registered parent or family member, the one-time collector's code, walk-ins.
--
-- Migration of existing people: the 'coordinator' value is kept, not renamed, and now means Center Coordinator. Everyone
-- who runs the gate today keeps every permission they have, so nobody is locked out mid-shift; Center Leader is a new,
-- narrower role the admin or head office gives from now on. Rows, policies, sign-ins and the audit history stay valid.
--
-- Gate actions now come only from a gate role. Admin alone no longer acts at the gate; on 2026-10-02 every admin also
-- holds Center Coordinator, so nobody loses anything. Enforced here, in the database: the app only hides buttons.

-- 1. Who counts as staff (reads the children, trips and classes the gate needs). Front desk keeps its own checks.
create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_role('admin', 'core', 'coordinator', 'leader')
$$;

-- Either gate role: hears announcements, sees the queue, acknowledges, marks Ready.
create function app.is_gate() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_role('coordinator', 'leader')
$$;

-- 2. Who hears a child's requests (push; the gate tablets follow the same rule in duty/gate.ts):
--    - everyone with a gate role assigned to the child's class;
--    - every Center Coordinator, when no coordinator is assigned to it (someone must be able to hand over);
--    - everyone with a gate role, when nobody is assigned to it at all.
create or replace function app.coordinators_for(p_child uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  with cls as (select class_id from public.children where id = p_child),
  covering as (
    select cc.profile_id, r.role from public.coordinator_classes cc join public.staff_roles r on r.profile_id = cc.profile_id, cls
    where cc.class_id = cls.class_id and r.role in ('coordinator', 'leader'))
  select coalesce(array_agg(distinct r.profile_id), '{}') from public.staff_roles r
  where r.role in ('coordinator', 'leader') and (
    r.profile_id in (select profile_id from covering)
    or not exists (select 1 from covering)
    or (r.role = 'coordinator' and not exists (select 1 from covering where role = 'coordinator')))
$$;

-- 3. Class assignments belong to either gate role, and go only when the person holds neither any more.
create or replace function app.check_coordinator_class() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.staff_roles where profile_id = new.profile_id and role in ('coordinator', 'leader')) then
    raise exception 'not_a_coordinator: give this person the Center Leader or Center Coordinator role first' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function app.drop_coordinator_classes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.staff_roles where profile_id = old.profile_id and role in ('coordinator', 'leader')) then
    delete from public.coordinator_classes where profile_id = old.profile_id;
  end if;
  return old;
end $$;

drop trigger drop_coordinator_classes on public.staff_roles;
create trigger drop_coordinator_classes after delete on public.staff_roles for each row
  when (old.role in ('coordinator', 'leader')) execute function app.drop_coordinator_classes();

-- 4. The head office gives or removes either gate role (never Admin or Head office: those stay with the admin).
drop policy core_give_coordinator on public.staff_roles;
create policy core_give_coordinator on public.staff_roles for insert
  with check (app.has_role('core') and role in ('coordinator', 'leader'));
drop policy core_remove_coordinator on public.staff_roles;
create policy core_remove_coordinator on public.staff_roles for delete
  using (app.has_role('core') and role in ('coordinator', 'leader'));

-- Gives a gate role (Center Coordinator unless told otherwise) and sets exactly these classes. Runs as the caller, so the
-- policies above decide who may: the admin, or the head office for the two gate roles only.
drop function public.set_coordinator(uuid, uuid[]);
create function public.set_coordinator(p_profile uuid, p_classes uuid[], p_role public.app_role default 'coordinator')
returns void language plpgsql set search_path = '' as $$
begin
  if p_role not in ('coordinator', 'leader') then
    raise exception 'bad_role: Choose Center Leader or Center Coordinator.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile and active) then
    raise exception 'That person''s access is turned off, or they are no longer registered.' using errcode = 'P0001';
  end if;
  insert into public.staff_roles (profile_id, role) values (p_profile, p_role) on conflict do nothing;
  delete from public.coordinator_classes where profile_id = p_profile and class_id <> all (coalesce(p_classes, '{}'));
  insert into public.coordinator_classes (profile_id, class_id)
    select p_profile, c from unnest(coalesce(p_classes, '{}')) as c
    on conflict do nothing;
end $$;
revoke all on function public.set_coordinator(uuid, uuid[], public.app_role) from public;
grant execute on function public.set_coordinator(uuid, uuid[], public.app_role) to authenticated;

-- 5. The gate's steps. Acknowledge and Ready: either gate role. Check in and hand over: Center Coordinator only.
-- One row lock per call, so two tablets pressing at once can't close a trip twice; a finished trip can't change.
create or replace function public.gate_step(p_trip uuid, p_step text, p_handed_to uuid default null)
returns public.trips language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.me();
  t public.trips;
begin
  if me is null or not app.is_gate() then
    raise exception 'Only center leaders and center coordinators can do this at the gate.' using errcode = '42501';
  end if;
  if p_step = 'close' and not app.has_role('coordinator') then
    raise exception 'Only a center coordinator can check a child in or hand them over.' using errcode = '42501';
  end if;
  select * into t from public.trips where id = p_trip for update;
  if not found then
    raise exception 'This trip no longer exists.' using errcode = 'P0001';
  end if;
  if t.status <> 'en_route' then
    raise exception 'This trip is already finished.' using errcode = 'P0001';
  end if;

  case p_step
    when 'acknowledge' then
      update public.trips set acknowledged_by = coalesce(acknowledged_by, me), acknowledged_at = coalesce(acknowledged_at, now()), updated_at = now()
        where id = p_trip returning * into t;
    when 'ready' then
      if t.direction <> 'pickup' then
        raise exception 'Only a pickup can be marked ready.' using errcode = 'P0001';
      end if;
      update public.trips set ready_by = coalesce(ready_by, me), ready_at = coalesce(ready_at, now()),
          acknowledged_by = coalesce(acknowledged_by, me), acknowledged_at = coalesce(acknowledged_at, now()), updated_at = now()
        where id = p_trip returning * into t;
    when 'close' then
      if t.direction = 'pickup' then
        -- Someone a parent sent with a one-time link is handed over only with their code (gate_handover_code).
        if t.traveller_kind = 'third_person' then
          raise exception 'code_required: This pickup needs the 4-digit code from the person collecting.' using errcode = 'P0001';
        end if;
        if p_handed_to is null or not exists (
          select 1 from public.guardianships g join public.profiles p on p.id = g.guardian_id
          where g.child_id = t.child_id and g.guardian_id = p_handed_to and p.active) then
          raise exception 'Choose one of the child''s registered guardians.' using errcode = 'P0001';
        end if;
        update public.trips set status = 'handed_over', handed_to = p_handed_to, closed_by = me, closed_at = now(), updated_at = now(),
            acknowledged_by = coalesce(acknowledged_by, me), acknowledged_at = coalesce(acknowledged_at, now())
          where id = p_trip returning * into t;
        insert into public.attendance (child_id, day, status, checked_out_at) values (t.child_id, t.day, 'present', now())
          on conflict (child_id, day) do update set status = 'present', checked_out_at = now();
      else
        update public.trips set status = 'checked_in', closed_by = me, closed_at = now(), updated_at = now(),
            acknowledged_by = coalesce(acknowledged_by, me), acknowledged_at = coalesce(acknowledged_at, now())
          where id = p_trip returning * into t;
        insert into public.attendance (child_id, day, status, checked_in_at) values (t.child_id, t.day, 'present', now())
          on conflict (child_id, day) do update set status = 'present', checked_in_at = coalesce(public.attendance.checked_in_at, now());
      end if;
    else
      raise exception 'Unknown step.' using errcode = 'P0001';
  end case;
  return t;
end $$;

-- The one-time collector's code: Center Coordinator only. A Center Leader can't try codes, so can't use up the three tries.
create or replace function public.gate_handover_code(p_trip uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.me();
  t public.trips;
  l app.trip_links;
begin
  if me is null or not app.has_role('coordinator') then
    raise exception 'Only a center coordinator can check the code and hand over.' using errcode = '42501';
  end if;
  select * into t from public.trips where id = p_trip for update;
  if not found or t.status <> 'en_route' or t.direction <> 'pickup' or t.traveller_kind <> 'third_person' then
    raise exception 'This pickup isn''t waiting for a code.' using errcode = 'P0001';
  end if;
  select * into l from app.trip_links where trip_id = p_trip for update;
  if not found then
    raise exception 'There is no code for this pickup. Ask the parent to send the link again.' using errcode = 'P0001';
  end if;
  if l.locked_at is not null then
    return jsonb_build_object('ok', false, 'locked', true, 'tries_left', 0);
  end if;
  if p_code is null or p_code <> l.code then
    -- Not raised, so the wrong try is counted even though nothing else changes.
    update app.trip_links set attempts = least(3, attempts + 1), locked_at = case when attempts + 1 >= 3 then now() end
      where trip_id = p_trip returning * into l;
    return jsonb_build_object('ok', false, 'locked', l.locked_at is not null, 'tries_left', 3 - l.attempts);
  end if;
  update public.trips set status = 'handed_over', handed_to_name = t.traveller_name, closed_by = me, closed_at = app.clock(), updated_at = app.clock(),
      acknowledged_by = coalesce(acknowledged_by, me), acknowledged_at = coalesce(acknowledged_at, app.clock())
    where id = p_trip returning * into t;
  insert into public.attendance (child_id, day, status, checked_out_at) values (t.child_id, t.day, 'present', app.clock())
    on conflict (child_id, day) do update set status = 'present', checked_out_at = app.clock();
  return jsonb_build_object('ok', true, 'trip', to_jsonb(t));
end $$;

-- Walk-ins (check in, or hand over to registered family, without "I'm on my way"): Center Coordinator only.
create or replace function public.gate_walk_in(p_child uuid, p_direction public.trip_direction, p_handed_to uuid default null)
returns public.trips language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.me();
  d date := app.today();
  c record;
  g_name text;
  g_relation text;
  t public.trips;
begin
  if me is null or not app.has_role('coordinator') then
    raise exception 'Only a center coordinator can check a child in or hand them over.' using errcode = '42501';
  end if;
  select ch.active, ch.programme_id into c from public.children ch where ch.id = p_child;
  if not found or not c.active then
    raise exception 'This child is not registered with the school.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.attendance a where a.child_id = p_child and a.day = d and a.status <> 'present') then
    raise exception 'not_coming: This child is marked as not coming today. Check with the head office first.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.trips x where x.child_id = p_child and x.day = d and x.direction = p_direction and x.status in ('handed_over', 'checked_in')) then
    raise exception 'already_done: %', case p_direction when 'pickup' then 'This child has already been collected today.' else 'This child is already checked in.' end using errcode = 'P0001';
  end if;
  if exists (select 1 from public.trips x where x.child_id = p_child and x.day = d and x.direction = p_direction and x.status = 'en_route') then
    raise exception 'on_the_way: Someone already said they''re on the way. Use that request in the queue.' using errcode = 'P0001';
  end if;
  if p_direction = 'pickup' then
    select p.full_name, gs.relation into g_name, g_relation from public.guardianships gs join public.profiles p on p.id = gs.guardian_id and p.active
      where gs.child_id = p_child and gs.guardian_id = p_handed_to;
    if not found then
      raise exception 'guardian_required: Choose one of the child''s registered parents or family. Anyone else needs a link and a code from a parent.' using errcode = 'P0001';
    end if;
  end if;
  insert into public.trips (child_id, direction, day, status, arrive_at, created_by, traveller_name, traveller_relation,
                            acknowledged_by, acknowledged_at, closed_by, closed_at, handed_to)
  values (p_child, p_direction, d, case p_direction when 'pickup' then 'handed_over'::public.trip_status else 'checked_in'::public.trip_status end,
          app.clock(), coalesce(p_handed_to, me), coalesce(g_name, 'At the gate'), g_relation,
          me, app.clock(), me, app.clock(), p_handed_to)
  returning * into t;
  insert into public.attendance (child_id, day, status, checked_in_at, checked_out_at)
  values (p_child, d, 'present', case when p_direction = 'dropoff' then app.clock() end, case when p_direction = 'pickup' then app.clock() end)
  on conflict (child_id, day) do update set status = 'present',
    checked_in_at = coalesce(public.attendance.checked_in_at, excluded.checked_in_at),
    checked_out_at = coalesce(excluded.checked_out_at, public.attendance.checked_out_at);
  return t;
end $$;

revoke all on function app.is_gate() from public;
