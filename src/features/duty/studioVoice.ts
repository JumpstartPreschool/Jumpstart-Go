import { supabase } from '../../lib/supabase'

/**
 * The studio voice (ElevenLabs, D43) on the coordinator's tablet. Audio comes from the voice-say function, which makes
 * each announcement once and keeps it; this device keeps its own copy too, so a repeat plays at once and even offline:
 *   memory (this session) → this device's cache (Cache Storage) → voice-say (the school's cache, else ElevenLabs).
 * Anything slow or failing rejects, and sound.ts falls back to the device's own voice: the gate always hears it.
 */

const DEVICE_CACHE = 'jumpstart-studio-voice-v1'
const MISS_TIMEOUT_MS = 10_000
const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-say`
const debug = (...a: unknown[]) => { if (import.meta.env.DEV) console.debug('[voice]', ...a) }

let configured: boolean | null = null
let probing: Promise<boolean> | null = null
const listeners = new Set<(ok: boolean | null) => void>()

async function call(body: object, signal?: AbortSignal): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('signed out')
  return fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}

/** Whether the school has set up the studio voice (asked once per session). */
export function studioAvailable(): Promise<boolean> {
  if (configured !== null) return Promise.resolve(configured)
  probing ??= call({ probe: true }, AbortSignal.timeout(8000))
    .then(async (r) => (r.ok ? !!((await r.json()) as { configured?: boolean }).configured : false))
    .catch(() => false)
    .then((ok) => {
      configured = ok
      listeners.forEach((fn) => fn(ok))
      return ok
    })
  return probing
}
/** Known answer, or null before the first check. */
export const studioKnown = () => configured
export function onStudioAvailable(fn: (ok: boolean | null) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

async function sha(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function deviceCache(): Promise<Cache | null> {
  try { return typeof caches === 'undefined' ? null : await caches.open(DEVICE_CACHE) } catch { return null }
}

/** The announcement's MP3: this device's copy, else the school's (fetched once and kept here). */
async function mp3(text: string): Promise<ArrayBuffer> {
  const request = new Request(`${location.origin}/studio-voice/${await sha(text)}.mp3`)
  const cache = await deviceCache()
  const kept = await cache?.match(request).catch(() => undefined)
  if (kept) {
    debug('device cache hit')
    return kept.arrayBuffer()
  }
  const res = await call({ text }, AbortSignal.timeout(MISS_TIMEOUT_MS))
  if (!res.ok) {
    debug('failed', res.status)
    if (res.status === 503) configured = false // not set up after all: stop asking this session
    throw new Error(`voice-say ${res.status}`)
  }
  debug(res.headers.get('x-voice-cache') === 'hit' ? 'school cache hit' : 'made by ElevenLabs')
  const bytes = await res.arrayBuffer()
  await cache?.put(request, new Response(bytes.slice(0), { headers: { 'Content-Type': 'audio/mpeg' } })).catch(() => {})
  return bytes
}

// Decoded audio for this session. The same words asked for twice share one request. ponytail: 40 newest, as naturalVoice.
const memory = new Map<string, Promise<AudioBuffer>>()

/** The sentence as playable audio in the studio voice. Rejects when the voice isn't set up, is slow, or fails. */
export function studioAudio(ctx: AudioContext, text: string): Promise<AudioBuffer> {
  if (configured === false) return Promise.reject(new Error('studio voice not set up'))
  const hit = memory.get(text)
  if (hit) {
    memory.delete(text)
    memory.set(text, hit)
    return hit
  }
  const made = mp3(text).then((bytes) => ctx.decodeAudioData(bytes))
  made.catch(() => memory.delete(text))
  memory.set(text, made)
  if (memory.size > 40) memory.delete(memory.keys().next().value!)
  return made
}
