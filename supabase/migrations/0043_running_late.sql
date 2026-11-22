-- 0043: Running late (owner, 2026-10-03). A parent on the way taps Running late, chooses +5, +10, +15 minutes or a
-- later time today, and may add a short note. It changes the trip's real arrival time, so everything that follows (the
-- gate queue, every reminder and announcement, the parent's card, notifications) uses the new time; the gate hears a
-- "Pickup update … running late" announcement at once (gateAnnounce.ts), and the gate team is told on their phones.
--
--   * One trip per child, direction and day, as before: the same row gets the new arrive_at. late_from keeps the time
--     it replaced, late_at and late_by when and who, late_note the parent's words (shown at the gate, never spoken).
--     Every change is in the audit log (trips are audited, 0001), so the history of each late update is kept there.
--   * A late time is guidance for the school, never a block: no reason is asked for, and a time outside the child's
--     window is flagged "Running late" for the gate team, as before.
--   * Only the child's own parents and family (or the admin and head office) can do it, only while the trip is on its
--     way and they haven't arrived, only for a later time today, and at most 6 times in 10 minutes per trip.

alter table public.trips
  add column late_at timestamptz,
  add column late_by uuid references public.profiles (id) on delete set null,
  add column late_from timestamptz,
  add column late_note text check (late_note is null or length(late_note) between 1 and 120);

-- p_minutes: 5, 10 or 15 minutes later than the current arrival (or than now, if that has already passed).
-- p_at: a later time today instead (Custom time). p_note: optional, up to 120 characters.
create function public.running_late(p_trip uuid, p_minutes int default null, p_at timestamptz default null, p_note text default null)
returns public.trips
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips;
  now_at timestamptz := date_trunc('minute', app.clock());
  arrive timestamptz;
  at_local time;
  note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]+', ' ', 'g')), '');
  c record;
  win_from time;
  win_to time;
  flagged boolean;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or app.me() is null or not (app.is_guardian_of(t.child_id) or app.has_role('admin', 'core')) then
    raise exception 'Only this child''s parents or the school can do this.' using errcode = '42501';
  end if;
  if t.status <> 'en_route' then
    raise exception 'trip_closed: This % has already finished.', case t.direction when 'pickup' then 'pickup' else 'drop-off' end using errcode = 'P0001';
  end if;
  if t.arrived_at is not null then
    raise exception 'already_here: You''ve already told the school you''ve arrived.' using errcode = 'P0001';
  end if;
  if (p_minutes is null) = (p_at is null) then
    raise exception 'bad_time: Choose +5, +10, +15 minutes or a time.' using errcode = 'P0001';
  end if;
  if p_minutes is not null and p_minutes not in (5, 10, 15) then
    raise exception 'bad_time: Choose +5, +10 or +15 minutes.' using errcode = 'P0001';
  end if;
  if note is not null and length(note) > 120 then
    raise exception 'note_too_long: Keep the note under 120 characters.' using errcode = 'P0001';
  end if;
  perform app.throttle('late:' || p_trip, 6, interval '10 minutes');

  arrive := coalesce(greatest(t.arrive_at, now_at) + make_interval(mins => p_minutes), date_trunc('minute', p_at));
  if arrive <= now_at or arrive <= t.arrive_at then
    raise exception 'not_later: Choose a time later than about %.', app.hm(greatest(t.arrive_at, now_at)) using errcode = 'P0001';
  end if;
  if (arrive at time zone 'Asia/Kolkata')::date <> t.day then
    raise exception 'outside_hours: That would be after midnight. Please call the school.' using errcode = 'P0001';
  end if;
  if arrive > now_at + interval '3 hours' then
    raise exception 'too_far: Choose a time within the next 3 hours.' using errcode = 'P0001';
  end if;

  -- Still flagged for the gate team when it falls outside the child's window, with "Running late" as the reason.
  at_local := (arrive at time zone 'Asia/Kolkata')::time;
  select p.flexible, p.starts, p.ends, p.dropoff_from, p.dropoff_to, p.pickup_from, p.pickup_to into c
    from public.children ch join public.programmes p on p.id = ch.programme_id where ch.id = t.child_id;
  if c.flexible then win_from := c.starts; win_to := c.ends;
  elsif t.direction = 'pickup' then win_from := c.pickup_from; win_to := c.pickup_to;
  else win_from := c.dropoff_from; win_to := c.dropoff_to;
  end if;
  flagged := at_local < win_from or at_local > win_to;

  update public.trips
  set arrive_at = arrive, late_from = t.arrive_at, late_at = app.clock(), late_by = app.me(), late_note = note,
      off_schedule = flagged, reason = case when flagged then 'Running late' end,
      updated_at = app.clock(), acknowledged_by = null, acknowledged_at = null
  where id = p_trip
  returning * into t;
  return t;
end $$;
revoke all on function public.running_late(uuid, int, timestamptz, text) from public, anon;
grant execute on function public.running_late(uuid, int, timestamptz, text) to authenticated;

-- Any other new time (Change time, a call to the school, a new "on my way") ends "running late": the trip shows and
-- announces the new time plainly. running_late itself always sets late_from, so its own update is left as it is.
create function app.clear_late() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.late_from is not distinct from old.late_from then
    new.late_at := null; new.late_by := null; new.late_from := null; new.late_note := null;
  end if;
  return new;
end $$;
revoke execute on function app.clear_late() from public;
create trigger clear_late before update of arrive_at on public.trips
  for each row when (old.arrive_at is distinct from new.arrive_at and old.late_at is not null) execute function app.clear_late();

-- Notifications: a late update tells the gate team "Aarav pickup delayed" (replacing the trip's earlier alert, same
-- tag), and the child's other parents and family who asked to hear about changes "Aarav's pickup time changed". The
-- person who made the change isn't told about their own change. Everything else is as in 0016.
create or replace function app.push_on_trip() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  kid text := app.child_first(new.child_id);
  word text := case new.direction when 'pickup' then 'pickup' else 'drop-off' end;
  who text := split_part(new.traveller_name, ' ', 1);
  actor uuid := app.me();
  url text := '/parent';
  -- A late update always moves the time later, so the time it replaced (late_from) changes every time.
  late boolean := tg_op = 'UPDATE' and new.late_from is distinct from old.late_from and new.late_from is not null;
  by_name text := coalesce(split_part((select full_name from public.profiles where id = new.late_by), ' ', 1), who);
begin
  if late and new.status = 'en_route' then
    perform app.notify(app.coordinators_for(new.child_id),
      format('%s %s delayed', kid, word),
      format('%s is now arriving about %s.', coalesce(initcap(new.traveller_relation), who), app.hm(new.arrive_at)),
      '/coordinator', 'trip-' || new.id);
    perform app.notify(app.guardians_to_tell(new.child_id, coalesce(actor, new.late_by), true),
      format('%s''s %s time changed', kid, word),
      format('%s is now arriving about %s.', by_name, app.hm(new.arrive_at)), url, 'trip-' || new.id);
    return null;
  end if;
  -- The gate: a new request or a new time, until someone acknowledges it. The tag replaces the older alert.
  if new.status = 'en_route' and new.acknowledged_at is null and (tg_op = 'INSERT' or new.arrive_at is distinct from old.arrive_at) then
    perform app.notify(app.coordinators_for(new.child_id),
      format('%s, %s at %s', (select full_name from public.children where id = new.child_id), word, app.hm(new.arrive_at)),
      format('%s%s is on the way.%s', who, coalesce(' (' || lower(new.traveller_relation) || ')', ''), case when new.off_schedule then ' Outside the usual time: ' || new.reason || '.' else '' end),
      '/coordinator', 'trip-' || new.id);
  end if;
  -- The family.
  if tg_op = 'INSERT' and new.status = 'en_route' then
    perform app.notify(app.guardians_to_tell(new.child_id, coalesce(actor, new.created_by), true),
      format('%s''s %s: %s is on the way', kid, word, case when new.traveller_kind = 'third_person' then who || ', with a link' else who end),
      format('About %s.%s', app.hm(new.arrive_at), case when new.phoned_in_by is not null then ' Phoned in to the school.' else '' end), url, 'trip-' || new.id);
  elsif tg_op = 'UPDATE' then
    if new.ready_at is not null and old.ready_at is null then
      perform app.notify(app.guardians_to_tell(new.child_id, null, false), format('%s is ready at the gate', kid), format('Ready at %s.', app.hm(new.ready_at)), url, 'trip-' || new.id);
    end if;
    if new.status is distinct from old.status then
      if new.status = 'handed_over' then
        perform app.notify(app.guardians_to_tell(new.child_id, null, false), format('%s has been collected', kid),
          format('At %s, by %s.', app.hm(new.closed_at), coalesce((select full_name from public.profiles where id = new.handed_to), new.handed_to_name)), url, 'trip-' || new.id);
      elsif new.status = 'checked_in' then
        perform app.notify(app.guardians_to_tell(new.child_id, null, false), format('%s is at school', kid), format('Checked in at %s.', app.hm(new.closed_at)), url, 'trip-' || new.id);
      elsif new.status = 'cancelled' then
        perform app.notify(app.guardians_to_tell(new.child_id, actor, true), format('%s''s %s is cancelled', kid, word), 'The gate has been told.', url, 'trip-' || new.id);
      end if;
    end if;
  end if;
  return null;
end $$;
