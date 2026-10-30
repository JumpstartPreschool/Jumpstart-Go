-- 0032: the school's voice computer registers itself. Each time it starts (at login, or after its network changes) it
-- tells the pronounce function its current tunnel address; pronounce checks that the address answers as the school
-- voice, then saves it here and starts any waiting work. Nobody has to update a setting when the computer is turned on,
-- and the computer needs no database password: only its own voice secret.

alter table app.voice_config add column tts_url text, add column tts_seen_at timestamptz;

/** Saves the voice computer's current address and starts waiting work now. Only the pronounce function calls it. */
create function public.voice_register(p_url text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_url !~ '^https://[a-z0-9.-]+(:[0-9]+)?/?$' then
    raise exception 'bad_url: The voice address must be a plain https address.' using errcode = 'P0001';
  end if;
  update app.voice_config set tts_url = rtrim(p_url, '/'), tts_seen_at = now(), kicked_at = null;
  if not found then
    raise exception 'not_linked: Run the voice deploy once so the database knows the pronounce function.' using errcode = 'P0001';
  end if;
  perform app.kick_voice();
end $$;

/** The voice computer's last registered address (null before it first registers). */
create function public.voice_tts_url() returns text
language sql stable security definer set search_path = '' as $$
  select tts_url from app.voice_config
$$;

revoke all on function public.voice_register(text), public.voice_tts_url() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.voice_register(text), public.voice_tts_url() to service_role;
  end if;
end $$;
