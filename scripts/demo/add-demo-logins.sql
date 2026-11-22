-- Demo sign-ins for the team (temporary; remove with remove-demo-logins.sql). Ten demo parents on +91 90000 00001 to
-- +91 90000 00010, each the mother of one demo child, spread across the active programmes. Parents only: never give
-- these numbers a staff role, since their code is public (src/features/auth/demoLogins.ts). Safe to run again.
begin;
do $$ begin
  if exists (select 1 from public.profiles p where p.phone ~ '^\+9190000000(0[1-9]|10)$'
             and (p.full_name not like '% Demo' or exists (select 1 from public.staff_roles r where r.profile_id = p.id))) then
    raise exception 'Someone real has one of the demo numbers (+91 90000 00001 to 00010). Nothing was added.';
  end if;
end $$;
with kids(n, child, gender, parent) as (values
  (1, 'Aarav Demo', 'boy', 'Priya Demo'),     (2, 'Anaya Demo', 'girl', 'Sneha Demo'),
  (3, 'Vihaan Demo', 'boy', 'Kavya Demo'),    (4, 'Diya Demo', 'girl', 'Neha Demo'),
  (5, 'Arjun Demo', 'boy', 'Pooja Demo'),     (6, 'Ira Demo', 'girl', 'Meera Demo'),
  (7, 'Reyansh Demo', 'boy', 'Asha Demo'),    (8, 'Myra Demo', 'girl', 'Ritu Demo'),
  (9, 'Kabir Demo', 'boy', 'Anjali Demo'),    (10, 'Saanvi Demo', 'girl', 'Shruti Demo')
),
progs as (select id, row_number() over (order by name) - 1 as i, count(*) over () as total from public.programmes where active),
parents as (
  insert into public.profiles (full_name, phone, app_access)
  select parent, '+9190000000' || lpad(n::text, 2, '0'), true from kids
  on conflict (phone) do update set active = true, app_access = true
  returning id, phone
),
children as (
  insert into public.children (full_name, date_of_birth, programme_id, class_id, gender)
  select k.child, make_date(2022, k.n, 10), p.id, (select class_id from public.programmes where id = p.id), k.gender
  from kids k join progs p on p.i = (k.n - 1) % p.total
  where not exists (select 1 from public.children c where c.full_name = k.child)
  returning id, full_name
)
insert into public.guardianships (child_id, guardian_id, relation, kind)
select c.id, pa.id, 'Mother', 'parent'
from kids k join children c on c.full_name = k.child join parents pa on pa.phone = '+9190000000' || lpad(k.n::text, 2, '0')
on conflict do nothing;
commit;

select p.phone, p.full_name as parent, c.full_name as child, pr.name as programme
from public.profiles p join public.guardianships g on g.guardian_id = p.id join public.children c on c.id = g.child_id
join public.programmes pr on pr.id = c.programme_id
where p.phone ~ '^\+9190000000(0[1-9]|10)$' order by p.phone;
