-- 0030 and 0035: the gate voice. People from foundation.test.sql: a1 admin, c1 core, d1 coordinator; child c0001.
-- Earlier files give the first parent staff roles, so this file adds its own parent-only account (v1).
insert into public.profiles (id, full_name, email) values ('00000000-0000-0000-0000-0000000000f7', 'Voice Parent', 'voice.parent@example.test');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f7', 'voice.parent@example.test');
insert into public.guardianships values ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000000f7', 'Mother');

-- 1. Every child has a pronunciation row, queued for its clips (adding a guardian above queued it again).
do $$ begin
  assert (select count(*) from public.children) = (select count(*) from public.child_pronunciations), 'a row per child';
  assert (select audio_status from public.child_pronunciations where child_id = '00000000-0000-0000-0000-0000000c0001') = 'pending', 'queued';
end $$;

-- 2. Staff may ask for announcement audio and read pronunciations; parents may do neither.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$ begin
  assert public.voice_spend(40), 'coordinator may preview';
  assert (select count(*) from public.voice_usage) = 0, 'only the admin sees usage';
  assert (select count(*) from public.child_pronunciations) > 0, 'coordinator reads';
end $$;
-- Coordinators listen but don't change.
do $$ begin
  perform public.set_child_pronunciation('00000000-0000-0000-0000-0000000c0001', 'Aa-rav', true);
  raise exception 'FAIL: a coordinator set a pronunciation';
exception when insufficient_privilege then null;
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f7"}';
set role authenticated;
do $$ begin
  assert (select count(*) from public.child_pronunciations) = 0, 'parent sees none';
  assert public.voice_version() is null, 'parent sees no voice version';
  begin
    perform public.voice_spend(40);
    raise exception 'FAIL: a parent spent voice characters';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  perform public.set_child_pronunciation('00000000-0000-0000-0000-0000000c0001', 'Aa-rav', true);
  raise exception 'FAIL: a parent set a pronunciation';
exception when insufficient_privilege then null;
end $$;
-- The background functions are the pronounce function's alone.
do $$ begin
  perform public.voice_claim(5);
  raise exception 'FAIL: a user claimed voice work';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 3. The core team saves and approves a pronunciation; new words queue new clips; the registered name is untouched.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
set role authenticated;
do $$
declare name_before text := (select full_name from public.children where id = '00000000-0000-0000-0000-0000000c0001');
declare rev int := (select revision from public.child_pronunciations where child_id = '00000000-0000-0000-0000-0000000c0001');
begin
  perform public.set_child_pronunciation('00000000-0000-0000-0000-0000000c0001', '  Aa-rav   Test ', true);
  assert (select spoken_name from public.child_pronunciations where child_id = '00000000-0000-0000-0000-0000000c0001') = 'Aa-rav Test', 'tidied';
  assert (select approved and approved_by = '00000000-0000-0000-0000-0000000000c1' from public.child_pronunciations where child_id = '00000000-0000-0000-0000-0000000c0001'), 'approved by core';
  assert (select revision from public.child_pronunciations where child_id = '00000000-0000-0000-0000-0000000c0001') = rev + 1, 'new words requeue';
  assert (select full_name from public.children where id = '00000000-0000-0000-0000-0000000c0001') = name_before, 'registered name unchanged';
  -- Approving the same words doesn't make them again.
  perform public.set_child_pronunciation('00000000-0000-0000-0000-0000000c0001', 'Aa-rav Test', true);
  assert (select revision from public.child_pronunciations where child_id = '00000000-0000-0000-0000-0000000c0001') = rev + 1, 'same words, no requeue';
  -- Symbols are refused.
  begin
    perform public.set_child_pronunciation('00000000-0000-0000-0000-0000000c0001', '<script>', false);
    raise exception 'FAIL: symbols accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'bad_spoken%', sqlerrm;
  end;
  -- The registered name itself, or nothing, means "say it as registered".
  perform public.set_child_pronunciation('00000000-0000-0000-0000-0000000c0001', name_before, true);
  assert (select spoken_name is null from public.child_pronunciations where child_id = '00000000-0000-0000-0000-0000000c0001'), 'as registered';
end $$;
reset role;

-- 4. Background making: claim, a stale result ignored, three failures then failed, Try again, success.
do $$
declare kid constant uuid := '00000000-0000-0000-0000-0000000c0001';
declare rev int;
begin
  update public.child_pronunciations set next_attempt_at = now() - interval '1 second' where child_id = kid;
  select c.revision into rev from public.voice_claim(50) c where c.child_id = kid;
  assert rev is not null, 'claimed';
  assert (select audio_status from public.child_pronunciations where child_id = kid) = 'generating', 'generating';
  assert not exists (select 1 from public.voice_claim(50) c where c.child_id = kid), 'not claimed twice';

  -- The child changed while the run was making clips: its result doesn't mark the new words ready.
  perform app.voice_requeue(array[kid]);
  perform public.voice_finish(kid, rev, true);
  assert (select audio_status from public.child_pronunciations where child_id = kid) = 'pending', 'stale result ignored';

  -- A run that ran out of time hands the child back at once, with no try used up.
  select c.revision into rev from public.voice_claim(50) c where c.child_id = kid;
  perform public.voice_finish(kid, rev, null);
  assert (select audio_status = 'pending' and attempts = 0 and next_attempt_at <= now() from public.child_pronunciations where child_id = kid), 'out of time, no try used';

  for i in 1..3 loop
    update public.child_pronunciations set next_attempt_at = now() - interval '1 second' where child_id = kid;
    select c.revision into rev from public.voice_claim(50) c where c.child_id = kid;
    perform public.voice_finish(kid, rev, false);
  end loop;
  assert (select audio_status = 'failed' and attempts = 3 from public.child_pronunciations where child_id = kid), 'failed after three';
  update public.child_pronunciations set next_attempt_at = now() - interval '1 hour' where child_id = kid;
  assert not exists (select 1 from public.voice_claim(50) c where c.child_id = kid), 'failed is not retried by itself';
end $$;

set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
select public.retry_child_voice('00000000-0000-0000-0000-0000000c0001');
reset role;
do $$
declare kid constant uuid := '00000000-0000-0000-0000-0000000c0001';
declare rev int;
begin
  assert (select audio_status = 'pending' and attempts = 0 from public.child_pronunciations where child_id = kid), 'try again';
  select c.revision into rev from public.voice_claim(50) c where c.child_id = kid;
  perform public.voice_finish(kid, rev, true);
  assert (select audio_status from public.child_pronunciations where child_id = kid) = 'ready', 'ready';
end $$;

-- 5. A new registered name clears the old pronunciation and queues fresh clips.
do $$
declare kid constant uuid := '00000000-0000-0000-0000-0000000c0001';
declare old_name text := (select full_name from public.children where id = kid);
begin
  update public.child_pronunciations set spoken_name = 'Aa-rav', approved = true where child_id = kid;
  update public.children set full_name = old_name || ' Renamed' where id = kid;
  assert (select spoken_name is null and not approved and audio_status = 'pending' from public.child_pronunciations where child_id = kid), 'renamed';
  update public.children set full_name = old_name where id = kid;
end $$;

do $$ begin
  assert exists (select 1 from storage.buckets where id = 'voice-audio' and not public), 'private audio bucket';
  assert to_regclass('public.pronunciations') is null, 'old word list removed';
end $$;

-- 6. The school computer's registration is gone; the voice version is readable by staff only.
do $$ begin
  assert to_regprocedure('public.voice_register(text)') is null and to_regprocedure('public.voice_tts_url()') is null, 'registration removed';
  insert into public.voice_meta (key, value) values ('voice', 'azure|en-IN-NeerjaNeural|mp3-24k') on conflict (key) do update set value = excluded.value;
end $$;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$ begin
  assert public.voice_version() = 'azure|en-IN-NeerjaNeural|mp3-24k', 'staff read the voice version';
end $$;
reset role;

-- 7. The monthly Azure cap: counted before Azure is called, never past 450,000, and a new month starts at 0.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$
declare m constant date := date_trunc('month', (now() at time zone 'utc')::date);
begin
  -- 0036: 0 is a check only (a clip already made): allowed, and nothing is counted.
  assert public.voice_spend(0), 'a check only is allowed';
  assert (select count(*) from public.voice_usage) = 0 or (select chars from public.voice_usage where month = m) = 40, 'a check only counts nothing';
  begin
    perform public.voice_spend(-1);
    raise exception 'FAIL: a negative length counted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'bad_length%', sqlerrm;
  end;
  begin
    perform public.voice_spend(401);
    raise exception 'FAIL: a 401-character sentence counted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'bad_length%', sqlerrm;
  end;
  assert public.voice_spend(60), 'admin allowed';
  assert (select chars from public.voice_usage where month = m) = 100, 'coordinator 40 + admin 60';
  assert (select chars from public.voice_usage_days where day = (now() at time zone 'utc')::date) = 100, 'counted by day too';
end $$;
reset role;
update public.voice_usage set chars = 449950 where month = date_trunc('month', (now() at time zone 'utc')::date);
do $$
declare m constant date := date_trunc('month', (now() at time zone 'utc')::date);
begin
  assert public.voice_count(50), 'the background maker may reach the cap exactly';
  assert (select chars from public.voice_usage where month = m) = 450000, 'at the cap';
  assert not public.voice_count(1), 'past the cap is refused';
  assert (select chars from public.voice_usage where month = m) = 450000, 'a refused request is not counted';
  update public.voice_usage set month = (m - interval '1 month')::date;
  assert public.voice_count(10), 'a new month starts again';
  assert (select chars from public.voice_usage where month = m) = 10, 'fresh month';
  delete from public.voice_usage;
  delete from public.voice_usage_days;
end $$;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
set role authenticated;
do $$ begin
  perform public.voice_count(10);
  raise exception 'FAIL: a user called the background count';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 8. "I've arrived": the child's family only, once, while the trip is open. Rolled back, so later tests see nothing.
begin;
do $$
declare kid constant uuid := '00000000-0000-0000-0000-0000000c0001';
declare trip uuid;
begin
  delete from public.trips where child_id = kid;
  insert into public.trips (child_id, direction, day, arrive_at, created_by, traveller_name, traveller_relation)
  values (kid, 'pickup', (now() at time zone 'Asia/Kolkata')::date, now() + interval '10 minutes', '00000000-0000-0000-0000-0000000000f7', 'Voice Parent', 'Mother')
  returning id into trip;
  perform set_config('test.trip', trip::text, false);
end $$;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
do $$ begin
  perform public.arrive_trip(current_setting('test.trip')::uuid);
  raise exception 'FAIL: a coordinator said the parent arrived';
exception when insufficient_privilege then null;
end $$;
reset role;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f7"}';
set role authenticated;
do $$
declare first timestamptz;
begin
  first := (public.arrive_trip(current_setting('test.trip')::uuid)).arrived_at;
  assert first is not null, 'arrived';
  assert (public.arrive_trip(current_setting('test.trip')::uuid)).arrived_at = first, 'a second tap keeps the first time';
end $$;
do $$ begin
  perform public.cancel_trip(current_setting('test.trip')::uuid);
  perform public.arrive_trip(current_setting('test.trip')::uuid);
  raise exception 'FAIL: arrived on a finished trip';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
reset role;
rollback;
