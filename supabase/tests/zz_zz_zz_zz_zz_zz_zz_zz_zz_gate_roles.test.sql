-- Center Leader and Center Coordinator (0037, 0038). Its own people and child, so earlier tests can't change the outcome:
--   L  Lata, Center Leader of Jr KG          K  Kiran, Center Coordinator of Jr KG
--   P  Pooja, parent of Ishaan (Jr KG)       F  Farah, front desk
-- The clock is pinned to Monday 5 Oct 2026.
insert into public.profiles (id, full_name, email, active) values
  ('00000000-0000-0000-0000-00000000aa01', 'Lata Leader', 'lata@example.test', true),
  ('00000000-0000-0000-0000-00000000aa02', 'Kiran Coordinator', 'kiran@example.test', true),
  ('00000000-0000-0000-0000-00000000aa03', 'Pooja Parent', 'pooja@example.test', true),
  ('00000000-0000-0000-0000-00000000aa04', 'Farah Desk', 'farah@example.test', true);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aa01', 'lata@example.test'),
  ('00000000-0000-0000-0000-00000000aa02', 'kiran@example.test'),
  ('00000000-0000-0000-0000-00000000aa03', 'pooja@example.test'),
  ('00000000-0000-0000-0000-00000000aa04', 'farah@example.test');
insert into public.staff_roles values ('00000000-0000-0000-0000-00000000aa04', 'pro');
insert into public.children (id, full_name, date_of_birth, class_id, programme_id) values
  ('00000000-0000-0000-0000-0000000c00aa', 'Ishaan Rao', '2021-07-01', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001');
insert into public.guardianships values ('00000000-0000-0000-0000-0000000c00aa', '00000000-0000-0000-0000-00000000aa03', 'Mother');
update public.programmes set dropoff_from = '09:00', dropoff_to = '09:30', pickup_from = '12:30', pickup_to = '13:00'
  where id = '00000000-0000-0000-0000-00000000b001';

-- The head office gives both gate roles, with their classes. It still can't give Admin or Head office (roles.test.sql).
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  perform public.set_coordinator('00000000-0000-0000-0000-00000000aa01', '{00000000-0000-0000-0000-00000000c001}', 'leader');
  perform public.set_coordinator('00000000-0000-0000-0000-00000000aa02', '{00000000-0000-0000-0000-00000000c001}');
  assert (select array_agg(role) from public.staff_roles where profile_id = '00000000-0000-0000-0000-00000000aa01') = '{leader}', 'Lata is a Center Leader only';
  assert (select array_agg(role) from public.staff_roles where profile_id = '00000000-0000-0000-0000-00000000aa02') = '{coordinator}', 'Kiran is a Center Coordinator (the default)';
  assert exists (select 1 from public.coordinator_classes where profile_id = '00000000-0000-0000-0000-00000000aa01'), 'a Center Leader has classes';
end $$;
do $$ begin
  perform public.set_coordinator('00000000-0000-0000-0000-00000000aa04', '{}', 'core');
  raise exception 'FAIL: set_coordinator gave a non-gate role';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'bad_role%', sqlerrm;
end $$;
reset role;

-- Both gate roles hear Ishaan's requests (push and tablets); the parent and the front desk don't.
do $$
declare who uuid[] := app.coordinators_for('00000000-0000-0000-0000-0000000c00aa');
begin
  assert '00000000-0000-0000-0000-00000000aa01' = any (who), 'the Center Leader of Jr KG hears it';
  assert '00000000-0000-0000-0000-00000000aa02' = any (who), 'the Center Coordinator of Jr KG hears it';
  assert not '00000000-0000-0000-0000-00000000aa04' = any (who), 'the front desk does not';
  assert (select count(*) from unnest(who) w where w = '00000000-0000-0000-0000-00000000aa01') = 1, 'nobody twice';
end $$;
-- Meera's class (Learning Center) gets only a Center Leader: every Center Coordinator hears it too, so someone can hand over.
delete from public.coordinator_classes where class_id = '00000000-0000-0000-0000-00000000c002';
insert into public.staff_roles values ('00000000-0000-0000-0000-00000000aa04', 'leader');
insert into public.coordinator_classes values ('00000000-0000-0000-0000-00000000aa04', '00000000-0000-0000-0000-00000000c002');
do $$
declare who uuid[] := app.coordinators_for('00000000-0000-0000-0000-0000000c0002');
begin
  assert '00000000-0000-0000-0000-00000000aa04' = any (who), 'the class''s Center Leader hears it';
  assert '00000000-0000-0000-0000-00000000aa02' = any (who), 'a Center Coordinator of another class hears it too';
  assert not '00000000-0000-0000-0000-00000000aa01' = any (who), 'a Center Leader of another class does not';
end $$;
delete from public.staff_roles where profile_id = '00000000-0000-0000-0000-00000000aa04' and role = 'leader';

-- Pooja is on her way to collect Ishaan.
set app.now = '2026-10-05 12:10:00+05:30';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000aa03"}';
set role authenticated;
select (public.start_trip('00000000-0000-0000-0000-0000000c00aa', 'pickup', 25)).id is not null as started;
-- A parent can't act at the gate.
do $$ begin
  perform public.gate_step((select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c00aa' and status = 'en_route'), 'ready');
  raise exception 'FAIL: a parent marked their own child ready';
exception when insufficient_privilege then null;
end $$;
reset role;

-- The front desk can't act at the gate either.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000aa04"}';
set role authenticated;
do $$ begin
  perform public.gate_step((select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c00aa' and status = 'en_route'), 'acknowledge');
  raise exception 'FAIL: the front desk acknowledged at the gate';
exception when insufficient_privilege then null;
end $$;
reset role;

-- The Center Leader sees the queue, acknowledges and marks Ready, but can't hand over or check in.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000aa01"}';
set role authenticated;
do $$
declare
  trip uuid := (select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c00aa' and status = 'en_route');
  t public.trips;
begin
  assert trip is not null, 'the Center Leader sees the trip in the queue';
  t := public.gate_step(trip, 'acknowledge');
  assert t.acknowledged_by = '00000000-0000-0000-0000-00000000aa01', 'acknowledged, recorded as Lata';
  t := public.gate_step(trip, 'ready');
  assert t.ready_at is not null and t.ready_by = '00000000-0000-0000-0000-00000000aa01', 'ready, recorded as Lata';
  begin
    perform public.gate_step(trip, 'close', '00000000-0000-0000-0000-00000000aa03');
    raise exception 'FAIL: a Center Leader handed a child over';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.gate_walk_in('00000000-0000-0000-0000-0000000c0002', 'dropoff');
    raise exception 'FAIL: a Center Leader checked a walk-in in';
  exception when insufficient_privilege then null;
  end;
  assert (select status from public.trips where id = trip) = 'en_route', 'still waiting for a coordinator';
end $$;
reset role;

-- The Center Coordinator hands Ishaan to Pooja; a second handover of the same trip is refused.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000aa02"}';
set role authenticated;
do $$
declare
  trip uuid := (select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c00aa' and status = 'en_route');
  t public.trips;
begin
  t := public.gate_step(trip, 'close', '00000000-0000-0000-0000-00000000aa03');
  assert t.status = 'handed_over' and t.closed_by = '00000000-0000-0000-0000-00000000aa02' and t.handed_to = '00000000-0000-0000-0000-00000000aa03', 'handed over by Kiran to Pooja';
  begin
    perform public.gate_step(trip, 'close', '00000000-0000-0000-0000-00000000aa03');
    raise exception 'FAIL: handed over twice';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.gate_step(trip, 'ready');
    raise exception 'FAIL: marked an ended trip ready';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

-- Drop-off: only the Center Coordinator checks in.
delete from public.trips where child_id = '00000000-0000-0000-0000-0000000c00aa';
delete from public.attendance where child_id = '00000000-0000-0000-0000-0000000c00aa';
set app.now = '2026-10-05 09:00:00+05:30';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000aa03"}';
set role authenticated;
select (public.start_trip('00000000-0000-0000-0000-0000000c00aa', 'dropoff', 10)).id is not null as started;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000aa01"}';
set role authenticated;
do $$ begin
  perform public.gate_step((select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c00aa' and status = 'en_route'), 'close');
  raise exception 'FAIL: a Center Leader checked a child in';
exception when insufficient_privilege then null;
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000aa02"}';
set role authenticated;
do $$
declare t public.trips;
begin
  t := public.gate_step((select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c00aa' and status = 'en_route'), 'close');
  assert t.status = 'checked_in' and t.closed_by = '00000000-0000-0000-0000-00000000aa02', 'checked in by Kiran';
  assert (select checked_in_at from public.attendance where child_id = '00000000-0000-0000-0000-0000000c00aa' and day = '2026-10-05') is not null, 'present today';
end $$;
reset role;

-- Someone else collecting: only the Center Coordinator may try the code; a guardian handover can't skip it.
set app.now = '2026-10-05 12:10:00+05:30';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000aa03"}';
set role authenticated;
create temp table invite as select (public.invite_collector('00000000-0000-0000-0000-0000000c00aa', 25, 'Ravi Driver', '+919800000001', 'Driver', null)) as j;
reset role;
grant select on invite to authenticated;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000aa01"}';
set role authenticated;
do $$
declare trip uuid := ((select j from invite) ->> 'trip_id')::uuid;
begin
  perform public.gate_step(trip, 'ready');
  begin
    perform public.gate_handover_code(trip, (select j from invite) ->> 'code');
    raise exception 'FAIL: a Center Leader used the collector''s code';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000aa02"}';
set role authenticated;
do $$
declare
  trip uuid := ((select j from invite) ->> 'trip_id')::uuid;
  r jsonb;
begin
  begin
    perform public.gate_step(trip, 'close', '00000000-0000-0000-0000-00000000aa03');
    raise exception 'FAIL: a collector''s pickup closed without the code';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'code_required%', sqlerrm;
  end;
  r := public.gate_handover_code(trip, '0000');
  assert not (r ->> 'ok')::boolean and (r ->> 'tries_left')::int = 2, 'a wrong code uses a try';
  r := public.gate_handover_code(trip, (select j from invite) ->> 'code');
  assert (r ->> 'ok')::boolean, 'the right code hands over';
  assert (select status from public.trips where id = trip) = 'handed_over', 'handed over';
  assert (select closed_by from public.trips where id = trip) = '00000000-0000-0000-0000-00000000aa02', 'recorded as Kiran';
end $$;
reset role;
reset app.now;

-- Removing one gate role keeps the classes while the person holds the other; removing both drops them. All audited.
insert into public.staff_roles values ('00000000-0000-0000-0000-00000000aa01', 'coordinator');
delete from public.staff_roles where profile_id = '00000000-0000-0000-0000-00000000aa01' and role = 'leader';
do $$ begin
  assert exists (select 1 from public.coordinator_classes where profile_id = '00000000-0000-0000-0000-00000000aa01'), 'classes kept with the other gate role';
end $$;
delete from public.staff_roles where profile_id = '00000000-0000-0000-0000-00000000aa01' and role = 'coordinator';
do $$ begin
  assert not exists (select 1 from public.coordinator_classes where profile_id = '00000000-0000-0000-0000-00000000aa01'), 'classes go with the last gate role';
  assert exists (select 1 from public.audit_log where table_name = 'staff_roles' and action = 'insert' and new_row ->> 'role' = 'leader'), 'giving Center Leader is audited';
  assert exists (select 1 from public.audit_log where table_name = 'staff_roles' and action = 'delete' and old_row ->> 'role' = 'leader'), 'removing Center Leader is audited';
end $$;
