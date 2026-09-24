-- 0013: attendance, today's time, programme hours, regular times, messages, announcements, calls, saved people.
-- People from foundation.test.sql and zz_levels_family_desk.test.sql: a1 admin, c1 core, d1 coordinator, b1 front desk,
-- e1 parent of Aarav c0001 (Jr KG c001, programme b001: drop 09:00–09:30, pickup 12:30–13:00), e2 parent of Meera c0002
-- (Learning Center c002, b002). Tuesday 29 Sep 2026, 11:00.
set app.now = '2026-09-29 11:00:00+05:30';

-- 1. Attendance: the core team marks Aarav absent and his open pickup is cancelled; parents can't mark attendance.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
set role authenticated;
do $$ begin perform public.start_trip('00000000-0000-0000-0000-0000000c0001', 'pickup', 100); end $$;
do $$ begin
  perform public.set_attendance('00000000-0000-0000-0000-0000000c0001', '2026-09-29', 'absent', 'Unwell');
  raise exception 'FAIL: a parent marked attendance';
exception when insufficient_privilege then null;
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  perform public.set_attendance('00000000-0000-0000-0000-0000000c0001', '2026-09-29', 'absent', 'Unwell');
  assert (select status = 'cancelled' from public.trips where child_id = '00000000-0000-0000-0000-0000000c0001' and day = '2026-09-29' and direction = 'pickup'), 'trip cancelled';
  perform public.set_attendance('00000000-0000-0000-0000-0000000c0001', '2026-09-29', 'present');
end $$;
reset role;

-- 2. A parent reports an absence and takes it back; one the school set stays with the school.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$ begin
  perform public.report_absence('00000000-0000-0000-0000-0000000c0002', '2026-09-30', 'Family event');
  assert (select status = 'absent' and note = 'Family event' from public.attendance where child_id = '00000000-0000-0000-0000-0000000c0002' and day = '2026-09-30'), 'reported';
  perform public.undo_absence('00000000-0000-0000-0000-0000000c0002', '2026-09-30');
  assert not exists (select 1 from public.attendance where child_id = '00000000-0000-0000-0000-0000000c0002' and day = '2026-09-30'), 'taken back';
  begin
    perform public.report_absence('00000000-0000-0000-0000-0000000c0002', '2026-09-28', 'Late note');
    raise exception 'FAIL: absence in the past';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'bad_day%', sqlerrm;
  end;
  begin
    perform public.report_absence('00000000-0000-0000-0000-0000000c0001', '2026-09-30', 'Not my child');
    raise exception 'FAIL: absence for someone else''s child';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin perform public.set_attendance('00000000-0000-0000-0000-0000000c0002', '2026-10-01', 'on_leave', 'Holiday'); end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$ begin
  perform public.undo_absence('00000000-0000-0000-0000-0000000c0002', '2026-10-01');
  raise exception 'FAIL: parent undid the school''s mark';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  assert sqlerrm like 'not_yours%', sqlerrm;
end $$;
reset role;

-- 3. Today's time: inside the window, outside it with a reason; it moves an open trip; the desk can't set it directly.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
set role authenticated;
do $$
declare r public.day_times;
begin
  perform public.start_trip('00000000-0000-0000-0000-0000000c0001', 'pickup', 100);
  r := public.change_day_time('00000000-0000-0000-0000-0000000c0001', 'pickup', '12:45');
  assert r.reason is null, 'inside the window';
  assert (select arrive_at = '2026-09-29 12:45:00+05:30' and not off_schedule from public.trips where child_id = '00000000-0000-0000-0000-0000000c0001' and day = '2026-09-29' and direction = 'pickup' and status = 'en_route'), 'trip moved';
  begin
    perform public.change_day_time('00000000-0000-0000-0000-0000000c0001', 'pickup', '14:00');
    raise exception 'FAIL: outside the window without a reason';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'reason_required%', sqlerrm;
  end;
  r := public.change_day_time('00000000-0000-0000-0000-0000000c0001', 'pickup', '14:00', 'Doctor''s visit');
  assert r.reason = 'Doctor''s visit', 'flagged with its reason';
  begin
    perform public.change_day_time('00000000-0000-0000-0000-0000000c0001', 'pickup', '11:02', 'Now');
    raise exception 'FAIL: a time in two minutes';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'too_soon%', sqlerrm;
  end;
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1"}';
set role authenticated;
do $$ begin
  perform public.change_day_time('00000000-0000-0000-0000-0000000c0001', 'pickup', '12:50');
  raise exception 'FAIL: the desk changed a time without a call';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 4. Programme hours: windows are worked out from them (D24); the Learning Center is the school's rule.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$
declare p public.programmes;
begin
  p := public.set_programme_hours('00000000-0000-0000-0000-00000000b001', '09:30', '13:30', false);
  assert p.dropoff_from = '09:15' and p.dropoff_to = '09:30' and p.pickup_from = '13:30' and p.pickup_to = '13:45', 'the 15 minutes either side';
  p := public.set_programme_hours('00000000-0000-0000-0000-00000000b001', '11:45', '17:30', true);
  assert p.dropoff_from = '09:00' and p.pickup_to = '19:00' and p.extended, 'extended day: from 9, until 7';
  p := public.set_programme_hours('00000000-0000-0000-0000-00000000b001', '09:00', '13:00', false);
  assert p.dropoff_from = '08:45' and p.pickup_to = '13:15', 'back to half day';
  begin
    perform public.set_programme_hours('00000000-0000-0000-0000-00000000b002', '09:00', '18:00', true);
    raise exception 'FAIL: changed the Learning Center';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'school_rule%', sqlerrm;
  end;
  begin
    perform public.set_programme_hours('00000000-0000-0000-0000-00000000b001', '09:00', '09:15', false);
    raise exception 'FAIL: a 15-minute class';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'too_short%', sqlerrm;
  end;

  -- 5. Regular times, every day the programme runs, inside the windows.
  perform public.set_regular_times('00000000-0000-0000-0000-0000000c0001', '08:50', '13:10');
  assert (select count(*) from public.child_schedules where child_id = '00000000-0000-0000-0000-0000000c0001') = 5, 'Monday to Friday';
  begin
    perform public.set_regular_times('00000000-0000-0000-0000-0000000c0001', '10:00', '13:10');
    raise exception 'FAIL: regular time outside the window';
  exception when check_violation then null;
  end;
end $$;
reset role;
-- The earlier tests' windows for Aarav's programme, as they were.
update public.programmes set dropoff_from = '09:00', dropoff_to = '09:30', pickup_from = '12:30', pickup_to = '13:00' where id = '00000000-0000-0000-0000-00000000b001';

-- 6. Messages: the family and the office; not coordinators, not other parents.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$
declare m public.messages;
begin
  m := public.send_message('00000000-0000-0000-0000-0000000c0002', ' Meera has a cough today. ');
  assert m.sender_role = 'parent' and m.body = 'Meera has a cough today.' and m.sender_name = 'Parent B', 'parent message';
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1"}';
set role authenticated;
do $$
declare m public.messages;
begin
  assert (select count(*) from public.messages where child_id = '00000000-0000-0000-0000-0000000c0002') = 1, 'desk reads it';
  m := public.send_message('00000000-0000-0000-0000-0000000c0002', 'Thanks, we''ll keep an eye on her.');
  assert m.sender_role = 'pro', 'desk replies as the front desk';
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.messages) = 0, 'coordinators don''t read family messages';
  perform public.send_message('00000000-0000-0000-0000-0000000c0002', 'Hello');
  raise exception 'FAIL: a coordinator wrote to a family';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 7. Announcements: to one class reaches only that class's parents; to everyone reaches all.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$
declare a public.announcements;
begin
  a := public.send_announcement('Jr KG sports day', 'Sports day is on Friday. Please send your child in white.', '00000000-0000-0000-0000-00000000c001');
  perform set_config('test.ann', a.id::text, false);
  perform public.send_announcement('Early closing', 'The school closes at 5 PM on Friday for Dussehra.');
  assert public.recipient_count(null) >= 2, 'all parents with the app';
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.announcements) = 1 and (select title from public.announcements) = 'Early closing', 'Learning Center parent sees only the one for everyone';
  perform public.mark_announcement_read(current_setting('test.ann')::uuid);
  assert (select count(*) from public.announcement_reads) = 0, 'can''t mark read what wasn''t sent to them';
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.announcements) = 2, 'Jr KG parent sees both';
  perform public.mark_announcement_read(current_setting('test.ann')::uuid);
end $$;
do $$ begin
  perform public.send_announcement('Nope', 'Parents can''t announce things.');
  raise exception 'FAIL: a parent sent an announcement';
exception when insufficient_privilege then null;
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$ begin
  assert (select reads = 1 from public.announcement_stats() where announcement_id = current_setting('test.ann')::uuid), 'one read';
end $$;
reset role;

-- 8. Logged calls: any staff member, done in one step; parents don't see the call log.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1"}';
set role authenticated;
do $$ begin
  perform public.log_call('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000000e2', 'absent', p_reason => 'Unwell');
  assert (select status = 'absent' and reported_by = '00000000-0000-0000-0000-0000000000e2' from public.attendance where child_id = '00000000-0000-0000-0000-0000000c0002' and day = '2026-09-29'), 'absent, as the father said';
  perform public.log_call('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000000e2', 'note', p_note => 'Bringing her water bottle tomorrow');
  assert (select count(*) from public.calls) = 2, 'both logged';
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.calls) = 0, 'parents don''t see the call log';
  -- The father can take back the absence he phoned in.
  perform public.undo_absence('00000000-0000-0000-0000-0000000c0002', '2026-09-29');
end $$;
reset role;

-- 9. Saved people are the owner's alone.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
set role authenticated;
insert into public.saved_people (owner, full_name, phone, relation) values ('00000000-0000-0000-0000-0000000000e2', 'Ramesh Driver', '+919812345678', 'Driver');
do $$ begin
  perform public.set_my_notifications(false, true);
  assert (select not notify_morning from public.profiles where id = '00000000-0000-0000-0000-0000000000e2'), 'morning reminder off';
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.saved_people) = 0, 'someone else''s saved people are private';
  insert into public.saved_people (owner, full_name, phone, relation) values ('00000000-0000-0000-0000-0000000000e2', 'Sneaky', '+919812345679', 'Driver');
  raise exception 'FAIL: saved a person for someone else';
exception when insufficient_privilege then null;
end $$;
reset role;
