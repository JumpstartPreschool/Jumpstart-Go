-- Rate limits (security review, 2026-09-25): bursts of time changes would flood the gate's iPads with alerts, and the
-- link calls need no sign-in. Generous limits that a real person never meets; a flood is refused with a clear message.

create table app.throttle_log (key text not null, at timestamptz not null default now());
create index on app.throttle_log (key, at);
revoke all on app.throttle_log from public, anon, authenticated;

-- At most p_max calls per p_window for one key; the call over the limit is refused (and not counted).
-- ponytail: one row per call in a table; move to a counter per key and window if the log ever grows large.
create function app.throttle(p_key text, p_max int, p_window interval) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from app.throttle_log where key = p_key and at > now() - p_window) >= p_max then
    raise exception 'rate_limited: That''s a lot of changes at once. Wait a minute and try again.' using errcode = 'P0001';
  end if;
  insert into app.throttle_log (key) values (p_key);
  delete from app.throttle_log where key = p_key and at < now() - p_window;
end $$;

-- Every new trip and every new time, whichever call it comes through: 40 a minute per person; from a link (no
-- sign-in), 6 an hour per trip.
create function app.throttle_trip() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.arrive_at is distinct from old.arrive_at then
    if app.me() is not null then perform app.throttle('trip:' || app.me(), 40, interval '1 minute');
    elsif current_user in ('anon', 'authenticated') then perform app.throttle('link:' || new.id, 6, interval '1 hour');
    end if;
  end if;
  return new;
end $$;
create trigger throttle_trip before insert or update of arrive_at on public.trips for each row execute function app.throttle_trip();

create function app.throttle_call() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.throttle('call:' || new.logged_by, 30, interval '1 minute');
  return new;
end $$;
create trigger throttle_call before insert on public.calls for each row execute function app.throttle_call();

-- Location from a link: 60 batches a minute per trip (a phone sends one every 5 to 10 seconds).
create or replace function public.link_share(p_token text, p_device text, p_points jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n int;
begin
  select * into r from app.link_for_device(p_token, p_device);
  perform app.throttle('share:' || (r.trip).id, 60, interval '1 minute');
  n := app.accept_points((r.trip).id, (r.trip).created_at, p_points);
  if not (r.trip).sharing then update public.trips set sharing = true where id = (r.trip).id; end if;
  return n;
end $$;

revoke all on function app.throttle(text, int, interval), app.throttle_trip(), app.throttle_call() from public, anon, authenticated;
