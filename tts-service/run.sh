#!/usr/bin/env bash
# The school computer's side of the gate voice, kept running: the voice, a Cloudflare tunnel to it, and registering the
# tunnel's address with the school's server (pronounce), which then starts any waiting work. If the tunnel or the voice
# stops (network change, sleep), it's started again and registered again. Started at login by the LaunchAgent that
# `bash scripts/voice-deploy.sh autostart on` installs; run it by hand to watch it.
# Needs tts-service/.env (written by voice-deploy.sh): TTS_SHARED_SECRET, PRONOUNCE_URL, TTS_PORT.
set -uo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "No tts-service/.env: run bash scripts/voice-deploy.sh deploy (or start) once."; exit 1; }
set -a; . ./.env; set +a
: "${TTS_SHARED_SECRET:?}" "${PRONOUNCE_URL:?}"
PORT=${TTS_PORT:-8790}
RUN="$HOME/.jumpstart-voice"
mkdir -p "$RUN"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"   # uv and cloudflared, also under launchd
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

voice_pid="" tunnel_pid=""
cleanup() { kill $tunnel_pid $voice_pid 2>/dev/null; wait 2>/dev/null; log "stopped"; exit 0; }
trap cleanup TERM INT

health() { curl -s -m 5 -H "Authorization: Bearer $TTS_SHARED_SECRET" "$1/health" | grep -q '"ready":true'; }

start_voice() {
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN > /dev/null 2>&1; then
    log "port $PORT is used by another program; set TTS_PORT in tts-service/.env"; sleep 60; return 1
  fi
  # Low priority: the voice waits behind whatever the person at this computer is doing, so the Mac never lags.
  HF_HUB_OFFLINE=1 nice -n 15 uv run uvicorn app:app --host 127.0.0.1 --port "$PORT" >> "$RUN/voice.log" 2>&1 &
  voice_pid=$!
  echo "$voice_pid" > "$RUN/voice.pid"
  for _ in $(seq 1 60); do health "http://127.0.0.1:$PORT" && { log "voice up on port $PORT"; return 0; }; sleep 1; done
  log "voice didn't start; see $RUN/voice.log"; kill $voice_pid 2>/dev/null; voice_pid=""; return 1
}

start_tunnel() {
  : > "$RUN/tunnel.log"
  cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >> "$RUN/tunnel.log" 2>&1 &
  tunnel_pid=$!
  echo "$tunnel_pid" > "$RUN/tunnel.pid"
  local url=""
  for _ in $(seq 1 60); do
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$RUN/tunnel.log" | head -1 || true)
    [ -n "$url" ] && break
    sleep 1
  done
  [ -n "$url" ] || { log "no tunnel address; see $RUN/tunnel.log"; kill $tunnel_pid 2>/dev/null; tunnel_pid=""; return 1; }
  for _ in $(seq 1 60); do health "$url" && break; sleep 2; done
  echo "$url" > "$RUN/tunnel.url"
  # Tell the school's server where the voice is; it checks the address answers as the voice, then starts waiting work.
  for attempt in $(seq 1 30); do
    reply=$(curl -s -m 30 -X POST "$PRONOUNCE_URL" -H "Authorization: Bearer $TTS_SHARED_SECRET" \
      -H 'Content-Type: application/json' -d "{\"register\":\"$url\"}")
    if echo "$reply" | grep -q '"registered":true'; then log "registered $url"; return 0; fi
    log "registering failed (try $attempt): $reply"
    sleep 10
  done
  return 1
}

log "starting"
while true; do
  if [ -z "$voice_pid" ] || ! kill -0 "$voice_pid" 2>/dev/null; then start_voice || continue; fi
  if [ -z "$tunnel_pid" ] || ! kill -0 "$tunnel_pid" 2>/dev/null; then start_tunnel || { sleep 15; continue; }; fi
  # Every 30 s: are both alive, and does the tunnel still reach the voice? If not, start that part again.
  sleep 30
  if ! health "$(cat "$RUN/tunnel.url" 2>/dev/null)"; then
    log "tunnel stopped answering; opening a new one"
    kill $tunnel_pid 2>/dev/null; tunnel_pid=""
  fi
done
