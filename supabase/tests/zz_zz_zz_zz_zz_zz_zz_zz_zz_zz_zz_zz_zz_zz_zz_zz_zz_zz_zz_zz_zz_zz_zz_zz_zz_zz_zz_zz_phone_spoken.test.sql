-- 0060: the Android app reports a gate alert spoken aloud. People and trips from push_delivery.test.sql: Asha (59a01)
-- covers Ishaan, whose pickup is trip 59d02; her phone's token is repeat('z', 40).
delete from app.push_outbox;
delete from app.gate_heard where profile_id = '00000000-0000-0000-0000-000000059a01';
do $$ begin
  perform app.notify(array['00000000-0000-0000-0000-000000059a01']::uuid[], 'Reminder: Ishaan, pickup at 4:15 PM', 'Waiting.', '/coordinator', 'trip-00000000-0000-0000-0000-000000059d02');
  perform app.notify(array['00000000-0000-0000-0000-000000059a01']::uuid[], 'Ishaan has been collected', 'At 4:20 PM.', '/parent', 'trip-00000000-0000-0000-0000-000000059d02');
end $$;

do $$ declare gate app.push_outbox; parent app.push_outbox; begin
  select * into gate from app.push_outbox where url = '/coordinator' and device_id = (select id from public.device_tokens where token = repeat('z', 40));
  select * into parent from app.push_outbox where url = '/parent' and device_id = (select id from public.device_tokens where token = repeat('z', 40));
  assert gate.id is not null and parent.id is not null, 'one row each for the phone';
  assert not public.push_receipt(gate.id, gen_random_uuid(), 'spoken'), 'a wrong receipt is refused';
  assert not public.push_receipt(gate.id, gate.receipt, 'played'), 'an unknown event is still refused';
  assert not exists (select 1 from app.gate_heard where profile_id = gate.profile_id), 'nothing heard yet';

  assert public.push_receipt(gate.id, gate.receipt, 'spoken'), 'spoken';
  assert (select spoken_at is not null and displayed_at is not null and opened_at is null from app.push_outbox where id = gate.id), 'spoken implies displayed, not opened';
  assert exists (select 1 from app.gate_heard where trip_id = '00000000-0000-0000-0000-000000059d02' and profile_id = gate.profile_id), 'the gate request counts as heard';

  update app.push_outbox set spoken_at = now() - interval '1 minute' where id = gate.id;
  assert public.push_receipt(gate.id, gate.receipt, 'spoken'), 'a replay is accepted';
  assert (select spoken_at < now() - interval '30 seconds' from app.push_outbox where id = gate.id), 'the first time is kept';
  assert (select count(*) from app.gate_heard where profile_id = gate.profile_id) = 1, 'one heard row per person and trip';

  -- A parent's alert about the same trip is never a gate announcement.
  delete from app.gate_heard where profile_id = gate.profile_id;
  assert public.push_receipt(parent.id, parent.receipt, 'spoken'), 'recorded';
  assert not exists (select 1 from app.gate_heard where profile_id = gate.profile_id), 'but not as heard at the gate';
end $$;

set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000059a01"}';
set role authenticated;
do $$ begin
  perform public.push_receipt(1, gen_random_uuid(), 'spoken');
  raise exception 'FAIL: a signed-in person called push_receipt directly';
exception when insufficient_privilege then null;
end $$;
reset role;
