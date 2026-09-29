// The gate voice (D50): Microsoft Azure AI Speech, Indian English, made ahead of time and kept in the private
// voice-audio bucket, so a parent's tap plays a clip that already exists.
//   POST { drain: true } the database's minute job (pg_net, with VOICE_CRON_SECRET): makes the shared openings once per
//                        voice version, then each queued child's messages (voice_claim / voice_finish), within the cap.
//   POST { text }        a staff member (a pronunciation preview, or a sentence nobody made ahead): handler.ts.
// Deploy: npx supabase functions deploy pronounce --no-verify-jwt
// Secrets: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (e.g. centralindia), AZURE_SPEECH_VOICE (an en-IN female neural voice,
// default en-IN-NeerjaNeural), VOICE_CRON_SECRET (as app.voice_config.secret), APP_ORIGIN (optional, as for invite-send).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { childMessages, clipKey, clipPath, commonPhrases } from '../_shared/announce.ts'
import { azureSpeech, TtsBusy, type TTSProvider } from '../_shared/tts.ts'
import { handle } from './handler.ts'

const BUCKET = 'voice-audio'
const CRON_SECRET = Deno.env.get('VOICE_CRON_SECRET') ?? ''
// Supabase stops a function at 150 s. A run starts no new clip after 80 s and hands back what it didn't finish.
const DRAIN_BUDGET_MS = 80_000

// Counts, sizes and timings only, never the words or who asked.
const log = (event: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ voice: event, ...extra }))

/** The configured provider, or null (with the reason logged) when a secret is missing or malformed. */
function makeProvider(): TTSProvider | null {
  try {
    return azureSpeech({
      key: Deno.env.get('AZURE_SPEECH_KEY') ?? '',
      region: (Deno.env.get('AZURE_SPEECH_REGION') ?? '').trim().toLowerCase(),
      voice: (Deno.env.get('AZURE_SPEECH_VOICE') ?? 'en-IN-NeerjaNeural').trim(),
    })
  } catch (e) {
    log('not_configured', { reason: (e as Error).message })
    return null
  }
}
const provider = makeProvider()

const store = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

async function stored(key: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const { data } = await store.storage.from(BUCKET).download(clipPath(key))
  return data ? new Uint8Array(await data.arrayBuffer()) : null
}
async function keep(key: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  const { error } = await store.storage.from(BUCKET).upload(clipPath(key), bytes, { contentType: 'audio/mpeg', upsert: true })
  if (error) throw error
}

/** The file names already in the bucket (one listing per run, instead of one check per sentence). */
async function madeAlready(): Promise<Set<string>> {
  const names = new Set<string>()
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await store.storage.from(BUCKET).list('sentences', { limit: 1000, offset })
    if (error) throw error
    for (const f of data ?? []) names.add(`sentences/${f.name}`)
    if (!data || data.length < 1000) return names
  }
}

/** Out of time, the cap reached, or Azure asking us to slow down: stop, and the next run carries on. */
class Stop extends Error {}

/** Makes each sentence not yet in the bucket, until the deadline. Returns how many were made. */
async function ensure(tts: TTSProvider, list: readonly string[], have: Set<string>, deadline: number): Promise<number> {
  let made = 0
  for (const text of list) {
    const path = clipPath(await clipKey(tts.version, text))
    if (have.has(path)) continue
    if (Date.now() > deadline) throw new Stop()
    const started = Date.now()
    let bytes: Uint8Array<ArrayBuffer>
    try {
      bytes = await tts.synthesize(text)
    } catch (e) {
      log('generation_failed', { reason: (e as Error).message, busy: e instanceof TtsBusy, ms: Date.now() - started })
      if (e instanceof TtsBusy) throw new Stop()
      throw e
    }
    await store.storage.from(BUCKET).upload(path, bytes, { contentType: 'audio/mpeg', upsert: true })
    log('generation_succeeded', { chars: text.length, bytes: bytes.length, ms: Date.now() - started })
    have.add(path)
    made++
    // Counted once made, so a refused request costs nothing. ponytail: the cap can be passed by one sentence (under
    // 400 characters); the 50,000 margin below Azure's free 500,000 covers it.
    const { data: counted, error } = await store.rpc('voice_count', { p_chars: text.length })
    if (error) throw error
    if (!counted) {
      log('monthly_cap')
      throw new Stop()
    }
  }
  return made
}

type ChildRow = {
  full_name: string
  preferred_name: string | null
  guardianships: Array<{ relation: string | null; profiles: { active: boolean } | null }>
  child_pronunciations: { spoken_name: string | null } | null
}

/** A child's announcements, built exactly as the gate builds them. */
async function childSentences(childId: string): Promise<string[]> {
  const { data, error } = await store.from('children')
    .select('full_name, preferred_name, guardianships(relation, profiles(active)), child_pronunciations(spoken_name)')
    .eq('id', childId).single()
  if (error) throw error
  const c = data as unknown as ChildRow
  const child = { fullName: c.full_name, name: c.preferred_name ?? c.full_name.split(' ')[0]!, spoken: c.child_pronunciations?.spoken_name ?? null }
  return childMessages(child, c.guardianships.filter((g) => g.profiles?.active).map((g) => g.relation))
}

async function drain(tts: TTSProvider): Promise<Record<string, unknown>> {
  const started = Date.now()
  const deadline = started + DRAIN_BUDGET_MS
  const have = await madeAlready()
  const now = () => new Date().toISOString()
  const { data: metaRows } = await store.from('voice_meta').select('key, value').in('key', ['voice', 'queued'])
  const meta = new Map((metaRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
  // A new voice or wording: every child's clips are made again, once.
  if (meta.get('queued') !== tts.version) {
    if (meta.size) await store.rpc('voice_requeue_all')
    await store.from('voice_meta').upsert({ key: 'queued', value: tts.version, updated_at: now() })
  }
  let phrases = 0
  try {
    phrases = await ensure(tts, commonPhrases(), have, deadline)
  } catch (e) {
    if (!(e instanceof Stop)) throw e
    log('drain', { phrases: 'partial', ms: Date.now() - started })
    return { phrases: 'partial' }
  }
  // iPads switch to this voice once its openings exist; a child's clips not yet made are made live (capped) meanwhile.
  if (meta.get('voice') !== tts.version) await store.from('voice_meta').upsert({ key: 'voice', value: tts.version, updated_at: now() })
  let children = 0
  let clips = 0
  let failed = 0
  let stopped = false
  while (!stopped && Date.now() < deadline) {
    const { data, error } = await store.rpc('voice_claim', { p_limit: 1 })
    if (error) throw error
    const rows = (data ?? []) as Array<{ child_id: string; revision: number }>
    if (!rows.length) break
    for (const row of rows) {
      let ok: boolean | null = false
      try {
        clips += await ensure(tts, await childSentences(row.child_id), have, deadline)
        ok = true
        children++
      } catch (e) {
        // Out of time, the cap, or Azure busy: back in the queue with no try used up.
        if (e instanceof Stop) { ok = null; stopped = true }
        else { failed++; log('child_failed') }
      }
      await store.rpc('voice_finish', { p_child: row.child_id, p_revision: row.revision, p_ok: ok })
    }
  }
  const result = { phrases, children, clips, failed, ms: Date.now() - started }
  log('drain', result)
  return result
}

/** Compares secrets in constant time (as digests, so their lengths don't matter either). */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  if (!expected) return false
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  const [a, b] = await Promise.all([digest(given), digest(expected)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

const origin = Deno.env.get('APP_ORIGIN') ?? '*'

Deno.serve(async (req) => {
  // The minute job: read the body once, then hand anything else to the staff handler with the same body.
  if (req.method === 'POST' && req.headers.get('content-type')?.includes('application/json')) {
    const raw = await req.text()
    let body: { drain?: unknown } = {}
    try { body = JSON.parse(raw) } catch { /* the handler answers */ }
    if (body.drain === true) {
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
      if (!(await sameSecret(req.headers.get('Authorization') ?? '', `Bearer ${CRON_SECRET}`))) return json({ error: 'unauthorized' }, 401)
      if (!provider) return json({ skipped: 'not_configured' })
      try {
        return json(await drain(provider))
      } catch (e) {
        // Azure's status ("azure 401": wrong key or region; "azure 400": the voice name) is safe to show the caller.
        const reason = /^azure \d{3}$/.test((e as Error).message) ? (e as Error).message : 'drain failed'
        log('drain_failed', { reason })
        return json({ error: reason }, 500)
      }
    }
    req = new Request(req.url, { method: req.method, headers: req.headers, body: raw })
  }
  return handle(req, {
    origin,
    provider,
    stored,
    keep,
    // As the caller, so the staff check and the limits apply to them.
    spend: async (authorization, chars) => {
      const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        auth: { persistSession: false }, global: { headers: { Authorization: authorization } },
      })
      return await db.rpc('voice_spend', { p_chars: chars })
    },
    log,
  })
})
