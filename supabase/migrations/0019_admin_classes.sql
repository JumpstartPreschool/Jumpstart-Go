-- The admin adds classes and their programmes, and every timing is set by hand (owner, 2026-09-25, PRD D35):
-- the hours, and the drop-off and pickup windows. The 15-minute rule (D24) is where a new timing starts, not a limit.
-- The core team still sets timings for the classes that exist; only the admin adds classes and programmes, renames a
-- programme, changes its days, or changes the Learning Center.

-- 1. A new class (a level, or a programme of its own). Programme names are "<Class> · <Plan>", so a class name can't hold "·".
create function public.admin_add_class(p_name text) returns public.classes
language plpgsql security definer set search_path = '' as $$
declare
  n text := btrim(coalesce(p_name, ''));
  c public.classes;
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can add classes.' using errcode = '42501';
  end if;
  if length(n) not between 1 and 60 or n like '%·%' then
    raise exception 'bad_name: Give the class a name of up to 60 letters, without "·".' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.classes where lower(name) = lower(n)) then
    raise exception 'taken: There is already a class called %.', n using errcode = 'P0001';
  end if;
  insert into public.classes (name, sort) values (n, coalesce((select max(sort) from public.classes), 0) + 1) returning * into c;
  return c;
end $$;

-- 2. Adds a programme to a class (p_programme null) or saves one. Null plan and days mean "keep them" when saving.
create function public.save_programme(
  p_programme uuid, p_class uuid, p_plan text, p_weekdays smallint[], p_saturday_rule public.saturday_rule,
  p_starts time, p_ends time, p_extended boolean,
  p_dropoff_from time, p_dropoff_to time, p_pickup_from time, p_pickup_to time
) returns public.programmes
language plpgsql security definer set search_path = '' as $$
declare
  admin boolean := app.has_role('admin');
  p public.programmes;
  cls public.classes;
  plan text := nullif(btrim(coalesce(p_plan, '')), '');
  full_name text;
begin
  if not app.is_planner() then
    raise exception 'Only the core team or the admin can change timings.' using errcode = '42501';
  end if;
  if p_programme is null or p_plan is not null or p_weekdays is not null or p_saturday_rule is not null then
    if not admin then
      raise exception 'Only the admin can add a programme or change its name or days.' using errcode = '42501';
    end if;
  end if;

  if p_programme is not null then
    select * into p from public.programmes where id = p_programme for update;
    if not found then raise exception 'gone: This programme no longer exists.' using errcode = 'P0001'; end if;
    if p.name like 'Learning Center%' and not admin then
      raise exception 'school_rule: The Learning Center''s times are the school''s rule. Ask the admin to change them.' using errcode = 'P0001';
    end if;
  end if;
  select * into cls from public.classes where id = coalesce(p.class_id, p_class) and active;
  if not found then raise exception 'gone: This class no longer exists.' using errcode = 'P0001'; end if;

  -- The name and days (admin only; checked above).
  if plan is not null and (length(plan) > 40 or plan like '%·%') then
    raise exception 'bad_name: Give the programme a name of up to 40 letters, without "·".' using errcode = 'P0001';
  end if;
  full_name := case when p_programme is null or p_plan is not null then cls.name || coalesce(' · ' || plan, '') else p.name end;
  if exists (select 1 from public.programmes where lower(name) = lower(full_name) and id is distinct from p_programme) then
    raise exception 'taken: % already has a programme called that.', cls.name using errcode = 'P0001';
  end if;
  if p_weekdays is not null and (cardinality(p_weekdays) not between 1 and 6 or not p_weekdays <@ '{1,2,3,4,5,6}') then
    raise exception 'bad_days: Choose the days, Monday to Saturday.' using errcode = 'P0001';
  end if;
  if p_programme is null and p_weekdays is null then
    raise exception 'bad_days: Choose the days, Monday to Saturday.' using errcode = 'P0001';
  end if;

  -- The hours, then each window (the gate is open 08:45–19:15).
  if p_starts is null or p_ends is null or p_starts < '09:00' or p_ends > '19:00' then
    raise exception 'outside_hours: Classes run inside 9:00 AM to 7:00 PM.' using errcode = 'P0001';
  end if;
  if p_ends < p_starts + interval '30 minutes' then
    raise exception 'too_short: A class needs at least 30 minutes between start and end.' using errcode = 'P0001';
  end if;
  if p_dropoff_from is null or p_dropoff_to is null or p_pickup_from is null or p_pickup_to is null then
    raise exception 'no_window: Set both the drop-off and the pickup times.' using errcode = 'P0001';
  end if;
  if p_dropoff_from < '08:45' or p_pickup_to > '19:15' then
    raise exception 'outside_gate: The gate is open from 8:45 AM to 7:15 PM.' using errcode = 'P0001';
  end if;
  if p_dropoff_from >= p_dropoff_to then
    raise exception 'bad_dropoff: Drop-off must end after it starts.' using errcode = 'P0001';
  end if;
  if p_pickup_from >= p_pickup_to then
    raise exception 'bad_pickup: Pickup must end after it starts.' using errcode = 'P0001';
  end if;
  if p_dropoff_to > p_ends then
    raise exception 'bad_dropoff: Drop-off must close by the time the class ends.' using errcode = 'P0001';
  end if;
  if p_pickup_from < p_starts then
    raise exception 'bad_pickup: Pickup can''t open before the class starts.' using errcode = 'P0001';
  end if;

  if p_programme is null then
    insert into public.programmes (name, class_id, weekdays, saturday_rule, starts, ends, extended, flexible,
      dropoff_from, dropoff_to, pickup_from, pickup_to)
    values (full_name, cls.id, p_weekdays, coalesce(p_saturday_rule, 'every'), p_starts, p_ends, coalesce(p_extended, false), false,
      p_dropoff_from, p_dropoff_to, p_pickup_from, p_pickup_to)
    returning * into p;
  else
    update public.programmes set name = full_name, weekdays = coalesce(p_weekdays, weekdays), saturday_rule = coalesce(p_saturday_rule, saturday_rule),
      starts = p_starts, ends = p_ends, extended = coalesce(p_extended, extended), flexible = false,
      dropoff_from = p_dropoff_from, dropoff_to = p_dropoff_to, pickup_from = p_pickup_from, pickup_to = p_pickup_to
    where id = p_programme returning * into p;
  end if;
  return p;
end $$;

revoke all on function public.admin_add_class(text),
  public.save_programme(uuid, uuid, text, smallint[], public.saturday_rule, time, time, boolean, time, time, time, time) from public, anon;
grant execute on function public.admin_add_class(text),
  public.save_programme(uuid, uuid, text, smallint[], public.saturday_rule, time, time, boolean, time, time, time, time) to authenticated;
