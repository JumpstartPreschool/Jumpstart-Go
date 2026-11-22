-- 0045: Parent trips and gate announcements, tightened before go-live.
--
--   * Running late takes the arrival time the parent was looking at (p_expected_from). If it has moved since (a tap whose
--     reply was lost and was tapped again, the other parent's change), the server answers "stale" instead of adding the
--     minutes a second time. Callers that don't send it work as before.
--   * "I've arrived" reads the app clock like every other trip step, so it can be tested with a pinned time.
--   * Gate announcements: up to 20 wording changes a day, and going back to all defaults never counts (it is the way out
--     of a mistake); the reminder repeats every 2, 3 or 5 minutes (not every minute); and a failed timing check says what
--     it is, instead of every check failure reading as the order of the timings.

-- 1. Running late, with p_expected_from. A new argument is a new function, so the old one goes.
drop function public.running_late(uuid, int, timestamptz, text);
create function public.running_late(p_trip uuid, p_minutes int default null, p_at timestamptz default null, p_note text default null, p_expected_from timestamptz default null)
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
  -- The arrival the caller was looking at. A retry after a lost reply, or the other parent's change in the meantime, finds
  -- it moved: say so instead of adding the minutes a second time.
  if p_expected_from is not null and t.arrive_at is distinct from p_expected_from then
    raise exception 'stale: The time changed. Here''s the new time.' using errcode = 'P0001';
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
revoke all on function public.running_late(uuid, int, timestamptz, text, timestamptz) from public, anon;
grant execute on function public.running_late(uuid, int, timestamptz, text, timestamptz) to authenticated;

-- 2. "I've arrived" on the app clock.
create or replace function public.arrive_trip(p_trip uuid) returns public.trips
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or not (app.is_guardian_of(t.child_id) or app.has_role('admin', 'core')) then
    raise exception 'Only this child''s parents or the school can do this.' using errcode = '42501';
  end if;
  if t.status <> 'en_route' then
    raise exception 'This trip is already finished.' using errcode = 'P0001';
  end if;
  if t.arrived_at is not null then return t; end if;
  update public.trips set arrived_at = app.clock(), updated_at = app.clock() where id = p_trip returning * into t;
  return t;
end $$;

-- 3. The reminder repeats at most every 2 minutes. A row saved with 1 minute becomes 2.
update public.gate_announcement_settings set reminder_min = 2 where reminder_min = 1;
alter table public.gate_announcement_settings drop constraint if exists gate_announcement_settings_reminder_min_check;
alter table public.gate_announcement_settings add constraint gate_announcement_settings_reminder_min_check check (reminder_min in (2, 3, 5));

-- 4. Saving the gate announcements: the 20 a day cap, the way out, and honest errors.
create or replace function public.admin_save_gate_announcements(p jsonb) returns public.gate_announcement_settings
language plpgsql security definer set search_path = '' as $$
declare
  old public.gate_announcement_settings;
  row public.gate_announcement_settings;
  k text;
  v text;
  problem text;
  cn text;
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can change gate announcements.' using errcode = '42501';
  end if;
  foreach k in array array['pickup_eta', 'pickup_late', 'pickup_arrived', 'pickup_cancelled', 'dropoff_eta', 'dropoff_late', 'dropoff_arrived', 'dropoff_cancelled'] loop
    v := nullif(btrim(coalesce(p ->> k, '')), '');
    if v is not null then
      problem := app.gate_template_problem(k, v);
      if problem is not null then
        raise exception 'bad_template: %', problem using errcode = 'P0001', detail = k;
      end if;
    end if;
  end loop;
  foreach k in array array['opening_new', 'opening_urgent', 'opening_reminder'] loop
    v := nullif(btrim(coalesce(p ->> k, '')), '');
    if v is not null and (length(v) not between 2 and 40 or v !~ '^[[:alnum:] ,''-]+[.!]$') then
      raise exception 'bad_opening: Each opening is one short sentence ending with a full stop, like "New announcement."' using errcode = 'P0001', detail = k;
    end if;
  end loop;

  -- A reminder every minute can keep the gate speaking without a pause when several trips wait.
  if coalesce((p ->> 'reminder_min')::integer, 2) < 2 then
    raise exception 'bad_timing: The reminder can repeat every 2, 3 or 5 minutes.' using errcode = 'P0001', detail = 'reminder_min';
  end if;

  select * into old from public.gate_announcement_settings;
  update public.gate_announcement_settings set
    opening_new = nullif(btrim(coalesce(p ->> 'opening_new', '')), ''),
    opening_urgent = nullif(btrim(coalesce(p ->> 'opening_urgent', '')), ''),
    opening_reminder = nullif(btrim(coalesce(p ->> 'opening_reminder', '')), ''),
    pickup_eta = nullif(btrim(coalesce(p ->> 'pickup_eta', '')), ''),
    pickup_late = nullif(btrim(coalesce(p ->> 'pickup_late', '')), ''),
    pickup_arrived = nullif(btrim(coalesce(p ->> 'pickup_arrived', '')), ''),
    pickup_cancelled = nullif(btrim(coalesce(p ->> 'pickup_cancelled', '')), ''),
    dropoff_eta = nullif(btrim(coalesce(p ->> 'dropoff_eta', '')), ''),
    dropoff_late = nullif(btrim(coalesce(p ->> 'dropoff_late', '')), ''),
    dropoff_arrived = nullif(btrim(coalesce(p ->> 'dropoff_arrived', '')), ''),
    dropoff_cancelled = nullif(btrim(coalesce(p ->> 'dropoff_cancelled', '')), ''),
    early_min = coalesce((p ->> 'early_min')::integer, 15),
    ready_min = coalesce((p ->> 'ready_min')::integer, 10),
    urgent_min = coalesce((p ->> 'urgent_min')::integer, 5),
    reminder_min = coalesce((p ->> 'reminder_min')::integer, 2),
    updated_at = now(),
    updated_by = app.me()
  where id
  returning * into row;

  -- New words: every child's announcements are recorded again ahead (only the sentences that changed cost anything).
  if (old.opening_new, old.opening_urgent, old.opening_reminder, old.pickup_eta, old.pickup_late, old.pickup_arrived, old.pickup_cancelled,
      old.dropoff_eta, old.dropoff_late, old.dropoff_arrived, old.dropoff_cancelled)
     is distinct from
     (row.opening_new, row.opening_urgent, row.opening_reminder, row.pickup_eta, row.pickup_late, row.pickup_arrived, row.pickup_cancelled,
      row.dropoff_eta, row.dropoff_late, row.dropoff_arrived, row.dropoff_cancelled) then
    -- At most 20 wording changes a day: each re-records voices against the monthly Azure cap (0035). Going back to
    -- every default records nothing new (the clips are kept by their words), so it is always allowed: the way out.
    if not ((row.opening_new, row.opening_urgent, row.opening_reminder, row.pickup_eta, row.pickup_late, row.pickup_arrived, row.pickup_cancelled,
             row.dropoff_eta, row.dropoff_late, row.dropoff_arrived, row.dropoff_cancelled) is null) then
      if (select count(*) from app.throttle_log where key = 'gate-words' and at > now() - interval '1 day') >= 20 then
        raise exception 'too_many_changes: The wording can change 20 times a day, because each change records every child''s announcements again. Try again tomorrow; timings can still change.' using errcode = 'P0001';
      end if;
      insert into app.throttle_log (key) values ('gate-words');
    end if;
    perform app.voice_requeue(array(select child_id from public.child_pronunciations));
  end if;
  return row;
exception
  when check_violation then
    -- Only this table's own timing checks are the admin's doing; anything else is not ours to relabel.
    get stacked diagnostics cn = constraint_name;
    if cn = 'gate_announcement_settings_check' then
      raise exception 'bad_timing: The early announcement must come before Get ready, and Get ready before Urgent, using the listed times.' using errcode = 'P0001';
    elsif cn like 'gate_announcement_settings\_%\_min\_check' then
      raise exception 'bad_timing: Choose one of the listed times.' using errcode = 'P0001';
    end if;
    raise;
  when invalid_text_representation then
    raise exception 'bad_timing: Choose one of the listed times.' using errcode = 'P0001';
end $$;
