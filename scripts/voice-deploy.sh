#!/usr/bin/env bash
# The gate voice (D48): runs the school computer's side and publishes everything, from this repository.
#   bash scripts/voice-deploy.sh deploy       checks, migration 0030, voice + tunnel, pronounce function, cron, app
#   bash scripts/voice-deploy.sh start        (re)start the voice and its tunnel, and point Supabase at the new address
#   bash scripts/voice-deploy.sh stop         stop the voice and its tunnel (made clips keep playing)
#   bash scripts/voice-deploy.sh status       is it running, and what did the last background run make
#   bash scripts/voice-deploy.sh check        why the background job isn't running (cron, net, link, queue), then a run now
#   bash scripts/voice-deploy.sh publish      build and publish the app (with the Cloudflare browser login)
#   bash scripts/voice-deploy.sh update       after a code change: restart the voice, redeploy pronounce, relink, run
#   bash scripts/voice-deploy.sh remove-old   delete the old cloud voice (voice-say, its secrets); run after deploy works
# Reads SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD and the Cloudflare keys from .env.local. Creates TTS_SHARED_SECRET and
# VOICE_CRON_SECRET there once (git-ignored). Never prints a secret. The tunnel is a Cloudflare quick tunnel, whose
# address changes on every start (this script updates Supabase each time); a named tunnel is in environments.md.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
RUN="$HOME/.jumpstart-voice"
mkdir -p "$RUN"
# Its own port, away from the usual 8000/8080/8765 that other local tools pick. TTS_PORT in .env.local to change.
PORT=${TTS_PORT:-8790}

[ -f .env.local ] || { echo "No .env.local here."; exit 1; }
set -a; . ./.env.local; set +a
: "${SUPABASE_PROJECT_REF:?set SUPABASE_PROJECT_REF in .env.local}"
: "${SUPABASE_DB_PASSWORD:?set SUPABASE_DB_PASSWORD in .env.local}"

secret() {  # name → value, created once in .env.local
  local name=$1 value
  value=$(grep -E "^$name=." .env.local | head -1 | cut -d= -f2- || true)
  if [ -z "$value" ]; then
    value=$(openssl rand -hex 32)
    printf '\n%s=%s\n' "$name" "$value" >> .env.local
  fi
  printf '%s' "$value"
}
TTS_SHARED_SECRET=$(secret TTS_SHARED_SECRET)
VOICE_CRON_SECRET=$(secret VOICE_CRON_SECRET)
PW=$(node -e 'console.log(encodeURIComponent(process.env.SUPABASE_DB_PASSWORD))')
DB_URL="postgresql://postgres:${PW}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require"
FN_URL="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/pronounce"
SB="npx supabase@2.118.0"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

alive() { [ -f "$RUN/$1.pid" ] && kill -0 "$(cat "$RUN/$1.pid")" 2>/dev/null; }

# Stops the voice and its tunnel. `uv run` starts the server as a child process, so the server is found by its port
# as well as by the saved pid, and the port is waited on until it's free.
stop_all() {
  for p in tunnel voice; do alive "$p" && kill "$(cat "$RUN/$p.pid")" 2>/dev/null && echo "Stopped $p."; rm -f "$RUN/$p.pid"; done
  local pids; pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN -c python 2>/dev/null || true)
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
  for _ in $(seq 1 15); do lsof -nP -iTCP:"$PORT" -sTCP:LISTEN > /dev/null 2>&1 || return 0; sleep 1; done
  echo "Port $PORT is still busy after stopping the voice."; exit 1
}

start_voice() {
  if alive voice; then echo "Voice already running."; else
    if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN > /dev/null 2>&1; then
      echo "Port $PORT is already used by another program:"; lsof -nP -iTCP:"$PORT" -sTCP:LISTEN
      echo "Stop it, or set TTS_PORT=<free port> in .env.local, then run this again."; exit 1
    fi
    say "Starting the voice (the model takes about 25 s to load)"
    (cd "$ROOT/tts-service" && HF_HUB_OFFLINE=1 TTS_SHARED_SECRET="$TTS_SHARED_SECRET" nohup uv run uvicorn app:app --host 127.0.0.1 --port "$PORT" > "$RUN/voice.log" 2>&1 & echo $! > "$RUN/voice.pid")
  fi
  local waited=0
  until curl -s -H "Authorization: Bearer $TTS_SHARED_SECRET" "http://127.0.0.1:$PORT/health" | grep -q '"ready":true'; do
    alive voice || { echo "The voice stopped; see $RUN/voice.log"; tail -20 "$RUN/voice.log"; exit 1; }
    waited=$((waited + 3)); [ "$waited" -lt 300 ] || { echo "The voice didn't get ready in 5 minutes; see $RUN/voice.log"; exit 1; }
    sleep 3
  done
  echo "Voice ready on this computer."

  if alive tunnel; then kill "$(cat "$RUN/tunnel.pid")" 2>/dev/null || true; sleep 1; fi
  say "Opening the tunnel"
  : > "$RUN/tunnel.log"
  nohup cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" > "$RUN/tunnel.log" 2>&1 & echo $! > "$RUN/tunnel.pid"
  local url=""
  for _ in $(seq 1 40); do
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$RUN/tunnel.log" | head -1 || true)
    [ -n "$url" ] && break
    sleep 1
  done
  [ -n "$url" ] || { echo "No tunnel address; see $RUN/tunnel.log"; exit 1; }
  echo "$url" > "$RUN/tunnel.url"
  waited=0
  until curl -s -H "Authorization: Bearer $TTS_SHARED_SECRET" "$url/health" | grep -q '"ready":true'; do
    waited=$((waited + 2)); [ "$waited" -lt 120 ] || { echo "The tunnel address didn't answer in 2 minutes; see $RUN/tunnel.log"; exit 1; }
    sleep 2
  done
  echo "Reachable at $url"

  say "Pointing Supabase at it"
  $SB secrets set --project-ref "$SUPABASE_PROJECT_REF" TTS_SERVICE_URL="$url" TTS_SHARED_SECRET="$TTS_SHARED_SECRET" VOICE_CRON_SECRET="$VOICE_CRON_SECRET" > /dev/null
  echo "Secrets set."
}

link_db() {
  say "Linking the database to pronounce, and the minute job"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -X -v url="$FN_URL" -v secret="$VOICE_CRON_SECRET" <<'SQL'
insert into app.voice_config (url, secret) values (:'url', :'secret')
  on conflict (id) do update set url = excluded.url, secret = excluded.secret;
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
  raise notice 'Minute job scheduled.';
  else
  raise notice 'pg_cron is not enabled: turn it on (Database → Extensions) and run deploy again.';
  end if;
end $$;
SQL
}

# Wrangler reads CLOUDFLARE_API_TOKEN from .env.local by itself, and that token can't edit this worker. Publishing from
# a folder without .env.local uses the Cloudflare browser login (npx wrangler login), which can.
publish() {
  say "Publishing the app"
  npm run build > /dev/null
  local dir; dir=$(mktemp -d)
  cp wrangler.jsonc "$dir/" && cp -R dist "$dir/dist"
  (cd "$dir" && env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx wrangler@4 deploy --env-file /dev/null)
  rm -rf "$dir"
}

check() {
  say "Database side of the background job"
  psql "$DB_URL" -q -X <<'SQL'
select 'pg_cron enabled' as check, exists (select 1 from pg_extension where extname = 'pg_cron') as ok
union all select 'pg_net enabled', exists (select 1 from pg_extension where extname = 'pg_net')
union all select 'link to pronounce saved (app.voice_config)', exists (select 1 from app.voice_config);
do $$ begin
  if to_regclass('cron.job') is not null then
    raise notice 'voice-drain scheduled: %', (select count(*) > 0 from cron.job where jobname = 'voice-drain');
  else
    raise notice 'pg_cron is off: Supabase dashboard → Database → Extensions → enable pg_cron (and pg_net), then: bash scripts/voice-deploy.sh update';
  end if;
end $$;
select audio_status, count(*) from public.child_pronunciations group by 1 order by 1;
SQL
  psql "$DB_URL" -q -X -c "select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'voice-drain') order by start_time desc limit 3" 2>/dev/null || true
  psql "$DB_URL" -q -X -c "select status_code, left(coalesce(content, error_msg), 120) as reply, created from net._http_response order by created desc limit 3" 2>/dev/null || true
  kick
}

kick() {
  say "Asking pronounce to make clips now"
  curl -s -X POST "$FN_URL" -H "Authorization: Bearer $VOICE_CRON_SECRET" -H 'Content-Type: application/json' -d '{"drain":true}'; echo
}

case "${1:-}" in
  deploy)
    say "1/7 Checks"
    npx tsc -b
    npx vitest run --reporter=dot
    npm run test:db > /dev/null && echo "Database tests passed."
    (cd tts-service && uv run pytest -q)

    say "2/7 Migration 0030 on the live database (dry run first)"
    $SB db push --dry-run --db-url "$DB_URL"
    read -r -p "Apply these migrations to the live database? [y/N] " ok
    [ "$ok" = "y" ] || { echo "Stopped before changing the database."; exit 1; }
    $SB db push --db-url "$DB_URL"

    say "3/7 Voice and tunnel on this computer"
    start_voice

    say "4/7 The pronounce function"
    $SB functions deploy pronounce --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt

    say "5/7 The database's link to pronounce, and the minute job"
    link_db

    say "6/7 First background run"
    kick

    say "7/7 Publishing the app"
    publish
    echo
    echo "Done. Admin → Settings → Name pronunciation fills as clips are made (on this Mac, ~20 s a sentence)."
    echo "Keep this computer awake with the voice running. Check with: bash scripts/voice-deploy.sh status"
    ;;
  start) start_voice; kick ;;
  check) check ;;
  update)
    # New code: apply new migrations, restart the voice (new tunnel address), redeploy pronounce, relink, run.
    say "New migrations (dry run, then apply)"
    $SB db push --dry-run --db-url "$DB_URL"
    $SB db push --db-url "$DB_URL"
    stop_all
    start_voice
    say "Deploying pronounce"
    $SB functions deploy pronounce --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
    link_db
    kick
    ;;
  publish) publish ;;
  stop) stop_all ;;
  status)
    alive voice && echo "Voice: running" || echo "Voice: stopped"
    alive tunnel && echo "Tunnel: $(cat "$RUN/tunnel.url" 2>/dev/null)" || echo "Tunnel: stopped"
    grep '"voice": "drain\|generation_completed\|generation_failed' "$RUN/voice.log" 2>/dev/null | tail -5 || true
    psql "$DB_URL" -q -X -A -F ' ' -c "select audio_status, count(*) from public.child_pronunciations group by 1 order by 1" 2>/dev/null || true
    ;;
  remove-old)
    say "Removing the old cloud voice"
    $SB secrets unset --project-ref "$SUPABASE_PROJECT_REF" ELEVENLABS_API_KEY ELEVENLABS_VOICE_ID AZURE_SPEECH_KEY AZURE_SPEECH_REGION AZURE_VOICE || true
    $SB functions delete voice-say --project-ref "$SUPABASE_PROJECT_REF" || true
    echo "Now, in the Supabase dashboard → Storage, empty and delete the voice-cache bucket (old cloud recordings)."
    ;;
  *) sed -n 2,14p "$0"; exit 1 ;;
esac
