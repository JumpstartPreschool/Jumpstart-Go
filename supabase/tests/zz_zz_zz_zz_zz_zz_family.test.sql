-- 0028: parents add relatives, absences for several days, and the new staff names.
-- Aarav (c0001) has the parent-only account f7 from the voice tests. It is Friday 2 October 2026.
set app.now = '2026-10-02 08:00:00+05:30';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f7"}';
set role authenticated;

-- 1. A parent adds a relative, who joins the record as family; the same phone can't be added twice.
do $$
declare pid uuid;
begin
  pid := public.parent_add_relative('00000000-0000-0000-0000-0000000c0001', '{"full_name":"Sunita Mehta","relation":"Grandmother","phone":"+919812345670","email":"sunita@example.test"}');
  assert (select kind = 'family' and relation = 'Grandmother' from public.my_family() where guardian_id = pid), 'added as family';
  begin
    perform public.parent_add_relative('00000000-0000-0000-0000-0000000c0001', '{"full_name":"Someone Else","relation":"Uncle","phone":"+919812345670"}');
    raise exception 'FAIL: same phone added twice';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'already_registered%', sqlerrm;
  end;
  begin
    perform public.parent_add_relative('00000000-0000-0000-0000-0000000c0001', '{"full_name":"No Phone","relation":"Uncle"}');
    raise exception 'FAIL: no phone accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'phone_required%', sqlerrm;
  end;
  -- Parents can't be removed here, relatives can.
  begin
    perform public.parent_remove_relative('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000000f7');
    raise exception 'FAIL: a parent was removed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'not_family%', sqlerrm;
  end;
  perform public.parent_remove_relative('00000000-0000-0000-0000-0000000c0001', pid);
  assert not exists (select 1 from public.my_family() where guardian_id = pid), 'relative removed';
end $$;

-- 2. Not this child's parent: refused.
do $$ begin
  perform public.parent_add_relative('00000000-0000-0000-0000-0000000c0002', '{"full_name":"Not Mine","relation":"Aunt","phone":"+919812345671"}');
  raise exception 'FAIL: added to another child';
exception when insufficient_privilege then null;
end $$;

-- 3. A week off: school days are marked, Sunday isn't; too long or backwards is refused.
do $$
declare n int;
begin
  n := public.report_absence_range('00000000-0000-0000-0000-0000000c0001', '2026-10-05', '2026-10-11', 'Travelling');
  assert n between 1 and 6, format('marked %s days', n);
  assert (select count(*) from public.attendance where child_id = '00000000-0000-0000-0000-0000000c0001' and day between '2026-10-05' and '2026-10-11' and status = 'absent') = n, 'rows match';
  assert not exists (select 1 from public.attendance where child_id = '00000000-0000-0000-0000-0000000c0001' and day = '2026-10-11'), 'no Sunday';
  begin
    perform public.report_absence_range('00000000-0000-0000-0000-0000000c0001', '2026-10-05', '2026-11-20', 'Travelling');
    raise exception 'FAIL: 47 days accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'too_long%', sqlerrm;
  end;
  begin
    perform public.report_absence_range('00000000-0000-0000-0000-0000000c0001', '2026-10-09', '2026-10-05', 'Travelling');
    raise exception 'FAIL: backwards range accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'bad_day%', sqlerrm;
  end;
end $$;
reset role;

-- 4. Bulk upload without a date of birth: added, and the same name again without one is a duplicate.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$
declare kid uuid;
begin
  kid := public.import_child('{"full_name":"Ira Joshi","programme_id":"00000000-0000-0000-0000-00000000b001"}',
    '[{"full_name":"Neha Joshi","relation":"Mother","kind":"parent","phone":"+919876511111","app_access":false}]');
  assert (select date_of_birth is null from public.children where id = kid), 'no date of birth';
  begin
    perform public.import_child('{"full_name":"Ira Joshi","programme_id":"00000000-0000-0000-0000-00000000b001"}',
      '[{"full_name":"Neha Joshi","relation":"Mother","kind":"parent","phone":"+919876511111","app_access":false}]');
    raise exception 'FAIL: duplicate accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm = 'duplicate: Ira Joshi is already registered.', sqlerrm;
  end;
end $$;
reset role;

-- 5. The staff names changed in the database's messages too.
do $$ begin
  assert not exists (select 1 from pg_proc where prosrc like '%core team%' or prosrc like '%Only coordinators can%'), 'old names left';
end $$;
reset app.now;
