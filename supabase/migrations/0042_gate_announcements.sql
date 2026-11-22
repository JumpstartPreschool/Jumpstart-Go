-- 0042: Gate announcements the admin controls (owner, 2026-10-03): the wording of each announcement, the openings, and
-- when the gate hears them (Admin → Settings → Gate announcements).
--
-- How it works
--   * One row. A null wording means the built-in default (supabase/functions/_shared/gateAnnounce.ts), so Reset is
--     simply null, and a school that never changes anything keeps the defaults as they improve.
--   * Only the admin saves, through admin_save_gate_announcements, which checks each wording the same way the editor
--     does: only the listed {{variables}}, the child named, pickup or drop-off said, and the arrival time or state.
--     Every change is in the audit log (who, when, before and after).
--   * Gate staff read it (Center Leaders, Center Coordinators, the head office and the admin). Gate iPads hear about a
--     change at once (realtime) and use it from their next announcement.
--   * New wording re-records every child's announcements ahead (the voice queue, 0030); a sentence whose words didn't
--     change keeps its recording, because a clip is keyed by its exact words.
--   * The queue's order (arrived, then urgent, then outside the usual time, then the rest) stays fixed in the app.

create table public.gate_announcement_settings (
  id boolean primary key default true check (id),
  opening_new text,
  opening_urgent text,
  opening_reminder text,
  pickup_eta text,
  pickup_late text,
  pickup_arrived text,
  pickup_cancelled text,
  dropoff_eta text,
  dropoff_late text,
  dropoff_arrived text,
  dropoff_cancelled text,
  early_min integer not null default 15 check (early_min in (10, 15, 20)),
  ready_min integer not null default 10 check (ready_min in (5, 10, 15)),
  urgent_min integer not null default 5 check (urgent_min in (3, 5, 7)),
  reminder_min integer not null default 2 check (reminder_min in (1, 2, 3, 5)),
  check (early_min > ready_min and ready_min > urgent_min),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.gate_announcement_settings default values;

alter table public.gate_announcement_settings enable row level security;
create policy staff_read on public.gate_announcement_settings for select to authenticated using (app.is_staff());
revoke all on public.gate_announcement_settings from anon, authenticated;
grant select on public.gate_announcement_settings to authenticated;
create trigger audit after insert or update or delete on public.gate_announcement_settings for each row execute function app.audit();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.gate_announcement_settings;
  end if;
end $$;

-- Why a wording can't be used, in words for the admin; null when it can. The same rules as templateProblem in
-- gateAnnounce.ts, so the database refuses what the editor refuses even if the editor is bypassed.
create function app.gate_template_problem(p_key text, p_text text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  t text := btrim(coalesce(p_text, ''));
  bare text;
  used text[];
  allowed text[] := array['child_name', 'preferred_name', 'relation', 'direction', 'programme'];
  word text := case when p_key like 'pickup%' then '\mpick[ -]?up\M' else '\mdrop[ -]?off\M' end;
begin
  if p_key like '%_eta' or p_key like '%_late' then allowed := allowed || array['eta', 'minutes', 'arrival_time']; end if;
  if t = '' then return 'Write what the gate should hear.'; end if;
  if length(t) > 200 then return 'Keep it under 200 characters.'; end if;
  bare := regexp_replace(t, '\{\{\s*([a-z_]+)\s*\}\}', ' ', 'g');
  if bare ~ '[{}]' then return 'Each variable needs two braces on each side, like {{child_name}}.'; end if;
  if bare ~ '[^[:alnum:] .,''?!:;-]' then return 'Use letters, numbers and . , '' ? ! : ; - only.'; end if;
  used := array(select (regexp_matches(t, '\{\{\s*([a-z_]+)\s*\}\}', 'g'))[1]);
  if exists (select 1 from unnest(used) u where u <> all (allowed)) then return 'That variable can''t be used here.'; end if;
  if not used && array['child_name', 'preferred_name'] then return 'Include the child: {{child_name}} or {{preferred_name}}.'; end if;
  if not ('direction' = any (used)) and bare !~* word then return 'Say whether it''s a pickup or a drop-off, or include {{direction}}.'; end if;
  if (p_key like '%_eta' or p_key like '%_late') and not used && array['eta', 'minutes', 'arrival_time'] then return 'Include when they arrive: {{eta}}, {{minutes}} or {{arrival_time}}.'; end if;
  if p_key like '%_late' and bare !~* '\m(late|delayed|update)\M' then return 'Say they are running late.'; end if;
  if p_key like '%_arrived' and bare !~* '\m(arrived|here|at the gate)\M' then return 'Say they have arrived.'; end if;
  if p_key like '%_cancelled' and bare !~* 'cancel' then return 'Say it is cancelled.'; end if;
  return null;
end $$;
revoke execute on function app.gate_template_problem(text, text) from public;

-- Saves everything the editor shows at once. p: {"opening_new", …, "pickup_eta", …, "early_min", …}; a wording that is
-- null, missing or blank goes back to the default. Admin only.
create function public.admin_save_gate_announcements(p jsonb) returns public.gate_announcement_settings
language plpgsql security definer set search_path = '' as $$
declare
  old public.gate_announcement_settings;
  row public.gate_announcement_settings;
  k text;
  v text;
  problem text;
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can change gate announcements.' using errcode = '42501';
  end if;
  foreach k in array array['pickup_eta', 'pickup_late', 'pickup_arrived', 'pickup_cancelled', 'dropoff_eta', 'dropoff_late', 'dropoff_arrived', 'dropoff_cancelled'] loop
    v := nullif(btrim(coalesce(p ->> k, '')), '');
    if v is not null then
      problem := app.gate_template_problem(k, v);
      if problem is not null then
        raise exception 'bad_template: %', problem using errcode = 'P0001', detail = k;
      end if;
    end if;
  end loop;
  foreach k in array array['opening_new', 'opening_urgent', 'opening_reminder'] loop
    v := nullif(btrim(coalesce(p ->> k, '')), '');
    if v is not null and (length(v) not between 2 and 40 or v !~ '^[[:alnum:] ,''-]+[.!]$') then
      raise exception 'bad_opening: Each opening is one short sentence ending with a full stop, like "New announcement."' using errcode = 'P0001', detail = k;
    end if;
  end loop;

  select * into old from public.gate_announcement_settings;
  update public.gate_announcement_settings set
    opening_new = nullif(btrim(coalesce(p ->> 'opening_new', '')), ''),
    opening_urgent = nullif(btrim(coalesce(p ->> 'opening_urgent', '')), ''),
    opening_reminder = nullif(btrim(coalesce(p ->> 'opening_reminder', '')), ''),
    pickup_eta = nullif(btrim(coalesce(p ->> 'pickup_eta', '')), ''),
    pickup_late = nullif(btrim(coalesce(p ->> 'pickup_late', '')), ''),
    pickup_arrived = nullif(btrim(coalesce(p ->> 'pickup_arrived', '')), ''),
    pickup_cancelled = nullif(btrim(coalesce(p ->> 'pickup_cancelled', '')), ''),
    dropoff_eta = nullif(btrim(coalesce(p ->> 'dropoff_eta', '')), ''),
    dropoff_late = nullif(btrim(coalesce(p ->> 'dropoff_late', '')), ''),
    dropoff_arrived = nullif(btrim(coalesce(p ->> 'dropoff_arrived', '')), ''),
    dropoff_cancelled = nullif(btrim(coalesce(p ->> 'dropoff_cancelled', '')), ''),
    early_min = coalesce((p ->> 'early_min')::integer, 15),
    ready_min = coalesce((p ->> 'ready_min')::integer, 10),
    urgent_min = coalesce((p ->> 'urgent_min')::integer, 5),
    reminder_min = coalesce((p ->> 'reminder_min')::integer, 2),
    updated_at = now(),
    updated_by = app.me()
  where id
  returning * into row;

  -- New words: every child's announcements are recorded again ahead (only the sentences that changed cost anything).
  if (old.opening_new, old.opening_urgent, old.opening_reminder, old.pickup_eta, old.pickup_late, old.pickup_arrived, old.pickup_cancelled,
      old.dropoff_eta, old.dropoff_late, old.dropoff_arrived, old.dropoff_cancelled)
     is distinct from
     (row.opening_new, row.opening_urgent, row.opening_reminder, row.pickup_eta, row.pickup_late, row.pickup_arrived, row.pickup_cancelled,
      row.dropoff_eta, row.dropoff_late, row.dropoff_arrived, row.dropoff_cancelled) then
    -- At most 5 wording changes a day: each re-records voices against the monthly Azure cap (0035).
    if (select count(*) from app.throttle_log where key = 'gate-words' and at > now() - interval '1 day') >= 5 then
      raise exception 'too_many_changes: The wording can change 5 times a day, because each change records every child''s announcements again. Try again tomorrow; timings can still change.' using errcode = 'P0001';
    end if;
    insert into app.throttle_log (key) values ('gate-words');
    perform app.voice_requeue(array(select child_id from public.child_pronunciations));
  end if;
  return row;
exception
  when check_violation then
    raise exception 'bad_timing: The early announcement must come before Get ready, and Get ready before Urgent, using the listed times.' using errcode = 'P0001';
  when invalid_text_representation then
    raise exception 'bad_timing: Choose one of the listed times.' using errcode = 'P0001';
end $$;
revoke execute on function public.admin_save_gate_announcements(jsonb) from public, anon;
grant execute on function public.admin_save_gate_announcements(jsonb) to authenticated;
