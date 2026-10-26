-- Undoes 0063: gate_heartbeat and gate_team_for as in 0061. Run before 0061_persistent_duty_down.sql when undoing both.
begin;
drop function public.gate_heartbeat(boolean, boolean);
create function public.gate_heartbeat(p_on boolean default true, p_start boolean default true) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.me();
begin
  if me is null or not app.is_gate() then
    raise exception 'Only the gate team can go on duty.' using errcode = '42501';
  end if;
  update app.gate_duty set seen_at = now(), audible = p_on where profile_id = me;
  if not found and p_on and p_start then
    insert into app.gate_duty (profile_id, changed_by, change_reason) values (me, me, 'started') on conflict (profile_id) do nothing;
  end if;
  return array(select profile_id from app.gate_duty where status = 'active' and audible and seen_at > now() - interval '75 seconds');
end $$;
revoke all on function public.gate_heartbeat(boolean, boolean) from public, anon;
grant execute on function public.gate_heartbeat(boolean, boolean) to authenticated;

create or replace function app.gate_team_for(p_child uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(array(select x from unnest(team) x
    where not exists (select 1 from app.gate_duty d where d.profile_id = x and d.status = 'paused')), '{}'), team)
  from (select app.coordinators_for(p_child) as team) t
$$;
revoke all on function app.gate_team_for(uuid) from public, anon, authenticated;
commit;
