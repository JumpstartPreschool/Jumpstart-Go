#!/usr/bin/env bash
# The gate voice (D48): runs the school computer's side and publishes everything, from this repository.
#   bash scripts/voice-deploy.sh deploy       checks, migration 0030, voice + tunnel, pronounce function, cron, app
#   bash scripts/voice-deploy.sh start        (re)start the voice and its tunnel, and point Supabase at the new address
#   bash scripts/voice-deploy.sh stop         stop the voice and its tunnel (made clips keep playing)
#   bash scripts/voice-deploy.sh status       is it running, and what did the last background run make
#   bash scripts/voice-deploy.sh remove-old   delete the old cloud voice (voice-say, its secrets); run after deploy works
# Reads SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD and the Cloudflare keys from .env.local. Creates TTS_SHARED_SECRET and
# VOICE_CRON_SECRET there once (git-ignored). Never prints a secret. The tunnel is a Cloudflare quick tunnel, whose
# address changes on every start (this script updates Supabase each time); a named tunnel is in environments.md.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
RUN="$HOME/.jumpstart-voice"
mkdir -p "$RUN"

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

start_voice() {
  if alive voice; then echo "Voice already running."; else
    say "Starting the voice (the model takes about 25 s to load)"
    (cd "$ROOT/tts-service" && HF_HUB_OFFLINE=1 TTS_SHARED_SECRET="$TTS_SHARED_SECRET" nohup uv run uvicorn app:app --host 127.0.0.1 --port 8765 > "$RUN/voice.log" 2>&1 & echo $! > "$RUN/voice.pid")
  fi
  until curl -s -H "Authorization: Bearer $TTS_SHARED_SECRET" http://127.0.0.1:8765/health | grep -q '"ready":true'; do
    alive voice || { echo "The voice stopped; see $RUN/voice.log"; tail -20 "$RUN/voice.log"; exit 1; }
    sleep 3
  done
  echo "Voice ready on this computer."

  if alive tunnel; then kill "$(cat "$RUN/tunnel.pid")" 2>/dev/null || true; sleep 1; fi
  say "Opening the tunnel"
  : > "$RUN/tunnel.log"
  nohup cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8765 > "$RUN/tunnel.log" 2>&1 & echo $! > "$RUN/tunnel.pid"
  local url=""
  for _ in $(seq 1 40); do
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$RUN/tunnel.log" | head -1 || true)
    [ -n "$url" ] && break
    sleep 1
  done
  [ -n "$url" ] || { echo "No tunnel address; see $RUN/tunnel.log"; exit 1; }
  echo "$url" > "$RUN/tunnel.url"
  until curl -s -H "Authorization: Bearer $TTS_SHARED_SECRET" "$url/health" | grep -q '"ready":true'; do sleep 2; done
  echo "Reachable at $url"

  say "Pointing Supabase at it"
  $SB secrets set --project-ref "$SUPABASE_PROJECT_REF" TTS_SERVICE_URL="$url" TTS_SHARED_SECRET="$TTS_SHARED_SECRET" VOICE_CRON_SECRET="$VOICE_CRON_SECRET" > /dev/null
  echo "Secrets set."
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
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -X -v url="$FN_URL" -v secret="$VOICE_CRON_SECRET" <<'SQL'
insert into app.voice_config (url, secret) values (:'url', :'secret')
  on conflict (id) do update set url = excluded.url, secret = excluded.secret;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('voice-drain') where exists (select 1 from cron.job where jobname = 'voice-drain');
    perform cron.schedule('voice-drain', '* * * * *', $job$
      select net.http_post(url := c.url, headers := jsonb_build_object('Authorization', 'Bearer ' || c.secret, 'Content-Type', 'application/json'), body := '{"drain":true}'::jsonb)
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

    say "6/7 Publishing the app"
    npm run deploy

    say "7/7 First background run"
    kick
    echo
    echo "Done. Admin → Settings → Name pronunciation fills as clips are made (on this Mac, ~20 s a sentence)."
    echo "Keep this computer awake with the voice running. Check with: bash scripts/voice-deploy.sh status"
    ;;
  start) start_voice; kick ;;
  stop)
    for p in tunnel voice; do alive "$p" && kill "$(cat "$RUN/$p.pid")" && echo "Stopped $p."; rm -f "$RUN/$p.pid"; done
    ;;
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
  *) sed -n 2,11p "$0"; exit 1 ;;
esac
