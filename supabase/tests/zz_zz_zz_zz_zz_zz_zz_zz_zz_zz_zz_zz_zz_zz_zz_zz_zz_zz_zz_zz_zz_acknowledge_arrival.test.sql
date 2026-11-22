-- 0052: after "I've arrived", Acknowledge (or Ready) stops the arrival being announced again.
-- Its own people:  L  Lalita, Center Leader     P  Pallavi, parent of Arnav (Jr KG)
insert into public.profiles (id, full_name, active, phone) values
  ('00000000-0000-0000-0000-00000000dd01', 'Lalita Leader', true, '+919811300001'),
  ('00000000-0000-0000-0000-00000000dd02', 'Pallavi Parent', true, '+919811300002');
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-00000000dd01', '919811300001'), ('00000000-0000-0000-0000-00000000dd02', '919811300002');
update public.profiles set user_id = id where id in ('00000000-0000-0000-0000-00000000dd01', '00000000-0000-0000-0000-00000000dd02');
insert into public.staff_roles values ('00000000-0000-0000-0000-00000000dd01', 'leader');
insert into public.children (id, full_name, date_of_birth, class_id, programme_id) values
  ('00000000-0000-0000-0000-0000000c00dd', 'Arnav Rao', '2021-07-01', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001');
insert into public.guardianships values ('00000000-0000-0000-0000-0000000c00dd', '00000000-0000-0000-0000-00000000dd02', 'Mother');

create function pg_temp.as_who(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p)::text, false)
$$;
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-00000000dd02');
select (public.start_trip('00000000-0000-0000-0000-0000000c00dd', 'pickup', 0, 'Testing')).id is not null;
select pg_temp.as_who('00000000-0000-0000-0000-00000000dd01');
select public.gate_step((select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c00dd' and status = 'en_route'), 'acknowledge') is not null;
select pg_temp.as_who('00000000-0000-0000-0000-00000000dd02');
select public.arrive_trip((select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c00dd' and status = 'en_route')) is not null;
reset role;
do $$ begin
  assert (select arrived_at > acknowledged_at from public.trips where child_id = '00000000-0000-0000-0000-0000000c00dd' and status = 'en_route'), 'the arrival is new news for the gate';
end $$;
set role authenticated;
select pg_temp.as_who('00000000-0000-0000-0000-00000000dd01');
select public.gate_step((select id from public.trips where child_id = '00000000-0000-0000-0000-0000000c00dd' and status = 'en_route'), 'acknowledge') is not null;
reset role;
do $$ begin
  assert (select acknowledged_at >= arrived_at from public.trips where child_id = '00000000-0000-0000-0000-0000000c00dd' and status = 'en_route'), 'acknowledging the arrival stops it repeating';
end $$;
