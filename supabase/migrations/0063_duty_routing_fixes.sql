-- 0063: two fixes to 0061 from the release audit, kept apart so a database that already has 0061 gets them too.
--   1. gate_heartbeat keeps the old protocol for apps from before 0061 (a tablet keeps its version until someone taps
--      Update). They end duty with gate_heartbeat(false) and never send p_start, so with 0061 they could start duty but
--      never end it, and the "no signal" warning and reminders kept going to someone who had gone home. A call without
--      p_start is such an app: false ends its duty and true starts it, as in 0058. Today's app always sends
--      p_start = false: reachability only.
--   2. gate_team_for counts only people an alert can reach (active, with app access and a web subscription or phone
--      token: app.notify drops everyone else). Paused people are left out unless no reachable person would be told.
--      Before, a paused coordinator was dropped in favour of a colleague with no device, and nobody heard the request.
-- Rollback: scripts/rollback/0063_duty_routing_fixes_down.sql (the 0061 versions).

drop function public.gate_heartbeat(boolean, boolean);
create function public.gate_heartbeat(p_on boolean default true, p_start boolean default null) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.me();
begin
  if me is null or not app.is_gate() then
    raise exception 'Only the gate team can go on duty.' using errcode = '42501';
  end if;
  if p_start is null and not p_on then
    -- An app from before 0061 leaving its duty screen: that was End duty there.
    delete from app.gate_duty where profile_id = me;
  else
    update app.gate_duty set seen_at = now(), audible = p_on where profile_id = me;
    if not found and p_on and p_start is distinct from false then
      insert into app.gate_duty (profile_id, changed_by, change_reason) values (me, me, 'started') on conflict (profile_id) do nothing;
    end if;
  end if;
  return array(select profile_id from app.gate_duty where status = 'active' and audible and seen_at > now() - interval '75 seconds');
end $$;
revoke all on function public.gate_heartbeat(boolean, boolean) from public, anon;
grant execute on function public.gate_heartbeat(boolean, boolean) to authenticated;

create or replace function app.gate_team_for(p_child uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  with team as (select unnest(app.coordinators_for(p_child)) as id),
  told as (
    select t.id from team t join public.profiles p on p.id = t.id
    where p.active and p.app_access
      and (exists (select 1 from public.push_subscriptions s where s.profile_id = p.id)
           or exists (select 1 from public.device_tokens k where k.profile_id = p.id))
      and not exists (select 1 from app.gate_duty d where d.profile_id = p.id and d.status = 'paused'))
  select case when exists (select 1 from told) then array(select id from told) else array(select id from team) end
$$;
revoke all on function app.gate_team_for(uuid) from public, anon, authenticated;
