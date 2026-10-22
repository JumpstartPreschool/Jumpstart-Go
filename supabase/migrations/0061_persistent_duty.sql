-- 0061: duty is a state the person sets, never a side effect of the app's lifecycle.
--   Root cause of "Resume duty" after every app switch: the duty screen kept duty only in page memory, and the server's
--   gate_heartbeat(false) DELETED the person's duty row whenever their page said it couldn't be heard (Mute, iOS pausing
--   audio on an app switch, the duty screen closing), purged rows a day after the last heartbeat, and restarted duty at
--   midnight. Now:
--   1. app.gate_duty holds the duty itself: status active or paused (no row = off duty), when it started, was paused and
--      resumed, who changed it last and why, and a version that rises on every change.
--   2. set_duty is the only way to change it: the person themselves, a gate role, explicit, under a row lock, idempotent
--      (asking for the status it already has changes nothing), and refused with 'duty_conflict' when the caller's
--      version is out of date, so a device that was offline can't overwrite a newer change made on another device.
--      Every change is written to the audit log.
--   3. gate_heartbeat only records reachability (seen_at) and whether the page can be heard (audible). It never starts,
--      pauses or ends duty, except that an app from before this change starting its heartbeat counts as Start duty.
--   4. Gate alerts skip people who paused, unless that would leave nobody to tell. Reminders prefer people whose duty is
--      Active (whatever day it started). The silent-device warning is for Active duty only. The delivery report shows
--      the duty status and when each device was last seen, separately.
--   Nothing ends duty automatically: not midnight, not inactivity, not a lost connection.
-- Rollback: the previous functions are in 0058 and 0059; the new columns can stay.

-- 1. The duty itself --------------------------------------------------------------------------------------------------------------
alter table app.gate_duty
  add column status text not null default 'active' check (status in ('active', 'paused')),
  add column audible boolean not null default true,
  add column paused_at timestamptz,
  add column resumed_at timestamptz,
  add column changed_at timestamptz not null default now(),
  add column changed_by uuid references public.profiles (id) on delete set null,
  add column change_reason text check (change_reason is null or length(change_reason) <= 200),
  add column version int not null default 1;
-- Rows were created by the heartbeat; their duty began then.
update app.gate_duty set changed_at = started_at, changed_by = profile_id;
create trigger audit after insert or update of status, version or delete on app.gate_duty for each row execute function app.audit();

create function app.duty_json(d app.gate_duty) returns json
language sql stable set search_path = '' as $$
  select case when d.profile_id is null then null else json_build_object(
    'status', d.status, 'started_at', d.started_at, 'paused_at', d.paused_at, 'resumed_at', d.resumed_at,
    'changed_at', d.changed_at, 'changed_by', d.changed_by, 'change_reason', d.change_reason, 'version', d.version,
    'last_seen', d.seen_at) end
$$;

-- The caller's own duty, or null when off duty.
create function public.my_duty() returns json
language plpgsql stable security definer set search_path = '' as $$
declare d app.gate_duty;
begin
  if app.me() is null or not app.is_gate() then
    raise exception 'Only the gate team has a duty status.' using errcode = '42501';
  end if;
  select * into d from app.gate_duty where profile_id = app.me();
  return app.duty_json(d);
end $$;

-- 2. The only way duty changes. p_status: 'active' (start or resume), 'paused', or 'off' (End duty).
-- p_version: the version the caller last saw (null when it saw none, e.g. off duty). Returns the duty after the change.
create function public.set_duty(p_status text, p_version int default null, p_reason text default null) returns json
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.me();
  d app.gate_duty;
  now_ timestamptz := app.clock();
  why text := nullif(left(btrim(coalesce(p_reason, '')), 200), '');
begin
  if me is null or not app.is_gate() then
    raise exception 'Only the gate team can go on duty.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'paused', 'off') then
    raise exception 'Duty can be active, paused or off.' using errcode = '22023';
  end if;
  select * into d from app.gate_duty where profile_id = me for update;
  -- Already so: nothing changes, whichever device asks, so a repeated tap or a retry is harmless.
  if (not found and p_status = 'off') or (found and d.status = p_status) then return app.duty_json(d); end if;
  -- Changed elsewhere since this device last looked: refuse, so an older view never overwrites a newer change.
  if (found and p_version is distinct from d.version) or (not found and p_version is not null) then
    raise exception 'duty_conflict: Your duty was changed on another device.' using errcode = 'P0001', detail = coalesce(app.duty_json(d)::text, 'null');
  end if;
  if not found then
    if p_status = 'paused' then raise exception 'Start duty before pausing it.' using errcode = 'P0001'; end if;
    insert into app.gate_duty (profile_id, started_at, seen_at, status, changed_at, changed_by, change_reason)
    values (me, now_, now_, 'active', now_, me, coalesce(why, 'started'))
    returning * into d;
  elsif p_status = 'off' then
    delete from app.gate_duty where profile_id = me;
    return null;
  else
    update app.gate_duty set status = p_status, version = version + 1, changed_at = now_, changed_by = me,
      change_reason = coalesce(why, case p_status when 'paused' then 'paused' else 'resumed' end),
      paused_at = case when p_status = 'paused' then now_ else paused_at end,
      resumed_at = case when p_status = 'active' then now_ else resumed_at end
    where profile_id = me returning * into d;
  end if;
  return app.duty_json(d);
end $$;

-- 3. Reachability only. Same answer as 0051 (who can be heard now: Active, audible and seen in the last 75 seconds).
-- p_on is now "this page can be heard". p_start: only an app from before 0061, which has no Start duty call, lets its
-- first heartbeat start duty; this app passes false, so a device whose duty was ended elsewhere can't bring it back.
drop function public.gate_heartbeat(boolean);
create function public.gate_heartbeat(p_on boolean default true, p_start boolean default true) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.me();
begin
  if me is null or not app.is_gate() then
    raise exception 'Only the gate team can go on duty.' using errcode = '42501';
  end if;
  update app.gate_duty set seen_at = now(), audible = p_on where profile_id = me;
  if not found and p_on and p_start then
    insert into app.gate_duty (profile_id, changed_by, change_reason) values (me, me, 'started') on conflict (profile_id) do nothing;
  end if;
  return array(select profile_id from app.gate_duty where status = 'active' and audible and seen_at > now() - interval '75 seconds');
end $$;

-- 4. Who gate alerts go to ------------------------------------------------------------------------------------------------------
-- The child's gate team (coordinators_for), less anyone who paused their duty, unless that leaves nobody.
create function app.gate_team_for(p_child uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(array(select x from unnest(team) x
    where not exists (select 1 from app.gate_duty d where d.profile_id = x and d.status = 'paused')), '{}'), team)
  from (select app.coordinators_for(p_child) as team) t
$$;

-- As 0059, to the gate team less anyone paused.
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
    perform app.notify(app.gate_team_for(new.child_id),
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
    perform app.notify(app.gate_team_for(new.child_id),
      format('%s, %s at %s', app.child_first(new.child_id), word, app.hm(new.arrive_at)),
      format('%s%s is on the way.%s', who, coalesce(' (' || lower(new.traveller_relation) || ')', ''), case when new.off_schedule then ' Outside the usual time.' else '' end),
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

-- As 0058, to the gate team less anyone paused.
create or replace function app.push_on_arrival() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.arrived_at is not null and old.arrived_at is null and new.status = 'en_route' then
    perform app.notify(app.gate_team_for(new.child_id),
      format('%s has arrived', coalesce(nullif(split_part(new.traveller_name, ' ', 1), ''), 'The collector')),
      format('%s for %s.', case new.direction when 'pickup' then 'Pickup' else 'Drop-off' end,
        app.child_first(new.child_id)),
      '/coordinator', 'trip-' || new.id);
  end if;
  return null;
end $$;

-- As 0059: Active duty, from any day, decides who is on duty.
create or replace function app.send_gate_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  now_ timestamptz := app.clock();
  every interval := make_interval(mins => coalesce((select reminder_min from public.gate_announcement_settings limit 1), 2));
  n int := 0;
  r record;
  to_tell uuid[];
  on_duty uuid[];
  arrived boolean;
  escalate boolean;
  kid text;
begin
  -- Finished trips need no reminders.
  delete from app.gate_reminders g using public.trips t where t.id = g.trip_id and t.status <> 'en_route';
  for r in
    select t.*, gr.last_at as reminded_at, coalesce(gr.sent, 0) as reminders_sent,
      greatest(t.created_at, t.late_at, t.arrived_at, gr.last_at) as latest
    from public.trips t left join app.gate_reminders gr on gr.trip_id = t.id
    where t.status = 'en_route' and t.day = app.today() and (t.acknowledged_at is null or app.arrived_since_seen(t))
      and coalesce(gr.sent, 0) < 30
  loop
    -- A few seconds of slack so the one-minute job does not skip a round when it runs a moment early.
    continue when r.latest > now_ - every + interval '5 seconds';
    arrived := r.arrived_at is not null and (r.acknowledged_at is null or r.arrived_at > r.acknowledged_at);
    escalate := r.reminders_sent >= case when arrived or r.off_schedule then 1 else 2 end;
    to_tell := app.gate_team_for(r.child_id);
    if escalate then
      to_tell := to_tell || array(select sr.profile_id from public.staff_roles sr where sr.role = 'leader');
    else
      -- On duty means duty is Active, whenever it was started and whether or not the device is reachable right now.
      on_duty := array(select d.profile_id from app.gate_duty d where d.profile_id = any (to_tell) and d.status = 'active');
      if cardinality(on_duty) > 0 then to_tell := on_duty; end if;
    end if;
    kid := app.child_first(r.child_id);
    perform app.notify(to_tell,
      case when arrived then format('Reminder: %s has arrived for %s', coalesce(nullif(split_part(r.traveller_name, ' ', 1), ''), 'the collector'), kid)
        else format('Reminder: %s, %s at %s', kid, case r.direction when 'pickup' then 'pickup' else 'drop-off' end, app.hm(r.arrive_at)) end,
      format('%s for %s is waiting to be acknowledged.%s', case r.direction when 'pickup' then 'Pickup' else 'Drop-off' end, kid,
        case when escalate then ' Nobody has answered yet.' else '' end),
      '/coordinator', 'trip-' || r.id);
    insert into app.gate_reminders (trip_id, last_at, sent) values (r.id, now_, 1)
    on conflict (trip_id) do update set last_at = now_, sent = app.gate_reminders.sent + 1;
    n := n + 1;
  end loop;
  return n;
end $$;

-- As 0058, for Active duty only.
create or replace function app.alert_silent_duty() returns int
language plpgsql security definer set search_path = '' as $$
declare
  now_ timestamptz := app.clock();
  hm time := (now_ at time zone 'Asia/Kolkata')::time;
  n int := 0;
  r record;
begin
  if hm < time '08:00' or hm > time '19:30' then return 0; end if;
  for r in
    select d.profile_id, split_part(p.full_name, ' ', 1) as first_name from app.gate_duty d join public.profiles p on p.id = d.profile_id
    where d.status = 'active'
      and d.seen_at < now_ - interval '2 minutes'
      and (d.silent_alerted_at is null or (d.silent_alerted_at < now_ - interval '30 minutes' and d.seen_at > d.silent_alerted_at))
    for update of d
  loop
    perform app.notify(
      array(select sr.profile_id from public.staff_roles sr where sr.role = 'leader') || r.profile_id,
      'No signal from ' || r.first_name || '''s device',
      'Announcements may not play on it. Open Jumpstart Go on that device.',
      '/coordinator', 'duty-' || r.profile_id);
    update app.gate_duty set silent_alerted_at = now_ where profile_id = r.profile_id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- As 0059, with the duty status and last seen kept apart.
create or replace function public.gate_delivery_report() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  -- Device names and error text for Center Leaders and Head office; coordinators see counts and times.
  detail boolean := app.has_role('leader', 'admin', 'core');
begin
  if app.me() is null or not (app.is_gate() or app.has_role('admin', 'core')) then
    raise exception 'Only the gate team and Head office can see delivery.' using errcode = '42501';
  end if;
  return json_build_object(
    'staff', (select coalesce(json_agg(x order by x.name), '[]'::json) from (
      select p.id, p.full_name as name, array_agg(distinct r.role::text order by r.role::text) as roles,
        exists (select 1 from app.gate_duty g where g.profile_id = p.id and g.status = 'active') as on_duty,
        (select g.status from app.gate_duty g where g.profile_id = p.id) as duty,
        (select g.seen_at from app.gate_duty g where g.profile_id = p.id) as last_seen,
        (select max(o.displayed_at) from app.push_outbox o where o.profile_id = p.id) as last_displayed,
        (select count(*) from app.push_outbox o where o.profile_id = p.id and o.created_at > now() - interval '1 day'
          and (o.result like 'error%' or o.result = 'gone'))::int as failed_today,
        case when detail then (select left(regexp_replace(o.result, 'https?://\S+', '<address>', 'g'), 80) from app.push_outbox o
          where o.profile_id = p.id and o.result like 'error%' order by o.id desc limit 1) end as last_error,
        (select coalesce(json_agg(json_build_object('kind', 'web', 'label', case when detail then left(coalesce(s.user_agent, ''), 300) else '' end, 'added', s.created_at,
            'last_displayed', s.last_displayed_at, 'last_test', s.last_test_at, 'test_heard', s.test_heard_at) order by s.created_at desc), '[]'::json)
          from public.push_subscriptions s where s.profile_id = p.id) as web,
        (select coalesce(json_agg(json_build_object('kind', d.platform, 'added', d.created_at, 'last_seen', d.last_seen_at) order by d.created_at desc), '[]'::json)
          from public.device_tokens d where d.profile_id = p.id) as phones
      from public.profiles p join public.staff_roles r on r.profile_id = p.id
      where r.role in ('coordinator', 'leader') and p.active and p.app_access
      group by p.id, p.full_name) x),
    -- Per open request, each fact counted separately: queued (persisted), dispatched, accepted by the push service,
    -- displayed and opened (reported by the device), spoken (reported by the duty screen), acknowledged (a person).
    'trips', (select coalesce(json_agg(y order by y.arrive_at), '[]'::json) from (
      select t.id, app.child_first(t.child_id) as child, t.direction, t.arrive_at, t.arrived_at, t.acknowledged_at,
        count(o.id)::int as queued,
        count(o.id) filter (where o.attempts > 0)::int as dispatched,
        count(o.id) filter (where o.result = 'sent')::int as accepted,
        count(o.id) filter (where o.displayed_at is not null)::int as displayed,
        count(o.id) filter (where o.opened_at is not null)::int as opened,
        count(o.id) filter (where o.result like 'error%' or o.result = 'gone')::int as failed,
        count(o.id) filter (where o.result in ('expired', 'skipped closed'))::int as expired,
        (select count(*) from app.gate_heard h where h.trip_id = t.id)::int as heard,
        coalesce((select gr.sent from app.gate_reminders gr where gr.trip_id = t.id), 0) as reminders,
        bool_or(o.title like 'Reminder%' and o.body like '%Nobody has answered yet.') is true as escalated
      from public.trips t left join app.push_outbox o on o.tag = 'trip-' || t.id::text and o.url like '/coordinator%'
      where t.day = app.today() and t.status = 'en_route'
      group by t.id) y)
  );
end $$;

revoke all on function app.duty_json(app.gate_duty), app.gate_team_for(uuid) from public, anon, authenticated;
revoke all on function public.my_duty(), public.set_duty(text, int, text), public.gate_heartbeat(boolean, boolean) from public, anon;
grant execute on function public.my_duty(), public.set_duty(text, int, text), public.gate_heartbeat(boolean, boolean) to authenticated;
