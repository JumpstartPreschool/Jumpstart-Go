-- 0030: the gate voice made on the school's own computer (D48), replacing the cloud studio voice (0027, D43).
-- 1. child_pronunciations: one row per child. How the voice says the child's name (null = as registered), whether a
--    person has listened and approved it, and whether the child's everyday announcement clips are made. The child's
--    registered name never changes. Staff read it; the admin and head office edit it (set_child_pronunciation).
-- 2. Background making: adding a child, or changing their name, pronunciation, class or collectors, marks the child
--    'pending'. The pronounce function claims pending children (voice_claim), makes their clips, and reports back
--    (voice_finish): three tries a minute or four apart, then 'failed' until someone taps Try again. No endless retries.
-- 3. voice-audio: a private bucket holding each sentence's clip once, by hash. Staff read it straight from the iPad.
-- 4. The school-wide word list (pronunciations, 0027) is folded into each matching child's row, then removed.

create table public.child_pronunciations (
  child_id uuid primary key references public.children (id) on delete cascade,
  spoken_name text check (spoken_name is null or length(btrim(spoken_name)) between 1 and 120),
  approved boolean not null default false,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  audio_status text not null default 'pending' check (audio_status in ('pending', 'generating', 'ready', 'failed')),
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  -- Raised by every change, so a clip-making run that started before the change can't mark the new words ready.
  revision int not null default 0,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create index child_pronunciations_queue on public.child_pronunciations (next_attempt_at) where audio_status in ('pending', 'generating');
alter table public.child_pronunciations enable row level security;
create policy staff_read on public.child_pronunciations for select to authenticated using (app.is_staff());
grant select on public.child_pronunciations to authenticated;
revoke insert, update, delete on public.child_pronunciations from anon, authenticated;
-- Only what people change is audited, not the background status updates.
create trigger audit after insert or delete or update of spoken_name, approved on public.child_pronunciations
  for each row execute function app.audit();

-- Every child has a row. The old word list becomes each matching child's pronunciation, to be listened to and approved.
insert into public.child_pronunciations (child_id, spoken_name)
select c.id, nullif(s.spoken, regexp_replace(btrim(c.full_name), '\s+', ' ', 'g'))
from public.children c
cross join lateral (
  select string_agg(coalesce(p.spoken, w.word), ' ' order by w.ord) as spoken
  from regexp_split_to_table(btrim(c.full_name), '\s+') with ordinality as w(word, ord)
  left join public.pronunciations p on p.written = lower(w.word)
) s;

drop function public.admin_set_pronunciation(text, text);
drop table public.pronunciations;

-- Where the pronounce function lives, and the secret the database sends it (set once, as for push: environments.md).
create table app.voice_config (id boolean primary key default true check (id), url text not null, secret text not null);
revoke all on app.voice_config from public, anon, authenticated;

/** Asks the pronounce function to make pending clips now; the minute job below catches anything missed. */
create function app.kick_voice() returns void
language plpgsql security definer set search_path = '' as $$
declare cfg app.voice_config;
begin
  select * into cfg from app.voice_config;
  if found and exists (select 1 from pg_extension where extname = 'pg_net') then
    execute 'select net.http_post(url := $1, headers := $2, body := ''{"drain":true}''::jsonb)'
      using cfg.url, jsonb_build_object('Authorization', 'Bearer ' || cfg.secret, 'Content-Type', 'application/json');
  end if;
end $$;

/** These children's clips need making again (new words): three fresh tries, starting now. */
create function app.voice_requeue(p_children uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(cardinality(p_children), 0) = 0 then return; end if;
  update public.child_pronunciations
     set audio_status = 'pending', attempts = 0, next_attempt_at = now(), revision = revision + 1
   where child_id = any (p_children);
  perform app.kick_voice();
end $$;

-- What changes a child's everyday sentences: their name or class, a class's name, and who collects them.
create function app.voice_on_child() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.child_pronunciations (child_id) values (new.id) on conflict (child_id) do nothing;
    perform app.kick_voice();
    return null;
  end if;
  -- A new registered name makes the old pronunciation wrong: back to saying it as registered, to be listened to again.
  if new.full_name is distinct from old.full_name then
    update public.child_pronunciations set spoken_name = null, approved = false, approved_by = null, approved_at = null
     where child_id = new.id;
  end if;
  perform app.voice_requeue(array[new.id]);
  return null;
end $$;
create trigger voice after insert or update of full_name, preferred_name, class_id, active on public.children
  for each row execute function app.voice_on_child();

create function app.voice_on_guardianship() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.voice_requeue(array[coalesce(new.child_id, old.child_id)]);
  return null;
end $$;
create trigger voice after insert or update or delete on public.guardianships
  for each row execute function app.voice_on_guardianship();

create function app.voice_on_class() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.voice_requeue(array(select id from public.children where class_id = new.id));
  return null;
end $$;
create trigger voice after update of name on public.classes for each row execute function app.voice_on_class();

create function app.voice_on_person() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.voice_requeue(array(select child_id from public.guardianships where guardian_id = new.id));
  return null;
end $$;
create trigger voice after update of full_name on public.profiles for each row execute function app.voice_on_person();

/**
 * How the gate says a child's name. p_spoken: the name written the way it sounds ("Aa-raadh-ya Sharma"); empty or the
 * registered name itself means "say it as registered". p_approve: a person has listened and it sounds right.
 * Admin and head office only. New words are made in the background; the child's name on screen never changes.
 */
create function public.set_child_pronunciation(p_child uuid, p_spoken text, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s text := nullif(btrim(regexp_replace(coalesce(p_spoken, ''), '\s+', ' ', 'g')), '');
  registered text;
  before text;
begin
  if not app.has_role('admin', 'core') then
    raise exception 'Only the admin or head office can change how a name is said.' using errcode = '42501';
  end if;
  perform app.throttle('pronunciation:' || app.me(), 120, interval '1 hour');
  select full_name into registered from public.children where id = p_child;
  if not found then
    raise exception 'not_found: That child isn''t on record.' using errcode = 'P0001';
  end if;
  if s is not null and (length(s) > 120 or s ~ '[<>{}\[\]\\/@#$%^&*_=+|~`"]' or s ~ '[[:cntrl:]]') then
    raise exception 'bad_spoken: Use letters, spaces and hyphens only, up to 120 characters.' using errcode = 'P0001';
  end if;
  if lower(s) = lower(btrim(registered)) then s := null; end if;

  select spoken_name into before from public.child_pronunciations where child_id = p_child;
  insert into public.child_pronunciations (child_id) values (p_child) on conflict (child_id) do nothing;
  update public.child_pronunciations
     set spoken_name = s,
         approved = coalesce(p_approve, false),
         approved_by = case when p_approve then app.me() end,
         approved_at = case when p_approve then now() end,
         updated_by = app.me(),
         updated_at = now()
   where child_id = p_child;
  if s is distinct from before then perform app.voice_requeue(array[p_child]); end if;
end $$;

/** Try making a child's clips again after they failed (the Try again button). Admin and head office only. */
create function public.retry_child_voice(p_child uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_role('admin', 'core') then
    raise exception 'Only the admin or head office can do this.' using errcode = '42501';
  end if;
  perform app.throttle('pronunciation:' || app.me(), 120, interval '1 hour');
  perform app.voice_requeue(array[p_child]);
end $$;

/**
 * The pronounce function takes up to p_limit children whose clips are due (or whose earlier run stalled for 10
 * minutes) and marks them generating. Returns each child with the revision it's making.
 */
create function public.voice_claim(p_limit int default 5) returns table (child_id uuid, revision int)
language sql security definer set search_path = '' as $$
  update public.child_pronunciations p set audio_status = 'generating', claimed_at = now()
  where p.child_id in (
    select q.child_id from public.child_pronunciations q join public.children c on c.id = q.child_id and c.active
    where (q.audio_status = 'pending' and q.next_attempt_at <= now())
       or (q.audio_status = 'generating' and q.claimed_at < now() - interval '10 minutes')
    order by q.next_attempt_at limit p_limit for update of q skip locked
  )
  returning p.child_id, p.revision
$$;

/**
 * The run's result for a child: true made, false failed, null ran out of time (back in the queue, no try used up).
 * Ignored if the child changed meanwhile (a newer revision is already pending).
 * A failure is tried again after 1 and then 4 minutes; the third failure stays failed until Try again.
 */
create function public.voice_finish(p_child uuid, p_revision int, p_ok boolean) returns void
language sql security definer set search_path = '' as $$
  update public.child_pronunciations
     set audio_status = case when p_ok then 'ready' when p_ok is null then 'pending' when attempts + 1 >= 3 then 'failed' else 'pending' end,
         attempts = case when p_ok then 0 when p_ok is null then attempts else attempts + 1 end,
         next_attempt_at = case when p_ok then next_attempt_at when p_ok is null then now() else now() + make_interval(mins => (attempts + 1) * (attempts + 1)) end,
         claimed_at = null
   where child_id = p_child and revision = p_revision
$$;

/** A new voice (model, speaker or settings): every child's clips are made again. The pronounce function calls it. */
create function public.voice_requeue_all() returns void
language sql security definer set search_path = '' as $$
  select app.voice_requeue(array(select child_id from public.child_pronunciations))
$$;

-- The shared phrases' voice version, so they're made once per voice (the pronounce function reads and writes it).
create table public.voice_meta (key text primary key, value text not null, updated_at timestamptz not null default now());
alter table public.voice_meta enable row level security;
revoke all on public.voice_meta from anon, authenticated;

revoke all on function app.kick_voice(), app.voice_requeue(uuid[]), app.voice_on_child(), app.voice_on_guardianship(),
  app.voice_on_class(), app.voice_on_person() from public, anon, authenticated;
revoke all on function public.voice_claim(int), public.voice_finish(uuid, int, boolean), public.voice_requeue_all() from public, anon, authenticated;
revoke all on function public.set_child_pronunciation(uuid, text, boolean), public.retry_child_voice(uuid) from public, anon;
grant execute on function public.set_child_pronunciation(uuid, text, boolean), public.retry_child_voice(uuid) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.voice_claim(int), public.voice_finish(uuid, int, boolean), public.voice_requeue_all() to service_role;
    grant select, insert, update on public.voice_meta to service_role;
  end if;
end $$;

-- The clips: private, one file per sentence (sentences/<sha256>.mp3). Staff read them straight from the iPad; only the
-- pronounce function (service role) writes. The old studio voice's bucket (voice-cache) is emptied and deleted by hand.
insert into storage.buckets (id, name, public) values ('voice-audio', 'voice-audio', false) on conflict (id) do nothing;
do $$ begin
  if to_regclass('storage.objects') is not null then
    create policy voice_audio_staff_read on storage.objects for select to authenticated
      using (bucket_id = 'voice-audio' and app.is_staff());
  end if;
end $$;

-- Coordinators' iPads hear about approved pronunciations at once.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.child_pronunciations;
  end if;
end $$;

-- Every minute while something is waiting, and every 10 minutes regardless (so a new voice version is noticed).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('voice-drain', '* * * * *', $job$
      select net.http_post(url := c.url, headers := jsonb_build_object('Authorization', 'Bearer ' || c.secret, 'Content-Type', 'application/json'), body := '{"drain":true}'::jsonb)
      from app.voice_config c
      where extract(minute from now())::int % 10 = 0
         or exists (select 1 from public.child_pronunciations p
                    where (p.audio_status = 'pending' and p.next_attempt_at <= now())
                       or (p.audio_status = 'generating' and p.claimed_at < now() - interval '10 minutes'))
    $job$);
  end if;
end $$;
