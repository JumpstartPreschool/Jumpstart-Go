-- Removes every demo sign-in from add-demo-logins.sql for good: the ten demo parents, their sign-in accounts, the demo
-- children and everything recorded about them (trips, attendance, messages, calls). Real people are never touched: only
-- people named "… Demo" on a demo number, and a child only when all its parents and family are such demo people.
begin;
create temp table demo_people on commit drop as
  select p.id, p.user_id from public.profiles p
  where p.phone ~ '^\+9190000000(0[1-9]|10)$' and p.full_name like '% Demo' and not exists (select 1 from public.staff_roles r where r.profile_id = p.id);
create temp table demo_kids on commit drop as
  select distinct g.child_id as id from public.guardianships g
  where g.guardian_id in (select id from demo_people)
    and not exists (select 1 from public.guardianships o where o.child_id = g.child_id and o.guardian_id not in (select id from demo_people));
-- Off the lists first, so the last-guardian guard lets their family go with them.
update public.children set active = false where id in (select id from demo_kids);
delete from public.children where id in (select id from demo_kids);
delete from public.messages where sender in (select id from demo_people);
delete from public.calls where guardian_id in (select id from demo_people);
delete from public.day_times where set_by in (select id from demo_people);
delete from public.profiles where id in (select id from demo_people);
delete from auth.users where id in (select user_id from demo_people where user_id is not null);
commit;

select count(*) as demo_people_left from public.profiles where phone ~ '^\+9190000000(0[1-9]|10)$';
