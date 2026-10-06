-- 0051: who is on duty at the gate. Gate team only; on duty for 75 seconds after the last check-in; off at once on leaving.
insert into public.profiles (id, full_name, active, phone, user_id) values
  ('00000000-0000-0000-0000-00000000cc01', 'Sunita Gate', true, '+919811200001', null),
  ('00000000-0000-0000-0000-00000000cc02', 'Rekha Parent', true, '+919811200002', null);
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-00000000cc01', '919811200001'), ('00000000-0000-0000-0000-00000000cc02', '919811200002');
update public.profiles set user_id = id where id in ('00000000-0000-0000-0000-00000000cc01', '00000000-0000-0000-0000-00000000cc02');
insert into public.staff_roles values ('00000000-0000-0000-0000-00000000cc01', 'leader');

set role authenticated;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000cc01"}';
do $$ begin
  assert '00000000-0000-0000-0000-00000000cc01'::uuid = any (public.gate_heartbeat(true)), 'on duty after checking in';
end $$;
reset role;
update app.gate_duty set seen_at = now() - interval '80 seconds' where profile_id = '00000000-0000-0000-0000-00000000cc01';
set role authenticated;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000cc02"}';
do $$ begin
  perform public.gate_heartbeat(true);
  raise exception 'FAIL: a parent went on duty';
exception when insufficient_privilege then null;
end $$;
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000cc01"}';
do $$
declare ids uuid[];
begin
  ids := public.gate_heartbeat(false);
  assert not ('00000000-0000-0000-0000-00000000cc01'::uuid = any (ids)), 'off duty after leaving';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from app.gate_duty where profile_id = '00000000-0000-0000-0000-00000000cc01'), 'gone from the list';
end $$;
