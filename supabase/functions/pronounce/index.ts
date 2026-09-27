// The gate voice (D48): the only way into the school's own text-to-speech computer (tts-service/). It keeps every clip
// once in the private voice-audio bucket, named by the voice version and the exact words (_shared/announce.ts), so the
// same sentence is never made twice. iPads read ready clips straight from the bucket; they come here only for words
// never said before.
//   POST { text }        a staff member's iPad or a pronunciation preview: the sentence's clip (audio/mpeg), made now
//                        if needed. The database checks they're staff and under the hourly limit (voice_allowed).
//   POST { drain: true } the database (pg_net, and a minute job) with VOICE_CRON_SECRET: makes the shared phrases once
//                        per voice version, then each pending child's everyday sentences (voice_claim / voice_finish).
// Deploy: npx supabase functions deploy pronounce --no-verify-jwt
// Secrets: TTS_SERVICE_URL (the school computer's tunnel address), TTS_SHARED_SECRET (as tts-service), VOICE_CRON_SECRET
// (as app.voice_config.secret), APP_ORIGIN (optional, as for invite-send).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkSpeech, clipKey, clipPath, commonPhrases, VOICE_VERSION, warmSentences } from '../_shared/announce.ts'

const TTS_URL = (Deno.env.get('TTS_SERVICE_URL') ?? '').replace(/\/+$/, '')
const TTS_SECRET = Deno.env.get('TTS_SHARED_SECRET') ?? ''
const CRON_SECRET = Deno.env.get('VOICE_CRON_SECRET') ?? ''
const BUCKET = 'voice-audio'
// Sentences from a tablet are one sentence of an announcement; the longest everyday one is well under this.
const STAFF_MAX_CHARS = 200
// A long sentence on a CPU can take several seconds; past this the school computer is treated as unavailable.
const MAKE_TIMEOUT_MS = 60_000
// Supabase stops a function at 150 s. A drain starts no new sentence after 80 s (one sentence may take up to 60 s on a
// CPU), hands back whatever it didn't finish, and the minute job continues from there.
const DRAIN_BUDGET_MS = 80_000

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-voice-cache',
  Vary: 'Origin',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const audio = (bytes: Uint8Array<ArrayBuffer>, cache: 'hit' | 'miss') =>
  new Response(bytes, { headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=31536000, immutable', 'x-voice-cache': cache } })
// Counts, sizes and timings only, never the words or who asked.
const log = (event: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ voice: event, version: VOICE_VERSION, ...extra }))

const store = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

async function healthy(): Promise<boolean> {
  if (!TTS_URL || !TTS_SECRET) return false
  try {
    const res = await fetch(`${TTS_URL}/health`, { headers: { Authorization: `Bearer ${TTS_SECRET}` }, signal: AbortSignal.timeout(5_000) })
    const body = res.ok ? ((await res.json()) as { ready?: boolean; version?: string }) : null
    if (body?.ready && body.version !== VOICE_VERSION) log('version_mismatch', { service: body.version })
    return !!body?.ready && body.version === VOICE_VERSION
  } catch {
    return false
  }
}

/** The school computer is busy (its short queue is full) or too slow right now: try later, it's not a failure. */
class Busy extends Error {}

/** Compares secrets in constant time (as digests, so their lengths don't matter either). */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  if (!expected) return false
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  const [a, b] = await Promise.all([digest(given), digest(expected)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

async function synthesize(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(`${TTS_URL}/synthesize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TTS_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(MAKE_TIMEOUT_MS),
    })
  } catch (e) {
    log('generation_failed', { reason: (e as Error).name === 'TimeoutError' ? 'timeout' : 'unreachable', ms: Date.now() - started })
    throw new Busy()
  }
  if (res.status === 503) {
    log('tts_busy')
    throw new Busy()
  }
  if (!res.ok) {
    log('generation_failed', { status: res.status, ms: Date.now() - started })
    throw new Error(`tts ${res.status}`)
  }
  // Never keep a clip made by a different voice under this version's name.
  const version = res.headers.get('x-voice-version')
  if (version !== VOICE_VERSION) {
    log('version_mismatch', { service: version })
    throw new Error('voice version mismatch')
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  log('generation_completed', { ms: Date.now() - started, bytes: bytes.length, chars: text.length })
  return bytes
}

// Two requests for the same new sentence at once share one generation.
const making = new Map<string, Promise<Uint8Array<ArrayBuffer>>>()
function make(key: string, text: string): Promise<Uint8Array<ArrayBuffer>> {
  let job = making.get(key)
  if (!job) {
    log('generation_started', { chars: text.length })
    job = synthesize(text).then(async (bytes) => {
      const { error } = await store.storage.from(BUCKET).upload(clipPath(key), bytes, { contentType: 'audio/mpeg', upsert: true })
      if (error) log('cache_write_failed')
      return bytes
    }).finally(() => making.delete(key))
    making.set(key, job)
  }
  return job
}

/** The file names already in the bucket (one listing per drain, instead of one check per sentence). */
async function madeAlready(): Promise<Set<string>> {
  const names = new Set<string>()
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await store.storage.from(BUCKET).list('sentences', { limit: 1000, offset })
    if (error) throw error
    for (const f of data ?? []) names.add(`sentences/${f.name}`)
    if (!data || data.length < 1000) return names
  }
}

class OutOfTime extends Error {}

/** Makes each sentence not yet in the bucket, until the deadline. Returns how many were made. */
async function ensure(list: readonly string[], have: Set<string>, deadline: number): Promise<number> {
  let made = 0
  for (const text of list) {
    const key = await clipKey(text)
    const path = clipPath(key)
    if (have.has(path)) continue
    if (Date.now() > deadline) throw new OutOfTime()
    await make(key, text)
    have.add(path)
    made++
  }
  return made
}

type ChildRow = {
  full_name: string
  preferred_name: string | null
  classes: { name: string } | null
  guardianships: Array<{ relation: string | null; profiles: { full_name: string; active: boolean } | null }>
  child_pronunciations: { spoken_name: string | null } | null
}

/** A child's everyday sentences, built exactly as the gate builds them. */
async function childSentences(childId: string): Promise<string[]> {
  const { data, error } = await store.from('children')
    .select('full_name, preferred_name, classes(name), guardianships(relation, profiles(full_name, active)), child_pronunciations(spoken_name)')
    .eq('id', childId).single()
  if (error) throw error
  const c = data as unknown as ChildRow
  const child = { fullName: c.full_name, name: c.preferred_name ?? c.full_name.split(' ')[0]!, spoken: c.child_pronunciations?.spoken_name ?? null }
  const guardians = c.guardianships.filter((g) => g.profiles?.active).map((g) => ({ name: g.profiles!.full_name, relation: g.relation }))
  return warmSentences(child, c.classes?.name ?? '', guardians)
}

async function drain(): Promise<Record<string, unknown>> {
  const started = Date.now()
  const deadline = started + DRAIN_BUDGET_MS
  // The school computer is off or asleep: leave the work waiting, without using up anyone's tries.
  if (!(await healthy())) {
    log('tts_unavailable')
    return { skipped: 'tts_unavailable' }
  }
  const have = await madeAlready()
  let phrases = 0
  const { data: meta } = await store.from('voice_meta').select('value').eq('key', 'phrases').maybeSingle()
  if (meta?.value !== VOICE_VERSION) {
    try {
      phrases = await ensure(commonPhrases(), have, deadline)
    } catch (e) {
      if (!(e instanceof OutOfTime)) throw e
      log('drain', { phrases: 'partial', ms: Date.now() - started })
      return { phrases: 'partial' }
    }
    await store.from('voice_meta').upsert({ key: 'phrases', value: VOICE_VERSION, updated_at: new Date().toISOString() })
    // A different voice than before: every child's clips are made again in this voice.
    if (meta) await store.rpc('voice_requeue_all')
  }
  let children = 0
  let clips = 0
  let failed = 0
  while (Date.now() < deadline) {
    const { data, error } = await store.rpc('voice_claim', { p_limit: 1 })
    if (error) throw error
    const rows = (data ?? []) as Array<{ child_id: string; revision: number }>
    if (!rows.length) break
    for (const row of rows) {
      let ok: boolean | null = false
      try {
        clips += await ensure(await childSentences(row.child_id), have, deadline)
        ok = true
        children++
      } catch (e) {
        // Out of time, or the computer busy or slow: back in the queue with no try used up; the next run carries on
        // from the clips already made.
        if (e instanceof OutOfTime || e instanceof Busy) ok = null
        else {
          failed++
          log('child_failed')
        }
      }
      await store.rpc('voice_finish', { p_child: row.child_id, p_revision: row.revision, p_ok: ok })
    }
  }
  const result = { phrases, children, clips, failed, ms: Date.now() - started }
  log('drain', result)
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405)

  let body: { text?: unknown; drain?: unknown } = {}
  try { body = await req.json() } catch { /* checked below */ }

  if (body.drain === true) {
    if (!(await sameSecret(req.headers.get('Authorization') ?? '', `Bearer ${CRON_SECRET}`)) || !CRON_SECRET) return reply({ error: 'unauthorized' }, 401)
    try {
      return reply(await drain())
    } catch {
      log('drain_failed')
      return reply({ error: 'drain failed' }, 500)
    }
  }

  // As the caller, so the staff check and the limit apply to them.
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: allowed, error } = await db.rpc('voice_allowed')
  if (error) return reply({ error: error.message.startsWith('rate_limited') ? 'Too many requests. Try again in a while.' : 'Sign in again.' }, error.message.startsWith('rate_limited') ? 429 : 401)
  if (!allowed) return reply({ error: 'Only school staff can make announcements.' }, 403)

  const text = checkSpeech(body.text)
  if (!text || text.length > STAFF_MAX_CHARS) return reply({ error: 'That can’t be spoken.' }, 400)
  const key = await clipKey(text)
  log('tts_requested', { chars: text.length })
  const cached = await store.storage.from(BUCKET).download(clipPath(key))
  if (cached.data) {
    log('cache_hit')
    return audio(new Uint8Array(await cached.data.arrayBuffer()), 'hit')
  }
  log('cache_miss')
  if (!TTS_URL || !TTS_SECRET) return reply({ error: 'The school voice is not set up.' }, 503)
  // A new sentence ties up the school's computer, so each person has a smaller hourly allowance for those.
  const { data: mayMake, error: makeError } = await db.rpc('voice_make_allowed')
  if (makeError || !mayMake) return reply({ error: 'Too many new announcements. Try again in a while.' }, 429)
  try {
    return audio(await make(key, text), 'miss')
  } catch (e) {
    return reply({ error: 'The school voice is unavailable right now.' }, e instanceof Busy ? 503 : 502)
  }
})
