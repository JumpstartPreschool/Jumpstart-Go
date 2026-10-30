-- 0051: who is on duty at the gate right now. A class counted as covered whenever someone was assigned to it, so a
-- coordinator at home (or with the screen locked) made every other gate phone wait 2 minutes before announcing that
-- class's children (gate.ts FALLBACK_MS). Each gate phone on duty now checks in every 30 seconds; a class is covered only
-- while one of its assigned coordinators has checked in within the last 75 seconds.

create table app.gate_duty (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table app.gate_duty enable row level security;

-- On duty (p_on) or off it; returns who is on duty now. Gate team only.
create function public.gate_heartbeat(p_on boolean default true) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.me();
begin
  if me is null or not app.is_gate() then
    raise exception 'Only the gate team can go on duty.' using errcode = '42501';
  end if;
  if p_on then
    insert into app.gate_duty (profile_id) values (me) on conflict (profile_id) do update set seen_at = now();
  else
    delete from app.gate_duty where profile_id = me;
  end if;
  delete from app.gate_duty where seen_at < now() - interval '1 day';
  return array(select profile_id from app.gate_duty where seen_at > now() - interval '75 seconds');
end $$;
revoke execute on function public.gate_heartbeat(boolean) from public, anon;
grant execute on function public.gate_heartbeat(boolean) to authenticated;
