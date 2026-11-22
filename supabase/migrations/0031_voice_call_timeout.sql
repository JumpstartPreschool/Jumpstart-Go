-- 0031: the database waits for the pronounce function's whole run. pg_net gives up after 5 s by default, while a run
-- making clips on the school computer takes up to 150 s (the function's limit); waiting keeps the run from depending on
-- how Supabase treats a caller that hung up.

create or replace function app.kick_voice() returns void
language plpgsql security definer set search_path = '' as $$
declare cfg app.voice_config;
begin
  update app.voice_config set kicked_at = now()
   where kicked_at is null or kicked_at < now() - interval '20 seconds'
  returning * into cfg;
  if found and exists (select 1 from pg_extension where extname = 'pg_net') then
    execute 'select net.http_post(url := $1, headers := $2, body := ''{"drain":true}''::jsonb, timeout_milliseconds := 150000)'
      using cfg.url, jsonb_build_object('Authorization', 'Bearer ' || cfg.secret, 'Content-Type', 'application/json');
  end if;
end $$;
revoke all on function app.kick_voice() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('voice-drain') where exists (select 1 from cron.job where jobname = 'voice-drain');
    perform cron.schedule('voice-drain', '* * * * *', $job$
      select net.http_post(url := c.url, headers := jsonb_build_object('Authorization', 'Bearer ' || c.secret, 'Content-Type', 'application/json'), body := '{"drain":true}'::jsonb, timeout_milliseconds := 150000)
      from app.voice_config c
      where extract(minute from now())::int % 10 = 0
         or exists (select 1 from public.child_pronunciations p
                    where (p.audio_status = 'pending' and p.next_attempt_at <= now())
                       or (p.audio_status = 'generating' and p.claimed_at < now() - interval '10 minutes'))
    $job$);
  end if;
end $$;
