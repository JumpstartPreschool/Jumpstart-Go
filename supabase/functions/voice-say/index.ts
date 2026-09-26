// Gate announcements in the studio voice (ElevenLabs, D43). Called by the coordinator's tablet with their sign-in:
// the database checks they're school staff and under the hourly limit (voice_allowed, 0027). Each announcement is made
// once: the audio is kept in the private voice-cache bucket under a key made from the voice, model, settings and exact
// words (voiceText.ts), so a repeat, or the same name tomorrow, costs no credits.
// POST { text } → audio/mpeg.  POST { probe: true } → { configured }: whether the studio voice is set up.
// Deploy: npx supabase functions deploy voice-say
// Secrets: ELEVENLABS_API_KEY (ElevenLabs → Developers → API keys), ELEVENLABS_VOICE_ID (the voice chosen in the
// ElevenLabs Voice Library, e.g. a calm Indian English woman's voice), APP_ORIGIN (optional, as for invite-send).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cacheKey, checkSpeech, VOICE_MODEL, VOICE_SEED, VOICE_SETTINGS } from '../_shared/voiceText.ts'

const KEY = Deno.env.get('ELEVENLABS_API_KEY') ?? ''
const VOICE = Deno.env.get('ELEVENLABS_VOICE_ID') ?? ''
const BUCKET = 'voice-cache'
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-voice-cache',
  Vary: 'Origin',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const audio = (bytes: ArrayBuffer | Uint8Array, cache: 'hit' | 'miss') =>
  new Response(bytes, { headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=31536000, immutable', 'x-voice-cache': cache } })
// Counts only, never the words or who asked: the log is for spotting quota use and failures.
const log = (event: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ voice: event, ...extra }))

const store = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
// Two tablets asking for the same new announcement at once share one ElevenLabs request.
const making = new Map<string, Promise<Uint8Array>>()

async function make(key: string, text: string): Promise<Uint8Array> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE)}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: VOICE_MODEL, voice_settings: VOICE_SETTINGS, seed: VOICE_SEED }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { detail?: { status?: string } }
    log('generation_failed', { status: res.status, code: detail.detail?.status ?? null })
    throw new Error(`elevenlabs ${res.status}`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const { error } = await store.storage.from(BUCKET).upload(`${key}.mp3`, bytes, { contentType: 'audio/mpeg', upsert: true })
  if (error) log('cache_write_failed')
  log('generated', { chars: text.length })
  return bytes
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405)

  let body: { text?: unknown; probe?: unknown } = {}
  try { body = await req.json() } catch { /* checked below */ }

  // As the caller, so the staff check and the limit apply to them.
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: allowed, error } = await db.rpc('voice_allowed')
  if (error) return reply({ error: error.message.replace(/^[a-z_]+: /, '') }, error.message.startsWith('rate_limited') ? 429 : 401)
  if (!allowed) return reply({ error: 'Only school staff can make announcements.' }, 403)

  if (body.probe === true) return reply({ configured: !!(KEY && VOICE) })
  if (!KEY || !VOICE) return reply({ error: 'The studio voice is not set up.' }, 503)
  const text = checkSpeech(body.text)
  if (!text) return reply({ error: 'That announcement can’t be spoken.' }, 400)

  const key = await cacheKey(VOICE, text)
  const cached = await store.storage.from(BUCKET).download(`${key}.mp3`)
  if (cached.data) {
    log('cache_hit')
    return audio(await cached.data.arrayBuffer(), 'hit')
  }
  log('cache_miss')
  try {
    let job = making.get(key)
    if (!job) {
      job = make(key, text).finally(() => making.delete(key))
      making.set(key, job)
    }
    return audio(await job, 'miss')
  } catch {
    return reply({ error: 'The studio voice is unavailable right now.' }, 502)
  }
})
