-- 0019: the admin adds classes and programmes; drop-off and pickup are set by hand; the core team only changes timings.
-- People from foundation.test.sql: a1 admin, c1 core, e1 parent. Programmes b001 (Jr KG · Half day), b002 (Learning Center).

-- 1. Only the admin adds a class; names are checked.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  perform public.admin_add_class('Toddlers');
  raise exception 'FAIL: the core team added a class';
exception when insufficient_privilege then null;
end $$;
reset role;

set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$
declare
  c public.classes;
  p public.programmes;
begin
  c := public.admin_add_class('  Toddlers ');
  assert c.name = 'Toddlers' and c.sort = (select max(sort) from public.classes), 'added last, trimmed';
  begin
    perform public.admin_add_class('toddlers');
    raise exception 'FAIL: the same class twice';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'taken%', sqlerrm;
  end;
  begin
    perform public.admin_add_class('A · B');
    raise exception 'FAIL: a class name with a dot';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'bad_name%', sqlerrm;
  end;

  -- 2. The admin adds a programme to it with windows set by hand.
  p := public.save_programme(null, c.id, 'Mornings', '{1,2,3,4,5}', 'every', '10:00', '12:00', false, '09:40', '10:10', '11:50', '12:20');
  assert p.name = 'Toddlers · Mornings' and p.class_id = c.id and not p.flexible, 'named after the class';
  assert p.dropoff_from = '09:40' and p.dropoff_to = '10:10' and p.pickup_from = '11:50' and p.pickup_to = '12:20', 'windows as given';
  begin
    perform public.save_programme(null, c.id, 'mornings', '{1,2,3,4,5}', 'every', '10:00', '12:00', false, '09:40', '10:10', '11:50', '12:20');
    raise exception 'FAIL: the same programme twice';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'taken%', sqlerrm;
  end;

  -- 3. Windows are checked: inside the gate day, in order, and reachable from the class hours.
  begin
    perform public.save_programme(p.id, null, null, null, null, '10:00', '12:00', false, '08:30', '10:00', '12:00', '12:15');
    raise exception 'FAIL: drop-off before the gate opens';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'outside_gate%', sqlerrm;
  end;
  begin
    perform public.save_programme(p.id, null, null, null, null, '10:00', '12:00', false, '10:00', '09:45', '12:00', '12:15');
    raise exception 'FAIL: drop-off ends before it starts';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'bad_dropoff%', sqlerrm;
  end;
  begin
    perform public.save_programme(p.id, null, null, null, null, '10:00', '12:00', false, '09:45', '10:00', '09:30', '12:15');
    raise exception 'FAIL: pickup before the class starts';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'bad_pickup%', sqlerrm;
  end;
  begin
    perform public.save_programme(p.id, null, null, null, null, '10:00', '12:00', false, '09:45', '10:00', '12:00', '19:30');
    raise exception 'FAIL: pickup after the gate closes';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'outside_gate%', sqlerrm;
  end;

  -- 4. The admin may change the Learning Center.
  p := public.save_programme('00000000-0000-0000-0000-00000000b002', null, null, null, null, '09:00', '19:00', true, '08:45', '09:15', '09:00', '19:00');
  assert p.dropoff_to = '09:15' and not p.flexible, 'Learning Center changed by the admin';
end $$;
reset role;

-- 5. The core team changes timings, but not names, days or the Learning Center; parents can't at all.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$
declare p public.programmes;
begin
  p := public.save_programme('00000000-0000-0000-0000-00000000b001', null, null, null, null, '09:00', '13:00', false, '08:50', '09:10', '12:55', '13:20');
  assert p.dropoff_from = '08:50' and p.pickup_to = '13:20' and p.name = 'Jr KG · Half day', 'core team set the windows';
  begin
    perform public.save_programme('00000000-0000-0000-0000-00000000b001', null, 'Renamed', null, null, '09:00', '13:00', false, '08:50', '09:10', '12:55', '13:20');
    raise exception 'FAIL: the core team renamed a programme';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_programme('00000000-0000-0000-0000-00000000b002', null, null, null, null, '09:00', '19:00', true, '08:45', '09:00', '09:00', '19:00');
    raise exception 'FAIL: the core team changed the Learning Center';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'school_rule%', sqlerrm;
  end;
end $$;
reset role;

set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
set role authenticated;
do $$ begin
  perform public.save_programme('00000000-0000-0000-0000-00000000b001', null, null, null, null, '09:00', '13:00', false, '08:45', '09:00', '13:00', '13:15');
  raise exception 'FAIL: a parent changed timings';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 6. Every change is in the audit log.
do $$ begin
  assert (select count(*) from public.audit_log where table_name = 'classes' and action = 'insert' and new_row->>'name' = 'Toddlers') = 1, 'class audited';
  assert exists (select 1 from public.audit_log where table_name = 'programmes' and action = 'insert' and new_row->>'name' = 'Toddlers · Mornings'), 'programme audited';
end $$;
