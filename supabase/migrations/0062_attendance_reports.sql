-- 0062: Attendance & Reports for the admin and Head office.
--   Verified events already exist and are not changed: a coordinator's Check in (trips.status 'checked_in', closed_by,
--   closed_at) is a verified drop-off; Hand over to a registered guardian, or to a one-time collector after their code
--   (status 'handed_over') is a verified pickup; both also write public.attendance (checked_in_at, checked_out_at).
--   A parent's "on my way" (created_at), "I've arrived" (arrived_at) and the gate's Ready (ready_at) are announcements,
--   never proof that a child entered or left.
--   1. attendance_report: one row per child and day in a range (to today at most), for every day the child was expected
--      (enrolled, a programme of theirs runs: weekdays, term, holidays, Saturday rule) or has a record, with the
--      scheduled times, the day's record, its verified events and their source, the announcements and corrections.
--      Statuses and every figure are worked out from these rows by one shared engine (src/features/reports/engine.ts).
--   2. attendance_corrections + correct_attendance: the admin corrects a day's status, drop-off or pickup time or
--      note, with a reason, all or nothing; each changed field is kept with its old and new value. A repeated request
--      (same request id) changes nothing.
--   3. log_report_export: every download is logged first (who, what, which filters) and gets its Report ID and data
--      cutoff from the server. Files are made in the browser from the same data and never stored or linked.
--   Times are timestamptz; the school's time zone is Asia/Kolkata. Kept as long as attendance is (school records).
-- Rollback: drop the three functions and the table; nothing else changed.

create table public.attendance_corrections (
  id bigint generated always as identity primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  day date not null,
  field text not null check (field in ('status', 'dropoff', 'pickup', 'note')),
  old_value text,
  new_value text,
  reason text not null check (length(btrim(reason)) between 3 and 300),
  corrected_by uuid not null references public.profiles (id),
  corrected_at timestamptz not null default now(),
  request_id uuid not null,
  unique (request_id, field)
);
create index on public.attendance_corrections (child_id, day);
alter table public.attendance_corrections enable row level security;
create policy read on public.attendance_corrections for select to authenticated using (app.has_role('admin', 'core'));
revoke all on public.attendance_corrections from public, anon, authenticated;
grant select on public.attendance_corrections to authenticated;
create index if not exists trips_child_day on public.trips (child_id, day);

-- 1. The register ---------------------------------------------------------------------------------------------------------
create function public.attendance_report(p_from date, p_to date, p_class uuid default null, p_programme uuid default null, p_child uuid default null)
returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  upto date := least(p_to, app.today());
begin
  if app.me() is null or not app.has_role('admin', 'core') then
    raise exception 'Only the admin and Head office can see attendance reports.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'bad_range: Choose a start date on or before the end date.' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'bad_range: Choose a period of a year or less.' using errcode = '22023';
  end if;
  return json_build_object(
    'generated_at', now(),
    'from', p_from, 'to', p_to, 'cutoff', upto, 'today', app.today(), 'timezone', 'Asia/Kolkata',
    'holidays', (select coalesce(json_agg(json_build_object('day', h.day, 'name', h.name) order by h.day), '[]'::json)
      from public.holidays h where h.day between p_from and upto),
    'rows', (select coalesce(json_agg(r order by r.day, r.child), '[]'::json) from (
      select c.id as child_id, c.full_name as child, cl.name as class, c.class_id, pm.name as programme, d.day,
        x.expected,
        to_char(coalesce(dti.at, cs.dropoff, x.starts), 'HH24:MI') as sched_in,
        to_char(coalesce(dto.at, cs.pickup, x.ends), 'HH24:MI') as sched_out,
        a.status as marked, a.note, a.checked_in_at as dropoff_at, a.checked_out_at as pickup_at,
        -- Where each time comes from: the gate's own action, an admin's correction, or an older record.
        case when a.checked_in_at is null then null
          when exists (select 1 from public.attendance_corrections k where k.child_id = c.id and k.day = d.day and k.field = 'dropoff') then 'corrected'
          when din.closed_at is not null then 'gate' else 'record' end as dropoff_source,
        case when a.checked_out_at is null then null
          when exists (select 1 from public.attendance_corrections k where k.child_id = c.id and k.day = d.day and k.field = 'pickup') then 'corrected'
          when dout.closed_at is not null then 'gate' else 'record' end as pickup_source,
        (select p.full_name from public.profiles p where p.id = din.closed_by) as dropoff_by,
        (select p.full_name from public.profiles p where p.id = dout.closed_by) as pickup_by,
        coalesce((select p.full_name from public.profiles p where p.id = dout.handed_to), dout.handed_to_name) as pickup_to,
        -- Announcements: a parent's request, not proof. A walk-in at the gate has none.
        case when din.created_at < din.closed_at - interval '5 seconds' then din.created_at end as dropoff_announced_at,
        pann.created_at as pickup_announced_at, pann.arrived_at as pickup_arrived_at, pann.ready_at,
        (select coalesce(json_agg(json_build_object('field', k.field, 'old', k.old_value, 'new', k.new_value, 'reason', k.reason,
            'by', (select p.full_name from public.profiles p where p.id = k.corrected_by), 'at', k.corrected_at) order by k.id), '[]'::json)
          from public.attendance_corrections k where k.child_id = c.id and k.day = d.day) as corrections
      from generate_series(p_from, upto, interval '1 day') g(dd)
      cross join lateral (select g.dd::date as day) d
      join public.children c on (p_child is null or c.id = p_child) and (p_class is null or c.class_id = p_class)
        and (p_programme is null or c.programme_id = p_programme
             or exists (select 1 from public.child_programmes cp where cp.child_id = c.id and cp.programme_id = p_programme))
      join public.classes cl on cl.id = c.class_id
      join public.programmes pm on pm.id = c.programme_id
      cross join lateral (
        -- Expected: enrolled by then, not yet deactivated, and one of their programmes runs that day.
        select (d.day >= (c.created_at at time zone 'Asia/Kolkata')::date
            and (c.active or d.day < coalesce((select max(l.at at time zone 'Asia/Kolkata')::date from public.audit_log l
              where l.table_name = 'children' and l.new_row ->> 'id' = c.id::text and l.new_row ->> 'active' = 'false'), d.day + 1))
            and app.child_runs_on(c.id, d.day)) as expected,
          (select min(p.starts) from public.programmes p where (p.id = c.programme_id or p.id in (select cp.programme_id from public.child_programmes cp where cp.child_id = c.id)) and app.runs_on(p.id, d.day)) as starts,
          (select max(p.ends) from public.programmes p where (p.id = c.programme_id or p.id in (select cp.programme_id from public.child_programmes cp where cp.child_id = c.id)) and app.runs_on(p.id, d.day)) as ends
      ) x
      left join public.attendance a on a.child_id = c.id and a.day = d.day
      left join public.child_schedules cs on cs.child_id = c.id and cs.weekday = extract(isodow from d.day)
      left join public.day_times dti on dti.child_id = c.id and dti.day = d.day and dti.direction = 'dropoff'
      left join public.day_times dto on dto.child_id = c.id and dto.day = d.day and dto.direction = 'pickup'
      left join lateral (select t.* from public.trips t where t.child_id = c.id and t.day = d.day and t.status = 'checked_in' order by t.closed_at limit 1) din on true
      left join lateral (select t.* from public.trips t where t.child_id = c.id and t.day = d.day and t.status = 'handed_over' order by t.closed_at desc limit 1) dout on true
      left join lateral (select t.* from public.trips t where t.child_id = c.id and t.day = d.day and t.direction = 'pickup' and t.status <> 'cancelled'
        and t.created_at < coalesce(t.closed_at, 'infinity') - interval '5 seconds' order by t.created_at desc limit 1) pann on true
      where x.expected or a.child_id is not null or din.id is not null or dout.id is not null
    ) r)
  );
end $$;

-- 2. Corrections ----------------------------------------------------------------------------------------------------------
-- p_changes: any of status ('present', 'absent', 'on_leave', 'off'), dropoff_at, pickup_at (an ISO time, or null to
-- clear it), note (text, or null). Keys left out are left alone. Returns the day's record after the change.
create function public.correct_attendance(p_child uuid, p_day date, p_changes jsonb, p_reason text, p_request uuid)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.me();
  why text := btrim(coalesce(p_reason, ''));
  a public.attendance;
  new_status public.attendance_status;
  new_in timestamptz;
  new_out timestamptz;
  new_note text;
  n int := 0;
begin
  if me is null or not app.has_role('admin') then
    raise exception 'Only the admin can correct attendance.' using errcode = '42501';
  end if;
  if length(why) < 3 or length(why) > 300 then
    raise exception 'reason_required: Say why this is being corrected (3 to 300 characters).' using errcode = 'P0001';
  end if;
  if p_request is null or p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Nothing to correct.' using errcode = '22023';
  end if;
  if p_day > app.today() then
    raise exception 'future_day: Attendance can''t be corrected for a day that hasn''t happened.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.children where id = p_child) then
    raise exception 'This child is not registered with the school.' using errcode = 'P0001';
  end if;
  -- The same request again (a double tap, a retry): already done.
  if exists (select 1 from public.attendance_corrections where request_id = p_request) then
    return (select to_json(x) from public.attendance x where x.child_id = p_child and x.day = p_day);
  end if;
  perform app.throttle('correct:' || me, 60, interval '1 minute');

  select * into a from public.attendance where child_id = p_child and day = p_day for update;
  new_status := case when p_changes ? 'status' then (p_changes ->> 'status')::public.attendance_status else a.status end;
  new_in := case when p_changes ? 'dropoff_at' then (p_changes ->> 'dropoff_at')::timestamptz else a.checked_in_at end;
  new_out := case when p_changes ? 'pickup_at' then (p_changes ->> 'pickup_at')::timestamptz else a.checked_out_at end;
  new_note := case when p_changes ? 'note' then nullif(left(btrim(p_changes ->> 'note'), 500), '') else a.note end;
  if new_status is null then
    if new_in is null and new_out is null then
      raise exception 'status_required: Choose whether the child was present, absent, on leave or not due.' using errcode = 'P0001';
    end if;
    new_status := 'present';
  end if;
  if new_status <> 'present' and (new_in is not null or new_out is not null) then
    raise exception 'times_need_present: A child with a drop-off or pickup time was present. Clear the times first.' using errcode = 'P0001';
  end if;
  if (new_in is not null and (new_in at time zone 'Asia/Kolkata')::date <> p_day) or (new_out is not null and (new_out at time zone 'Asia/Kolkata')::date <> p_day) then
    raise exception 'wrong_day: The times must be on the day being corrected.' using errcode = 'P0001';
  end if;
  if new_in is not null and new_out is not null and new_out < new_in then
    raise exception 'pickup_before_dropoff: The pickup must come after the drop-off.' using errcode = 'P0001';
  end if;

  insert into public.attendance_corrections (child_id, day, field, old_value, new_value, reason, corrected_by, request_id)
  select p_child, p_day, f, o, v, why, me, p_request from (values
    ('status', a.status::text, new_status::text),
    ('dropoff', a.checked_in_at::text, new_in::text),
    ('pickup', a.checked_out_at::text, new_out::text),
    ('note', a.note, new_note)) as ch(f, o, v)
  where o is distinct from v;
  get diagnostics n = row_count;
  if n = 0 then
    return to_json(a);
  end if;
  insert into public.attendance (child_id, day, status, checked_in_at, checked_out_at, note, reported_by)
  values (p_child, p_day, new_status, new_in, new_out, new_note, me)
  on conflict (child_id, day) do update set status = excluded.status, checked_in_at = excluded.checked_in_at,
    checked_out_at = excluded.checked_out_at, note = excluded.note
  returning * into a;
  return to_json(a);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception 'bad_value: A status or time in this correction isn''t valid.' using errcode = '22023';
end $$;

-- 3. Export log -----------------------------------------------------------------------------------------------------------
-- Logged before any file is made. Returns the Report ID and the data cutoff printed on it.
create function public.log_report_export(p_report text, p_format text, p_filters jsonb) returns json
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.me();
  id_ bigint;
begin
  if me is null or not app.has_role('admin', 'core') then
    raise exception 'Only the admin and Head office can download attendance reports.' using errcode = '42501';
  end if;
  if p_report not in ('executive', 'register', 'detailed') or p_format not in ('pdf', 'xlsx', 'docx', 'csv') then
    raise exception 'Unknown report or format.' using errcode = '22023';
  end if;
  perform app.throttle('export:' || me, 30, interval '10 minutes');
  insert into public.audit_log (actor, action, table_name, new_row)
  values (auth.uid(), 'export', 'attendance_report', jsonb_build_object('report', p_report, 'format', p_format, 'filters', coalesce(p_filters, '{}'::jsonb), 'profile', me))
  returning id into id_;
  return json_build_object('report_id', 'JSG-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYYMMDD') || '-' || lpad(id_::text, 6, '0'), 'generated_at', now());
end $$;

revoke all on function public.attendance_report(date, date, uuid, uuid, uuid), public.correct_attendance(uuid, date, jsonb, text, uuid),
  public.log_report_export(text, text, jsonb) from public, anon;
grant execute on function public.attendance_report(date, date, uuid, uuid, uuid), public.correct_attendance(uuid, date, jsonb, text, uuid),
  public.log_report_export(text, text, jsonb) to authenticated;
