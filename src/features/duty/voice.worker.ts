/// <reference lib="webworker" />
/**
 * The natural voice (Kokoro, open weights, Apache-2.0), run on this iPad in a worker so the gate screen never stutters.
 * The model downloads once (about 330 MB with a GPU, 90 MB without) and is kept in the browser's cache; nothing said is
 * sent anywhere.
 */
import { KokoroTTS } from 'kokoro-js'

export type VoiceRequest = { type: 'load'; device: 'webgpu' | 'wasm' } | { type: 'speak'; id: number; text: string; voice: string }
export type VoiceReply =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'audio'; id: number; samples: Float32Array; rate: number }
  | { type: 'error'; id: number; message: string }

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
let tts: Promise<KokoroTTS> | null = null
const post = (m: VoiceReply, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer)

let device: 'webgpu' | 'wasm' = 'wasm'
function load(): Promise<KokoroTTS> {
  if (!tts) {
    // Several files download at once; report their sum so the progress bar only moves forward.
    const files = new Map<string, { loaded: number; total: number }>()
    tts = KokoroTTS.from_pretrained(MODEL, {
      // The GPU runs the full-precision model several times faster than real time; without one, the 8-bit model on the CPU.
      dtype: device === 'webgpu' ? 'fp32' : 'q8',
      device,
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== 'progress' || !p.file) return
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
        let loaded = 0, total = 0
        for (const f of files.values()) { loaded += f.loaded; total += f.total }
        post({ type: 'progress', loaded, total })
      },
    })
    // One short sentence first, so the first real announcement isn't slowed by the model warming up.
    tts.then((m) => m.generate('Ready.', { voice: 'af_heart' })).then(() => post({ type: 'ready' }), (e: unknown) => { tts = null; post({ type: 'failed', message: String(e) }) })
  }
  return tts
}

self.onmessage = async (e: MessageEvent<VoiceRequest>) => {
  const m = e.data
  if (m.type === 'load') { device = m.device; return void load().catch(() => {}) }
  try {
    const model = await load()
    const audio = await model.generate(m.text, { voice: m.voice as 'af_heart', speed: 0.95 })
    const samples = audio.audio as Float32Array
    post({ type: 'audio', id: m.id, samples, rate: audio.sampling_rate }, [samples.buffer])
  } catch (err) {
    post({ type: 'error', id: m.id, message: String(err) })
  }
}
