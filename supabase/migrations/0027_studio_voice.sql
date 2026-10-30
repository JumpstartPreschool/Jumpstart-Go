-- 0027: the studio voice for gate announcements (ElevenLabs, D43).
-- 1. voice_allowed(): only signed-in school staff can ask for announcement audio, at most 300 new requests an hour
--    each (the voice-say function asks before every call, so the key's quota can't be drained by one account).
-- 2. pronunciations: how the gate should say a name that comes out wrong ("Shreyas" → "Shrey-us"). School-wide, one
--    row per written word; the name shown on screen never changes. Staff read it, the admin edits it.
-- 3. voice-cache: a private Storage bucket holding each announcement's audio once, so repeats cost nothing.

create function public.voice_allowed() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_staff() then return false; end if;
  perform app.throttle('voice:' || app.me(), 300, interval '1 hour');
  return true;
end $$;
revoke all on function public.voice_allowed() from public, anon;
grant execute on function public.voice_allowed() to authenticated;

create table public.pronunciations (
  written text primary key check (written = lower(btrim(written)) and length(written) between 1 and 60 and written !~ '\s'),
  spoken text not null check (length(btrim(spoken)) between 1 and 80),
  set_by uuid references public.profiles (id),
  set_at timestamptz not null default now()
);
alter table public.pronunciations enable row level security;
create policy staff_read on public.pronunciations for select to authenticated using (app.is_staff());
grant select on public.pronunciations to authenticated;
revoke insert, update, delete on public.pronunciations from anon, authenticated;
create trigger audit after insert or update or delete on public.pronunciations for each row execute function app.audit();

/** Sets how a written word is said at the gate; an empty spoken form removes it. Admin only. */
create function public.admin_set_pronunciation(p_written text, p_spoken text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  w text := lower(btrim(coalesce(p_written, '')));
  s text := btrim(coalesce(p_spoken, ''));
begin
  if not app.has_role('admin') then
    raise exception 'Only the admin can change pronunciations.' using errcode = '42501';
  end if;
  if w = '' or w ~ '\s' or length(w) > 60 then
    raise exception 'bad_word: Enter one name, like Shreyas.' using errcode = 'P0001';
  end if;
  if s = '' then
    delete from public.pronunciations where written = w;
    return;
  end if;
  if length(s) > 80 then
    raise exception 'bad_spoken: Keep how it''s said under 80 letters.' using errcode = 'P0001';
  end if;
  insert into public.pronunciations (written, spoken, set_by) values (w, s, app.me())
  on conflict (written) do update set spoken = excluded.spoken, set_by = excluded.set_by, set_at = now();
end $$;
revoke all on function public.admin_set_pronunciation(text, text) from public, anon;
grant execute on function public.admin_set_pronunciation(text, text) to authenticated;

-- Private: only the voice-say function (service role) reads and writes it.
insert into storage.buckets (id, name, public) values ('voice-cache', 'voice-cache', false) on conflict (id) do nothing;
