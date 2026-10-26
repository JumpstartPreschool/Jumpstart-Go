-- Checks the 0060-0063 rollbacks on a throwaway database (never production):
--   DB_TESTS=scripts/rollback/verify-0060-0063.sql npm run test:db
\set ON_ERROR_STOP on
\i scripts/rollback/0063_duty_routing_fixes_down.sql
\i scripts/rollback/0062_attendance_reports_down.sql
\i scripts/rollback/0061_persistent_duty_down.sql
\i scripts/rollback/0060_phone_spoken_receipt_down.sql
do $$ begin
  assert to_regprocedure('public.attendance_report(date, date, uuid, uuid, uuid)') is null, 'reports gone';
  assert to_regclass('public.attendance_corrections') is not null, 'corrections history kept';
  assert to_regprocedure('public.set_duty(text, integer, text)') is null and to_regprocedure('public.my_duty()') is null, 'duty functions gone';
  assert to_regprocedure('public.gate_heartbeat(boolean)') is not null and to_regprocedure('public.gate_heartbeat(boolean, boolean)') is null, 'heartbeat as 0058';
  assert to_regprocedure('app.gate_team_for(uuid)') is null, 'routing as before';
  assert not public.push_receipt(1, gen_random_uuid(), 'spoken'), 'spoken refused again';
end $$;
-- The previous app's duty still works: a gate person checks in, then leaves the screen and is off duty.
insert into public.profiles (id, full_name, active, phone) values ('00000000-0000-0000-0000-0000000061b1', 'Rollback Leader', true, '+919811261001');
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000061b1', '919811261001');
update public.profiles set user_id = id where id = '00000000-0000-0000-0000-0000000061b1';
insert into public.staff_roles values ('00000000-0000-0000-0000-0000000061b1', 'leader');
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000061b1"}';
set role authenticated;
do $$ begin
  assert '00000000-0000-0000-0000-0000000061b1'::uuid = any (public.gate_heartbeat(true)), 'on duty after checking in';
  perform public.gate_heartbeat(false);
end $$;
reset role;
do $$ begin assert not exists (select 1 from app.gate_duty where profile_id = '00000000-0000-0000-0000-0000000061b1'), 'old behaviour restored'; end $$;
