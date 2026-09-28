import { voiceLines } from '../../../supabase/functions/_shared/announce.ts'
import type { AnnouncerOutput, ChimeKind } from './announcer'
import { clearRetiredVoiceCaches, clipAudio, voiceChild } from './voiceClips'

/**
 * Chime and voice for announcements on the coordinator's iPad (PRD D7, D48). The voice is the school's own Indian
 * voice, made ahead of time on the school's computer (voiceClips.ts). When a sentence isn't ready in time, the iPad's own
 * Indian English voice says that announcement instead; without one, the chime and the screen still carry it.
 * iPadOS only allows sound after a tap, so `unlockSound()` must run inside the Start duty tap.
 */

let ctx: AudioContext | null = null
// Bumped by stopSound. Anything started before a Stop (a clip still downloading, a sentence still queued) checks it
// and never plays afterwards, so End duty and Mute are silent at once.
let generation = 0
// Everything now sounding through Web Audio: chime notes and voice clips.
const sounding = new Set<AudioScheduledSourceNode>()
// Ends the device voice's sentence at once: browsers don't always fire onend/onerror after cancel().
let endDevice: (() => void) | null = null
// Safari can skip `onend` for utterances that were garbage-collected, so keep the current one referenced.
let utterance: SpeechSynthesisUtterance | null = null

export const soundSupported = typeof window !== 'undefined' && 'AudioContext' in window
const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

/** How long speech may wait for its clips after the chime before the iPad's own voice says it instead. */
export const CLIP_BUDGET_MS = 1200
/**
 * The sound check after Start duty waits longer: on that first tap the clip still has to download to the iPad, which
 * takes more than 1.2 s, and the check should sound like the real gate, not the tablet's voice.
 */
export const SOUND_CHECK_BUDGET_MS = 8000
const SENTENCE_GAP_MS = 120

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Call from a tap. Unlocks the chime and the voice for the rest of the session. */
export function unlockSound(): void {
  // Play through the speaker even when the iPad is in Silent Mode (WebKit Audio Session API, Safari 16.4+).
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session) session.type = 'playback'
  audioContext()
  if (speechSupported) {
    speechSynthesis.cancel()
    speechSynthesis.speak(new SpeechSynthesisUtterance(' '))
  }
  void clearRetiredVoiceCaches()
}

/** The shared audio output, resumed (call from a tap, e.g. a pronunciation preview). */
export function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
    // iOS pauses Web Audio when the iPad locks or another app takes the sound; ask for it back on return.
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') void ctx.resume().catch(() => {})
    })
  }
  void ctx.resume()
  return ctx
}

const RESUME_WAIT_MS = 500

/**
 * Whether Web Audio can sound now, trying to resume it first. A paused context plays nothing and never ends its
 * clips, so callers use the device voice instead of waiting on it.
 */
async function running(audio: AudioContext): Promise<boolean> {
  if (audio.state === 'running') return true
  await Promise.race([audio.resume().catch(() => {}), wait(RESUME_WAIT_MS)])
  // Read again: resume() changes it, which TypeScript can't see.
  return (audio.state as AudioContextState) === 'running'
}

function track(node: AudioScheduledSourceNode): void {
  sounding.add(node)
  node.addEventListener('ended', () => sounding.delete(node))
}

// Flagged requests get a different, rising three-note pattern (ANN-2).
const NOTES: Record<ChimeKind, number[]> = { normal: [659.3, 987.8], flagged: [784, 988, 1175] }
const NOTE_GAP = 0.2
const NOTE_LENGTH = 0.55

export function chime(kind: ChimeKind): Promise<void> {
  if (!ctx) return Promise.resolve()
  if (ctx.state !== 'running') return running(ctx).then((ok) => (ok ? chime(kind) : undefined))
  const audio = ctx
  const start = audio.currentTime + 0.03
  NOTES[kind].forEach((freq, i) => {
    const t = start + i * NOTE_GAP
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + NOTE_LENGTH)
    osc.connect(gain).connect(audio.destination)
    track(osc)
    osc.start(t)
    osc.stop(t + NOTE_LENGTH + 0.05)
  })
  return wait(((NOTES[kind].length - 1) * NOTE_GAP + NOTE_LENGTH + 0.15) * 1000)
}

/** Plays one clip, unless a Stop came first. Resolves when it ends or is stopped. */
function play(buf: AudioBuffer, mine: number): Promise<void> {
  if (mine !== generation || !ctx) return Promise.resolve()
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  return new Promise((resolve) => {
    // If the audio is paused mid-clip, 'ended' never fires; without this the gate queue would stop for good.
    const guard = setTimeout(resolve, buf.duration * 1000 + 1500)
    src.addEventListener('ended', () => { clearTimeout(guard); resolve() })
    track(src)
    src.start()
  })
}

/**
 * Says an announcement (the words shown on screen; the child's approved pronunciation is applied only for the voice).
 * The school's voice when every sentence's clip is ready within CLIP_BUDGET_MS, else the iPad's Indian English voice,
 * so one announcement is never said in two voices and the gate never waits. Never rejects.
 */
export async function speak(text: string, childId?: string, budgetMs = CLIP_BUDGET_MS): Promise<void> {
  const lines = voiceLines(text, voiceChild(childId))
  if (!lines.length) return
  const mine = generation
  if (ctx) {
    const audio = ctx
    const all = Promise.all(lines.map((line) => clipAudio(audio, line)))
    // Still being made in the background when the budget runs out: the next repeat uses it.
    all.catch(() => {})
    // Paused by iOS: clips would play silently, so the tablet's voice says it (the clips stay ready for later).
    if (!(await running(audio))) return speakDevice(lines.join(' '), mine)
    const clips = await Promise.race([all, wait(budgetMs).then(() => null)]).catch(() => null)
    if (mine !== generation) return
    if (clips) {
      for (const [i, clip] of clips.entries()) {
        if (mine !== generation) return
        if (i > 0) await wait(SENTENCE_GAP_MS)
        await play(clip, mine)
      }
      return
    }
  }
  await speakDevice(lines.join(' '), mine)
}

/** Starts getting an announcement's clips (from this iPad, the school, or made now) so speech starts without a pause. */
export function prepare(text: string, childId?: string): void {
  if (!ctx) return
  for (const line of voiceLines(text, voiceChild(childId))) void clipAudio(ctx, line).catch(() => {})
}

/**
 * Plays one sentence in the school's voice, waiting for it to be made if needed (a pronunciation preview, not the
 * gate). `onStart` runs the moment sound begins. Rejects when it can't be made, so the preview can say so.
 */
export async function playSentence(sentence: string, onStart?: () => void): Promise<void> {
  stopSound()
  const mine = generation
  const [line] = voiceLines(sentence)
  if (!line) return
  const clip = await clipAudio(audioContext(), line)
  if (mine !== generation) return
  onStart?.()
  await play(clip, mine)
}

// The iPad's own Indian English voice, used only when the school's clip isn't ready. Never another accent: a wrong
// accent says Indian names worse than silence plus the name on screen.
// Clearest first, measured by recording each voice and transcribing it (2026-09-27): Apple's Tara, the Siri voice,
// garbled "Urgent. Reminder. Pickup for…" into nonsense; Rishi and Aman said every word. Natural voices (Edge's Neerja,
// "Enhanced"/"Premium" downloads) beat all of them.
const PREFERRED = [/natural|online|enhanced|premium/i, /\brishi\b/i, /\baman\b/i, /\b(neerja|isha|heera|lekha)\b/i]
const LAST = /\b(tara|siri|veena)\b/i
export function pickIndianVoice<V extends Pick<SpeechSynthesisVoice, 'name' | 'lang'>>(all: readonly V[]): V | null {
  const voices = all.filter((v) => v.lang.replace('_', '-').toLowerCase() === 'en-in')
  for (const p of PREFERRED) {
    const v = voices.find((x) => p.test(x.name) && !LAST.test(x.name))
    if (v) return v
  }
  return voices.find((v) => !LAST.test(v.name)) ?? voices[0] ?? null
}
// Safari fills the voice list a moment after the page loads: wait for it once rather than stay silent.
async function indianVoice(): Promise<SpeechSynthesisVoice | null> {
  if (!speechSynthesis.getVoices().length) {
    await Promise.race([new Promise((r) => speechSynthesis.addEventListener('voiceschanged', r, { once: true })), wait(1000)])
  }
  return pickIndianVoice(speechSynthesis.getVoices())
}

async function speakDevice(text: string, mine: number): Promise<void> {
  if (!speechSupported || mine !== generation) return
  const voice = await indianVoice()
  if (!voice || mine !== generation) return
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice
    u.lang = voice.lang
    // A touch slower than default, at natural pitch: clearer across a noisy gate without sounding drawn out.
    u.rate = 0.95
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(fallback)
      if (utterance === u) utterance = null
      if (endDevice === finish) endDevice = null
      resolve()
    }
    // ponytail: Safari occasionally never fires onend; a length-based timeout keeps the queue moving.
    const fallback = setTimeout(finish, 4000 + text.length * 90)
    u.onend = finish
    u.onerror = finish
    utterance = u
    endDevice = finish
    speechSynthesis.speak(u)
  })
}

/** Silences everything at once: chime, voice clip, device voice, and anything still on its way. */
export function stopSound(): void {
  generation += 1
  for (const node of sounding) {
    try { node.stop() } catch { /* not started or already ended */ }
  }
  sounding.clear()
  if (speechSupported) speechSynthesis.cancel()
  endDevice?.()
}

export const deviceOutput: AnnouncerOutput = { chime, speak, stop: stopSound, prepare }
