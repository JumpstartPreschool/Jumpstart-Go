import type { VoiceReply, VoiceRequest } from './voice.worker'

/**
 * Human-sounding announcements (owner, 2026-09-25): Kokoro's women's voices, generated on this iPad. It works offline
 * once downloaded, costs nothing, and child names never leave the device. Until it's ready (or if it fails), the
 * device's own voice speaks instead, so the gate is never silent.
 */
export const NATURAL_VOICES = [
  { id: 'af_heart', name: 'Heart', note: 'Warm and friendly' },
  { id: 'af_bella', name: 'Bella', note: 'Bright and clear' },
  { id: 'bf_emma', name: 'Emma', note: 'Calm, British' },
] as const
export type NaturalVoiceId = (typeof NATURAL_VOICES)[number]['id']
export const DEFAULT_NATURAL: NaturalVoiceId = 'af_heart'

export type NaturalStatus =
  | { state: 'idle' }
  | { state: 'loading'; loaded: number; total: number }
  | { state: 'ready' }
  | { state: 'failed' }

let status: NaturalStatus = { state: 'idle' }
const listeners = new Set<(s: NaturalStatus) => void>()
const setStatus = (s: NaturalStatus) => { status = s; listeners.forEach((fn) => fn(s)) }

export const naturalStatus = () => status
export function onNaturalStatus(fn: (s: NaturalStatus) => void): () => void {
  listeners.add(fn)
  fn(status)
  return () => void listeners.delete(fn)
}

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (a: { samples: Float32Array; rate: number }) => void; reject: (e: Error) => void }>()

function start(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./voice.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<VoiceReply>) => {
    const m = e.data
    if (m.type === 'progress') setStatus({ state: 'loading', loaded: m.loaded, total: m.total })
    else if (m.type === 'ready') setStatus({ state: 'ready' })
    else if (m.type === 'failed') setStatus({ state: 'failed' })
    else if (m.type === 'audio') { pending.get(m.id)?.resolve(m); pending.delete(m.id) }
    else if (m.type === 'error') { pending.get(m.id)?.reject(new Error(m.message)); pending.delete(m.id) }
  }
  // The worker itself couldn't run (very old browser, or out of memory): fall back to the device voice for good.
  worker.onerror = () => {
    setStatus({ state: 'failed' })
    pending.forEach((p) => p.reject(new Error('voice worker stopped')))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

async function gpuAvailable(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return !!(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
}

/** Starts the one-time download in the background (Start duty does this). Safe to call again. */
export function prepareNaturalVoice(): void {
  if (typeof Worker === 'undefined' || status.state === 'ready' || status.state === 'loading') return
  setStatus({ state: 'loading', loaded: 0, total: 0 })
  void gpuAvailable().then((gpu) => start().postMessage({ type: 'load', device: gpu ? 'webgpu' : 'wasm' } satisfies VoiceRequest))
}

// Repeats every 2 minutes are the same words, so each sentence is made once. ponytail: 40 newest; enough for a busy gate.
const cache = new Map<string, Promise<AudioBuffer>>()

/** The sentence as audio, made on this device (or from the cache). Rejects if the natural voice isn't ready. */
export function naturalAudio(ctx: AudioContext, text: string, voice: NaturalVoiceId): Promise<AudioBuffer> {
  if (status.state !== 'ready') return Promise.reject(new Error('natural voice not ready'))
  const key = `${voice}|${text}`
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const id = ++seq
  const made = new Promise<{ samples: Float32Array; rate: number }>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    start().postMessage({ type: 'speak', id, text, voice } satisfies VoiceRequest)
  }).then(({ samples, rate }) => {
    const buf = ctx.createBuffer(1, samples.length, rate)
    buf.copyToChannel(new Float32Array(samples), 0)
    return buf
  })
  made.catch(() => cache.delete(key))
  cache.set(key, made)
  if (cache.size > 40) cache.delete(cache.keys().next().value!)
  return made
}

let playing: AudioBufferSourceNode | null = null

/** Plays through the same audio as the chime (the iPad's speaker, or whatever it's connected to). */
export function playBuffer(ctx: AudioContext, buf: AudioBuffer): Promise<void> {
  return new Promise((resolve) => {
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.onended = () => {
      if (playing === src) playing = null
      resolve()
    }
    playing = src
    src.start()
  })
}

export function stopNatural(): void {
  try { playing?.stop() } catch { /* already ended */ }
  playing = null
}
