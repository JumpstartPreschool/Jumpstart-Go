-- Gate announcements the admin controls (0042). Its own people:
--   A  Asha, admin     L  Leela, Center Leader     P  Pia, parent
set session_replication_role = replica;
insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-0000000f0a01', '919822200001'),
  ('00000000-0000-0000-0000-0000000f0a02', '919822200002'),
  ('00000000-0000-0000-0000-0000000f0a03', '919822200003');
insert into public.profiles (id, user_id, full_name, phone, active, app_access) values
  ('00000000-0000-0000-0000-0000000f0b01', '00000000-0000-0000-0000-0000000f0a01', 'Asha Admin', '+919822200001', true, true),
  ('00000000-0000-0000-0000-0000000f0b02', '00000000-0000-0000-0000-0000000f0a02', 'Leela Leader', '+919822200002', true, true),
  ('00000000-0000-0000-0000-0000000f0b03', '00000000-0000-0000-0000-0000000f0a03', 'Pia Parent', '+919822200003', true, true);
insert into public.staff_roles (profile_id, role) values
  ('00000000-0000-0000-0000-0000000f0b01', 'admin'),
  ('00000000-0000-0000-0000-0000000f0b02', 'leader');
set session_replication_role = origin;

-- Starts as all defaults (null wording) with the default timings.
do $$ begin
  assert (select count(*) from public.gate_announcement_settings) = 1, 'one row';
  assert (select pickup_eta is null and early_min = 15 and ready_min = 10 and urgent_min = 5 and reminder_min = 2 from public.gate_announcement_settings), 'defaults';
end $$;

-- The validator, the same rules as the editor.
do $$ begin
  assert app.gate_template_problem('pickup_eta', '{{child_name}}''s {{relation}} will arrive for pickup {{eta}}. Please get {{preferred_name}} ready.') is null, 'default pickup eta ok';
  assert app.gate_template_problem('dropoff_eta', '{{child_name}} will arrive for drop-off in about {{minutes}} minutes.') is null, 'minutes ok';
  assert app.gate_template_problem('pickup_eta', 'Someone is coming.') is not null, 'no child, no time';
  assert app.gate_template_problem('pickup_eta', '{{child_name}} is coming for pickup.') like 'Include when they arrive%', 'needs a time';
  assert app.gate_template_problem('pickup_eta', '{{child_name}} is coming {{eta}}.') like 'Say whether%', 'needs pickup';
  assert app.gate_template_problem('pickup_eta', '{{child_name}} for {{direction}} {{eta}}.') is null, 'direction variable counts';
  assert app.gate_template_problem('pickup_eta', '{{child_name}} pickup {{eta}} {{phone}}.') like 'That variable%', 'unknown variable';
  assert app.gate_template_problem('pickup_arrived', '{{child_name}} pickup {{eta}}.') like 'That variable%', 'eta not allowed on arrived';
  assert app.gate_template_problem('pickup_arrived', '{{child_name}} pickup soon.') like 'Say they have arrived%', 'arrived needs arrival';
  assert app.gate_template_problem('pickup_cancelled', 'Pickup for {{child_name}} is off.') like 'Say it is cancelled%', 'cancel word';
  assert app.gate_template_problem('pickup_eta', '{{child_name}} pickup {{eta}} <script>.') like 'Use letters%', 'no symbols';
  assert app.gate_template_problem('pickup_eta', '{{child_name}} pickup {eta}.') like 'Each variable%', 'single braces';
end $$;

-- A Center Leader reads the settings (to run the gate) but can't change them; a parent can't read them.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000f0a02"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.gate_announcement_settings) = 1, 'leader reads';
  begin
    perform public.admin_save_gate_announcements('{"early_min": 20}'::jsonb);
    raise exception 'a leader saved';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.gate_announcement_settings set pickup_eta = 'Someone is coming.';
    raise exception 'a leader wrote the table directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000f0a03"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.gate_announcement_settings) = 0, 'a parent read the settings';
end $$;
reset role;

-- The admin saves: good wording and timings are kept; the child voices are queued again for new words.
insert into public.children (full_name, date_of_birth, class_id, programme_id)
  select 'Ira Gate', '2022-01-01', p.class_id, p.id from public.programmes p where p.class_id is not null limit 1;
do $$ begin assert exists (select 1 from public.child_pronunciations), 'a child to re-record'; end $$;
update public.child_pronunciations set audio_status = 'ready';
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000f0a01"}';
set role authenticated;
do $$
declare r public.gate_announcement_settings;
begin
  r := public.admin_save_gate_announcements(jsonb_build_object(
    'pickup_eta', ' {{child_name}}''s {{relation}} is coming for pickup {{eta}}. Please get {{preferred_name}} ready. ',
    'opening_urgent', 'Urgent.', 'early_min', 20, 'ready_min', 10, 'urgent_min', 7, 'reminder_min', 3));
  assert r.pickup_eta = '{{child_name}}''s {{relation}} is coming for pickup {{eta}}. Please get {{preferred_name}} ready.', 'trimmed and kept';
  assert r.opening_urgent = 'Urgent.' and r.pickup_arrived is null, 'opening kept; untouched wording stays default';
  assert r.early_min = 20 and r.urgent_min = 7 and r.reminder_min = 3, 'timings kept';
  assert r.updated_by = '00000000-0000-0000-0000-0000000f0b01', 'who changed it';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.child_pronunciations where audio_status <> 'pending'), 'voices queued again';
  assert exists (select 1 from public.audit_log where table_name = 'gate_announcement_settings' and actor = '00000000-0000-0000-0000-0000000f0a01'), 'audited';
end $$;

-- Refused: a broken wording, timings out of order or off the list, and an opening that isn't one sentence.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000f0a01"}';
set role authenticated;
do $$ begin
  begin
    perform public.admin_save_gate_announcements('{"pickup_eta": "Someone is coming."}'::jsonb);
    raise exception 'saved a useless pickup wording';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'bad_template:%' then raise; end if;
  end;
  begin
    perform public.admin_save_gate_announcements('{"early_min": 10, "ready_min": 10, "urgent_min": 5}'::jsonb);
    raise exception 'saved timings out of order';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'bad_timing:%' then raise; end if;
  end;
  begin
    perform public.admin_save_gate_announcements('{"reminder_min": 4}'::jsonb);
    raise exception 'saved a reminder off the list';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'bad_timing:%' then raise; end if;
  end;
  begin
    perform public.admin_save_gate_announcements(jsonb_build_object('pickup_eta', E'{{child_name}} pickup\n{{eta}}.'));
    raise exception 'saved a wording with a line break';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'bad_template:%' then raise; end if;
  end;
  begin
    perform public.admin_save_gate_announcements('{"opening_new": "New {{child_name}}."}'::jsonb);
    raise exception 'saved an opening with a variable';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'bad_opening:%' then raise; end if;
  end;
  -- What was saved before is untouched by the refusals.
  assert (select early_min from public.gate_announcement_settings) = 20, 'unchanged after refusals';
end $$;

-- Reset: everything back to the defaults.
do $$
declare r public.gate_announcement_settings;
begin
  r := public.admin_save_gate_announcements('{}'::jsonb);
  assert r.pickup_eta is null and r.opening_urgent is null and r.early_min = 15 and r.reminder_min = 2, 'reset';
end $$;
reset role;

-- New wording at most 20 times a day (each one re-records every child against the Azure cap); timings any time.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000f0a01"}';
set role authenticated;
do $$
declare i int;
begin
  -- One wording change so far today (the save above; the reset isn't counted, 0045); nineteen more are allowed.
  for i in 1..19 loop perform public.admin_save_gate_announcements(jsonb_build_object('pickup_cancelled', format('Pickup for {{child_name}} is cancelled %s.', repeat('!', i)))); end loop;
  begin
    perform public.admin_save_gate_announcements('{"pickup_cancelled": "Pickup for {{child_name}} is cancelled now."}'::jsonb);
    raise exception 'a twenty-first wording change went through';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'too_many_changes:%' then raise; end if;
  end;
  perform public.admin_save_gate_announcements(jsonb_build_object('pickup_cancelled', format('Pickup for {{child_name}} is cancelled %s.', repeat('!', 19)), 'early_min', 20));
  assert (select early_min from public.gate_announcement_settings) = 20, 'timings still change';
end $$;
reset role;
