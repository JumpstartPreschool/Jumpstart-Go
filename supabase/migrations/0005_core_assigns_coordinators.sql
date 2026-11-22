-- The core team (and the admin) choose who is a coordinator and which classes each coordinator hears
-- (PRD D11, D16, D23). The core team can give or remove only the Coordinator role: Admin and Core team
-- stay with the admin, so nobody can raise their own access.

create policy core_give_coordinator on public.staff_roles for insert to authenticated
  with check (app.has_role('core') and role = 'coordinator');
create policy core_remove_coordinator on public.staff_roles for delete to authenticated
  using (app.has_role('core') and role = 'coordinator');
create policy core_write on public.coordinator_classes for all to authenticated
  using (app.has_role('core')) with check (app.has_role('core'));

-- Only coordinators have classes, and removing the role removes their classes with it.
create function app.check_coordinator_class() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.staff_roles where profile_id = new.profile_id and role = 'coordinator') then
    raise exception 'not_a_coordinator: give this person the Coordinator role first' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger check_coordinator_class before insert or update on public.coordinator_classes
  for each row execute function app.check_coordinator_class();

create function app.drop_coordinator_classes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.coordinator_classes where profile_id = old.profile_id;
  return old;
end $$;
create trigger drop_coordinator_classes after delete on public.staff_roles
  for each row when (old.role = 'coordinator') execute function app.drop_coordinator_classes();

-- Makes someone a coordinator (if they aren't yet) and sets exactly these classes, in one step.
-- SECURITY INVOKER: row-level security above decides who may do it.
create function public.set_coordinator(p_profile uuid, p_classes uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_profile and active) then
    raise exception 'That person''s access is turned off, or they are no longer registered.' using errcode = 'P0001';
  end if;
  insert into public.staff_roles (profile_id, role) values (p_profile, 'coordinator') on conflict do nothing;
  delete from public.coordinator_classes where profile_id = p_profile and class_id <> all (coalesce(p_classes, '{}'));
  insert into public.coordinator_classes (profile_id, class_id)
    select p_profile, c from unnest(coalesce(p_classes, '{}')) as c
    on conflict do nothing;
end $$;

revoke all on function public.set_coordinator(uuid, uuid[]) from public, anon;
grant execute on function public.set_coordinator(uuid, uuid[]) to authenticated;
