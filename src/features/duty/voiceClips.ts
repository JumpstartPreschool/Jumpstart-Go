import { clipKey, clipPath, type VoiceChild } from '../../../supabase/functions/_shared/announce.ts'

/**
 * The gate voice's clips on the coordinator's iPad (D50). Every child's announcements are made ahead of time by the
 * pronounce function (Azure) and kept in the school's private voice-audio store. A sentence's audio is looked for,
 * fastest first:
 *   memory (decoded, this session) → this iPad's Cache Storage → the school's store → made live (rare, capped)
 * A clip's key covers the voice version and the exact words, so a kept copy is always right. On Start duty the iPad
 * copies every child's clips, so a parent's tap plays from the iPad itself.
 */

// Caches from this app's earlier voices, removed to free the iPad's space.
const RETIRED = ['jumpstart-studio-voice-v1', 'natural-voice-app', 'natural-voice-runtime', 'transformers-cache']
const CACHE_PREFIX = 'jumpstart-voice-'
const BUCKET = 'voice-audio'
// A pronunciation preview waits this long for a live clip; the gate never does (sound.ts uses the tablet's voice).
const MAKE_TIMEOUT_MS = 10_000
const FAILED_RETRY_MS = 60_000
// ponytail: one request per clip, so a whole school is thousands of requests; a single manifest download if this is still slow.
const WARM_AT_ONCE = 12
// Refused for the monthly cap or the hourly limit: no live clips for a while, instead of asking on every announcement.
const RATE_PAUSE_MS = 60_000
const PAUSE_KEY = 'jumpstart.voicePausedUntil'

const debug = (...a: unknown[]) => { if (import.meta.env.DEV) console.debug('[voice]', ...a) }
/**
 * The gate voice's log, in every build, for finding out on a real iPad why something wasn't heard: where each clip came
 * from, when playback starts and ends, and any failure. Never the words, a name or a key; only stages, sizes and timings.
 */
/** Seconds, rounded for a log; never throws, so logging can't stop a clip. */
export const secs = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null)
export function voiceLog(stage: string, detail: Record<string, unknown> = {}): void {
  const failed = /fail|unavailable|cut|paused|not-ready/.test(stage)
  ;(failed ? console.warn : console.info)('[voice]', stage, detail)
  if (failed) problem = { stage, detail, at: Date.now() }
}
// The latest thing that went wrong with the voice, so the duty screen can say why the device's own voice was used.
let problem: { stage: string; detail: Record<string, unknown>; at: number } | null = null
export const lastVoiceProblem = () => problem
// Loaded when first needed, so these modules (and their tests) don't open a Supabase connection just by loading.
const db = async () => (await import('../../lib/supabase')).supabase

/** Dev builds only: when each step of an announcement happened, to measure how soon speech follows the chime. */
export interface VoiceTiming { id: string; stage: string; at: number }
export const voiceTimings: VoiceTiming[] = []
export function markVoice(id: string, stage: string): void {
  if (!import.meta.env.DEV) return
  voiceTimings.push({ id, stage, at: Math.round(performance.now()) })
  if (voiceTimings.length > 2000) voiceTimings.shift()
  ;(globalThis as { __voiceTimings?: VoiceTiming[] }).__voiceTimings = voiceTimings
}

// Who each announcement is about, with the school's pronunciation (set by the gate queue from the children it loads).
let children: ReadonlyMap<string, VoiceChild> = new Map()
export const setVoiceChildren = (map: ReadonlyMap<string, VoiceChild>) => { children = map }
export const voiceChild = (id?: string) => (id ? children.get(id) ?? null : null)

// The voice the school's clips are made in (voice_version(), set by the pronounce function). Null until loaded, or
// before the first clips are made: then the gate uses the tablet's own voice.
let version: string | null = null
// The version being read. Start duty plays its sound check in the same tap that asks for the version; without waiting
// for it, the check found no version, skipped the school's stored clip and had a new one made every time.
let loadingVersion: Promise<string | null> | null = null
/** Reads the clips' voice version once per duty (Start duty, or reopening the duty screen). */
export function loadVoiceVersion(): Promise<string | null> {
  loadingVersion ??= (async () => {
    try {
      const { data, error } = await (await db()).rpc('voice_version')
      if (!error) {
        if (data !== version) memory.clear()
        version = typeof data === 'string' && data ? data : null
        voiceLog('version', { ready: !!version })
      } else voiceLog('version-failed', { code: error.code })
    } catch { voiceLog('version-failed', { offline: true }) /* keep what we had */ }
    return version
  })().finally(() => { loadingVersion = null })
  return loadingVersion
}

const cacheName = (v: string) => `${CACHE_PREFIX}${v}`
async function deviceCache(): Promise<Cache | null> {
  try { return version && typeof caches !== 'undefined' ? await caches.open(cacheName(version)) : null } catch { return null }
}

/** Frees the space earlier voices used on this iPad, and clips of an older voice version. */
export async function clearRetiredVoiceCaches(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    for (const name of await caches.keys()) {
      // Only once the current version is known: offline, an unknown version must not wipe the clips this iPad has.
      if (RETIRED.includes(name) || (version && name.startsWith(CACHE_PREFIX) && name !== cacheName(version))) await caches.delete(name)
    }
  } catch { /* storage blocked: nothing to free */ }
}

// When live clips may be asked for again after the monthly cap or the hourly limit. Kept on the iPad across reloads.
let pausedUntil = (() => { try { return Number(localStorage.getItem(PAUSE_KEY)) || 0 } catch { return 0 } })()
function pause(until: number): void {
  pausedUntil = until
  try { localStorage.setItem(PAUSE_KEY, String(until)) } catch { /* storage blocked: this session only */ }
}
const nextMonthUtc = (now = new Date()) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)

const cacheRequest = (key: string) => new Request(`${location.origin}/voice/${key}.mp3`)
const keep = (cache: Cache | null, key: string, bytes: ArrayBuffer) =>
  cache?.put(cacheRequest(key), new Response(bytes.slice(0), { headers: { 'Content-Type': 'audio/mpeg' } })).catch(() => {})

/** The clip if this iPad or the school already has it, else null. Never makes one. */
async function stored(sentence: string): Promise<ArrayBuffer | null> {
  if (!version && loadingVersion) await loadingVersion
  if (!version) return null
  const key = await clipKey(version, sentence)
  const cache = await deviceCache()
  const kept = await cache?.match(cacheRequest(key)).catch(() => undefined)
  if (kept) return kept.arrayBuffer()
  const { data } = await (await db()).storage.from(BUCKET).download(clipPath(key))
  if (!data) return null
  const bytes = await data.arrayBuffer()
  await keep(cache, key, bytes)
  voiceLog('clip-loaded', { from: 'store', bytes: bytes.byteLength })
  return bytes
}

/** Asks the pronounce function to make a sentence nobody made ahead (a preview, or a relation new today). Capped. */
async function make(sentence: string): Promise<ArrayBuffer> {
  // npm run dev:demo has no voice service: the tablet's own voice speaks, and nothing leaves the browser.
  if (import.meta.env.DEV && import.meta.env.VITE_DEMO === '1') throw new Error('demo: no voice service')
  if (Date.now() < pausedUntil) throw new Error('voice paused')
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
  if (res.status === 429) {
    const { reason } = (await res.json().catch(() => ({}))) as { reason?: string }
    pause(reason === 'cap' ? nextMonthUtc() : Date.now() + RATE_PAUSE_MS)
    debug('paused', reason)
  }
  if (!res.ok) { voiceLog('make-failed', { status: res.status }); throw new Error(`pronounce ${res.status}`) }
  const bytes = await res.arrayBuffer()
  voiceLog('clip-made', { bytes: bytes.byteLength })
  // Kept under the voice the server says it used, so a clip never lands under the wrong version.
  const made = res.headers.get('x-voice-version')
  if (made && made === version) await keep(await deviceCache(), await clipKey(made, sentence), bytes)
  return bytes
}

// Decoded clips for this session; the same sentence asked for twice shares one request. ponytail: 120 newest, about
// two busy gate hours; decoded speech is ~0.5 MB a clip, so this caps memory near 60 MB.
const memory = new Map<string, Promise<AudioBuffer>>()
// Clips an announcement is waiting for right now. Copying the whole school's clips steps aside for them, so it never
// delays what the gate is about to say.
let live = 0

/** The sentence as playable audio: kept, or made live if nobody made it ahead. Rejects when it can't be had. */
export function clipAudio(ctx: BaseAudioContext, sentence: string): Promise<AudioBuffer> {
  const hit = memory.get(sentence)
  if (hit) {
    memory.delete(sentence)
    memory.set(sentence, hit)
    return hit
  }
  live++
  const made = stored(sentence)
    .then((bytes) => bytes ?? (debug('made live'), make(sentence)))
    .finally(() => { live-- })
    .then((bytes) => { markVoice(sentence, 'response'); return ctx.decodeAudioData(bytes) })
    .then((buf) => { markVoice(sentence, 'decoded'); voiceLog('clip-ready', { seconds: secs(buf.duration) }); return buf })
  made.catch((e: unknown) => voiceLog('clip-failed', { reason: e instanceof Error ? e.message : String(e) }))
  // A failure is remembered for a minute, so a gate repeating an announcement doesn't ask again every time.
  made.catch(() => setTimeout(() => { if (memory.get(sentence) === made) memory.delete(sentence) }, FAILED_RETRY_MS))
  memory.set(sentence, made)
  if (memory.size > 120) memory.delete(memory.keys().next().value!)
  return made
}

/**
 * The sentence as playable audio only if the school already made it (on this iPad or in the store). Never makes one, so
 * looking ahead (the next reminder's words) can't spend the hourly or monthly voice allowance.
 */
export function storedClipAudio(ctx: BaseAudioContext, sentence: string): Promise<AudioBuffer | null> {
  const hit = memory.get(sentence)
  if (hit) return hit.catch(() => null)
  return stored(sentence).then((bytes) => {
    if (!bytes || memory.has(sentence)) return memory.get(sentence)?.catch(() => null) ?? null
    const buf = ctx.decodeAudioData(bytes)
    memory.set(sentence, buf)
    if (memory.size > 120) memory.delete(memory.keys().next().value!)
    return buf
  }).catch(() => null)
}

/**
 * Copies the school's clips for these sentences to this iPad, a few at a time, so announcements play instantly and
 * even without Wi-Fi. Only clips already made are copied; this never makes one or spends characters.
 */
export async function warmClips(list: readonly string[], signal?: AbortSignal): Promise<{ ready: number; missing: number }> {
  let ready = 0
  let missing = 0
  const queue = [...new Set(list)]
  const worker = async () => {
    for (let s = queue.shift(); s !== undefined && !signal?.aborted; s = queue.shift()) {
      while (live > 0 && !signal?.aborted) await new Promise((r) => setTimeout(r, 100))
      const ok = await stored(s).catch(() => null)
      if (ok) ready++
      else missing++
    }
  }
  await Promise.all(Array.from({ length: WARM_AT_ONCE }, worker))
  debug('warm', { ready, missing })
  return { ready, missing }
}
