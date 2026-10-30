-- What a parent may know beyond their own rows, as little as possible: how busy the gate is at each time today (counts
-- only, D15), and who else is on their own children's records (names and relations, never contact details).

-- Children expected at the gate today, per time, in one direction: a changed time, else the regular time. Children who
-- are away, already done, or on the way (counted at their arrival) are included as the gate will see them.
create function public.gate_load(p_direction public.trip_direction) returns table (at time, children int)
language sql stable security definer set search_path = '' as $$
  with d as (select app.today() as day, extract(isodow from app.today())::smallint as wd)
  select x.at, count(*)::int
  from (
    select coalesce(
             (select (t.arrive_at at time zone 'Asia/Kolkata')::time from public.trips t
                where t.child_id = c.id and t.day = d.day and t.direction = p_direction and t.status = 'en_route'),
             (select dt.at from public.day_times dt where dt.child_id = c.id and dt.day = d.day and dt.direction = p_direction),
             (select case when p_direction = 'pickup' then s.pickup else s.dropoff end from public.child_schedules s where s.child_id = c.id and s.weekday = d.wd)
           ) as at
    from public.children c, d
    where c.active and app.me() is not null and app.runs_on(c.programme_id, d.day)
      and not exists (select 1 from public.attendance a where a.child_id = c.id and a.day = d.day and a.status <> 'present')
      and not exists (select 1 from public.trips t where t.child_id = c.id and t.day = d.day and t.direction = p_direction and t.status in ('handed_over', 'checked_in'))
  ) x
  where x.at is not null
  group by x.at
$$;

-- The other parents and family on the caller's children's records.
create function public.my_family() returns table (child_id uuid, full_name text, relation text, kind public.guardian_kind, abroad boolean, has_app boolean)
language sql stable security definer set search_path = '' as $$
  select g.child_id, p.full_name, g.relation, g.kind, p.abroad, p.app_access and p.user_id is not null
  from public.guardianships g
  join public.profiles p on p.id = g.guardian_id and p.active
  join public.children c on c.id = g.child_id and c.active
  where g.guardian_id <> app.me() and app.is_guardian_of(g.child_id)
  order by g.kind, p.full_name
$$;

revoke all on function public.gate_load(public.trip_direction), public.my_family() from public, anon;
grant execute on function public.gate_load(public.trip_direction), public.my_family() to authenticated;
