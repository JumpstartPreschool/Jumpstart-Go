import { clipKey, clipPath, VOICE_VERSION, type VoiceChild } from '../../../supabase/functions/_shared/announce.ts'

/**
 * The gate voice's clips on the coordinator's iPad. A sentence's audio is looked for, fastest first:
 *   memory (decoded, this session) → this iPad's Cache Storage → the school's store (voice-audio bucket, staff only)
 *   → made now by the pronounce function (only for words never said before, such as a free-text reason).
 * Clips are made once and never change (the key covers the words and the voice version), so a kept copy is always right.
 */

const BUCKET = 'voice-audio'
const DEVICE_CACHE = `jumpstart-voice-${VOICE_VERSION}`
// Caches from this app's earlier voices (Kokoro on the iPad, the cloud studio voice), removed to free the iPad's space.
const RETIRED = ['jumpstart-studio-voice-v1', 'natural-voice-app', 'natural-voice-runtime', 'transformers-cache']
// Making a new sentence takes seconds (tens of seconds on a CPU-only computer). The gate never waits this long: sound.ts
// uses the tablet's voice after CLIP_BUDGET_MS. Only a pronunciation preview waits for it.
const MAKE_TIMEOUT_MS = 70_000
const FAILED_RETRY_MS = 60_000
const WARM_AT_ONCE = 4

const debug = (...a: unknown[]) => { if (import.meta.env.DEV) console.debug('[voice]', ...a) }
// Loaded when first needed, so these modules (and their tests) don't open a Supabase connection just by loading.
const db = async () => (await import('../../lib/supabase')).supabase

// Who each announcement is about, with the school's pronunciation (set by the gate queue from the children it loads).
let children: ReadonlyMap<string, VoiceChild> = new Map()
export const setVoiceChildren = (map: ReadonlyMap<string, VoiceChild>) => { children = map }
export const voiceChild = (id?: string) => (id ? children.get(id) ?? null : null)

async function deviceCache(): Promise<Cache | null> {
  try { return typeof caches === 'undefined' ? null : await caches.open(DEVICE_CACHE) } catch { return null }
}

/** Frees the space earlier voices used on this iPad, and clips of an older voice version. */
export async function clearRetiredVoiceCaches(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    for (const name of await caches.keys()) {
      if (RETIRED.includes(name) || (name.startsWith('jumpstart-voice-') && name !== DEVICE_CACHE)) await caches.delete(name)
    }
  } catch { /* storage blocked: nothing to free */ }
}

const cacheRequest = (key: string) => new Request(`${location.origin}/voice/${key}.mp3`)
const keep = (cache: Cache | null, key: string, bytes: ArrayBuffer) =>
  cache?.put(cacheRequest(key), new Response(bytes.slice(0), { headers: { 'Content-Type': 'audio/mpeg' } })).catch(() => {})

/** The clip if this iPad or the school already has it, else null. Never makes one. */
async function stored(sentence: string): Promise<ArrayBuffer | null> {
  const key = await clipKey(sentence)
  const cache = await deviceCache()
  const kept = await cache?.match(cacheRequest(key)).catch(() => undefined)
  if (kept) return kept.arrayBuffer()
  const { data } = await (await db()).storage.from(BUCKET).download(clipPath(key))
  if (!data) return null
  const bytes = await data.arrayBuffer()
  await keep(cache, key, bytes)
  return bytes
}

/** Asks the pronounce function to make the clip now (it keeps it for everyone). */
async function make(sentence: string): Promise<ArrayBuffer> {
  const supabase = await db()
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('signed out')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pronounce`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: sentence }),
    signal: AbortSignal.timeout(MAKE_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`pronounce ${res.status}`)
  const bytes = await res.arrayBuffer()
  await keep(await deviceCache(), await clipKey(sentence), bytes)
  return bytes
}

// Decoded clips for this session; the same sentence asked for twice shares one request. ponytail: 120 newest, about
// two busy gate hours; decoded speech is ~0.5 MB a clip, so this caps memory near 60 MB.
const memory = new Map<string, Promise<AudioBuffer>>()

/** The sentence as playable audio, made now if nobody has made it yet. Rejects when it can't be had. */
export function clipAudio(ctx: BaseAudioContext, sentence: string): Promise<AudioBuffer> {
  const hit = memory.get(sentence)
  if (hit) {
    memory.delete(sentence)
    memory.set(sentence, hit)
    return hit
  }
  const made = stored(sentence)
    .then((bytes) => bytes ?? (debug('made now'), make(sentence)))
    .then((bytes) => ctx.decodeAudioData(bytes))
  // A failure is remembered for a minute, so a gate repeating an announcement doesn't ask again every time.
  made.catch(() => setTimeout(() => { if (memory.get(sentence) === made) memory.delete(sentence) }, FAILED_RETRY_MS))
  memory.set(sentence, made)
  if (memory.size > 120) memory.delete(memory.keys().next().value!)
  return made
}

/**
 * Copies the school's clips for these sentences to this iPad, a few at a time, so announcements play instantly and
 * even without Wi-Fi. Only clips already made are copied; the school makes missing ones in the background.
 */
export async function warmClips(list: readonly string[], signal?: AbortSignal): Promise<{ ready: number; missing: number }> {
  let ready = 0
  let missing = 0
  const queue = [...new Set(list)]
  const worker = async () => {
    for (let s = queue.shift(); s !== undefined && !signal?.aborted; s = queue.shift()) {
      const ok = await stored(s).catch(() => null)
      if (ok) ready++
      else missing++
    }
  }
  await Promise.all(Array.from({ length: WARM_AT_ONCE }, worker))
  debug('warm', { ready, missing })
  return { ready, missing }
}
