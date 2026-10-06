-- 0052: acknowledging after "I've arrived" stops the arrival announcements. The gate announces an arrival that came
-- after the last acknowledgement (gate.ts shouldAnnounce), but Acknowledge and Ready only set the time when it was
-- empty, so after an arrival neither could stop "has arrived" repeating every 2 minutes until the handover.

-- The parent tapped I've arrived after the gate last acknowledged the trip.
create function app.arrived_since_seen(t public.trips) returns boolean
language sql immutable set search_path = '' as $$
  select t.arrived_at is not null and t.acknowledged_at is not null and t.arrived_at > t.acknowledged_at
$$;

-- The gate's steps (0038), with acknowledge and ready taking in an arrival since the last acknowledgement.
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
      update public.trips set acknowledged_by = case when app.arrived_since_seen(t) then me else coalesce(acknowledged_by, me) end,
          acknowledged_at = case when app.arrived_since_seen(t) then now() else coalesce(acknowledged_at, now()) end, updated_at = now()
        where id = p_trip returning * into t;
    when 'ready' then
      if t.direction <> 'pickup' then
        raise exception 'Only a pickup can be marked ready.' using errcode = 'P0001';
      end if;
      update public.trips set ready_by = coalesce(ready_by, me), ready_at = coalesce(ready_at, now()),
          acknowledged_by = case when app.arrived_since_seen(t) then me else coalesce(acknowledged_by, me) end,
          acknowledged_at = case when app.arrived_since_seen(t) then now() else coalesce(acknowledged_at, now()) end, updated_at = now()
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
