-- At the gate without "I'm on my way" (Screen Book v3: "If a guardian arrives anyway, hand over from the list"): a
-- coordinator checks a child in, or hands them to one of their registered parents or family (D4), in one step. It is
-- recorded as a trip like any other, so the parent's screen, the board and the audit log all show it.

create function public.gate_walk_in(p_child uuid, p_direction public.trip_direction, p_handed_to uuid default null) returns public.trips
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.me();
  d date := app.today();
  c record;
  g_name text;
  g_relation text;
  t public.trips;
begin
  if me is null or not app.has_role('admin', 'coordinator') then
    raise exception 'Only coordinators can do this at the gate.' using errcode = '42501';
  end if;
  select ch.active, ch.programme_id into c from public.children ch where ch.id = p_child;
  if not found or not c.active then
    raise exception 'This child is not registered with the school.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.attendance a where a.child_id = p_child and a.day = d and a.status <> 'present') then
    raise exception 'not_coming: This child is marked as not coming today. Check with the core team first.' using errcode = 'P0001';
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

revoke all on function public.gate_walk_in(uuid, public.trip_direction, uuid) from public, anon;
grant execute on function public.gate_walk_in(uuid, public.trip_direction, uuid) to authenticated;
