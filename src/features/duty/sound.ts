import { DEFAULT_OPENINGS, voiceParts } from '../../../supabase/functions/_shared/announce.ts'
import type { AnnouncerOutput, ChimeKind } from './announcer'
import { clearRetiredVoiceCaches, clipAudio, loadVoiceVersion, markVoice, voiceChild } from './voiceClips'

/**
 * Chime and voice for announcements on the coordinator's iPad (PRD D7, D50). The voice is the school's Indian English
 * voice (Azure), made ahead of time for every child and kept on the iPad (voiceClips.ts). When a clip isn't ready soon
 * after the chime, the iPad's own Indian English voice says it instead; without one, the chime and the screen carry it.
 * iPadOS only allows sound after a tap, so `unlockSound()` must run inside the Start duty tap.
 */

// The admin's openings (0042): each is kept on the iPad as its own clip, so the voice must know them to split it off.
let openings: readonly string[] = DEFAULT_OPENINGS
export const setVoiceOpenings = (list: readonly string[]) => { openings = list }

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

/**
 * How long each part may keep the gate waiting before the iPad's own voice says it instead: the opening, after the
 * chime; the message, after the opening. Both were asked for when the chime started (prepare), so the opening has had
 * the chime (0.9 s) plus this, and the message the chime, the opening (~1 s) and this.
 */
export const CLIP_BUDGET_MS = 300
/**
 * The sound check after Start duty waits longer: it is the day's first request, so the pronounce function may be
 * starting up, and the check should sound like the real gate, not the tablet's voice.
 */
export const SOUND_CHECK_BUDGET_MS = 8000
// The natural pause after "New announcement." before the message.
const PART_GAP_MS = 150

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// iPhone and iPad before iOS 17 have no Audio Session API, and their Web Audio is muted by the ring/silent switch. A
// playing media element moves the page into the "playback" audio category, which the switch doesn't mute, so on those
// devices a silent loop plays for the whole duty. It is pure silence; nothing is ever heard from it.
let keepAlive: HTMLAudioElement | null = null
const isApple = () => typeof navigator !== 'undefined' && (/iPhone|iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))
function silentWav(seconds = 1, rate = 8000): string {
  const n = seconds * rate
  const b = new DataView(new ArrayBuffer(44 + n))
  const text = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)))
  text(0, 'RIFF'); b.setUint32(4, 36 + n, true); text(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true)
  b.setUint32(24, rate, true); b.setUint32(28, rate, true); b.setUint16(32, 1, true); b.setUint16(34, 8, true); text(36, 'data'); b.setUint32(40, n, true)
  for (let i = 0; i < n; i++) b.setUint8(44 + i, 128) // 8-bit PCM silence is 128
  return URL.createObjectURL(new Blob([b.buffer], { type: 'audio/wav' }))
}

/** Call from a tap (Start duty, Resume, or "turn sound back on"). Unlocks the chime and both voices for the session. */
export function unlockSound(): void {
  // Play through the speaker even when the ring/silent switch is on (WebKit Audio Session API, iOS 17+).
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session) session.type = 'playback'
  else if (isApple() && typeof Audio !== 'undefined') {
    keepAlive ??= Object.assign(new Audio(silentWav()), { loop: true })
    keepAlive.setAttribute('playsinline', '')
    void keepAlive.play().catch(() => {})
  }
  const audio = audioContext()
  // Some iOS versions only count Web Audio as started by the tap once a buffer has actually played inside it.
  try {
    const src = audio.createBufferSource()
    src.buffer = audio.createBuffer(1, 1, 22050)
    src.connect(audio.destination)
    src.start(0)
  } catch { /* nothing to warm up */ }
  if (speechSupported) {
    // iOS unlocks the device voice only for a real sentence spoken inside a tap; an empty one is dropped. Said silently.
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance('Ready.')
    u.volume = 0
    speechSynthesis.speak(u)
  }
  // Which voice the school's clips are in, then free the space older versions used on this iPad.
  void loadVoiceVersion().then(clearRetiredVoiceCaches)
}

/** Ends the duty's audio session: the silent keep-alive stops, so the device's own sound rules apply again. */
export function releaseSound(): void {
  keepAlive?.pause()
}

/** Whether the gate can make sound right now without another tap: Web Audio running (resumed if iOS paused it). */
export async function soundReady(): Promise<boolean> {
  if (!ctx) return false
  return running(ctx)
}

/** The shared audio output, resumed (call from a tap, e.g. a pronunciation preview). */
export function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
    // iOS pauses Web Audio when the iPad locks or another app takes the sound; ask for it back on return.
    // pageshow: an installed app restored from memory may skip visibilitychange; focus: back from another app.
    const back = () => { if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') void ctx.resume().catch(() => {}) }
    globalThis.document?.addEventListener('visibilitychange', back)
    globalThis.addEventListener?.('pageshow', back)
    globalThis.addEventListener?.('focus', back)
    // The silent keep-alive is paused by iOS with the rest of the page's media; start it again on return.
    globalThis.document?.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && keepAlive && keepAlive.paused) void keepAlive.play().catch(() => {}) })
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

/** Plays the chime. Resolves true once it has sounded, false when the audio couldn't play (not unlocked, or paused). */
export function chime(kind: ChimeKind): Promise<boolean> {
  if (!ctx) return Promise.resolve(false)
  if (ctx.state !== 'running') return running(ctx).then((ok) => (ok ? chime(kind) : false))
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
  return wait(((NOTES[kind].length - 1) * NOTE_GAP + NOTE_LENGTH + 0.15) * 1000).then(() => true)
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
 * The opening ("New announcement.") plays as soon as it's ready, and the message, one continuous recording, follows
 * while the gate listens; whichever part isn't ready within CLIP_BUDGET_MS is said by the iPad's Indian English voice,
 * so the gate never waits. Never rejects.
 */
/** Which voice said it: the school's clips, the device's own voice (all or part), or nothing at all. */
export type Spoken = 'school' | 'device' | 'silent'

export async function speak(text: string, childId?: string, budgetMs = CLIP_BUDGET_MS): Promise<Spoken> {
  const parts = voiceParts(text, voiceChild(childId), openings)
  if (!parts.length) return 'silent'
  const mine = generation
  markVoice(text, 'chime-end')
  if (ctx) {
    const audio = ctx
    const clips = parts.map((part) => clipAudio(audio, part))
    // Still being made when the time runs out: kept for the 2-minute repeat.
    for (const clip of clips) clip.catch(() => {})
    // Paused by iOS: clips would play silently, so the tablet's voice says it (the clips stay ready for later).
    if (!(await running(audio))) return speakDevice(parts.join(' '), mine)
    for (const [i, clip] of clips.entries()) {
      if (i > 0) await wait(PART_GAP_MS)
      if (mine !== generation) return 'silent'
      const buf = await Promise.race([clip, wait(budgetMs).then(() => null)]).catch(() => null)
      if (mine !== generation) return 'silent'
      if (!buf) {
        markVoice(text, 'device-voice')
        // One owner per announcement: the late clip is never played once the device voice has taken over.
        const rest = await speakDevice(parts.slice(i).join(' '), mine)
        return i > 0 && rest === 'silent' ? 'school' : rest
      }
      markVoice(text, i === 0 ? 'speech-start' : 'message-start')
      await play(buf, mine)
      if (i === 0) markVoice(text, 'opening-end')
    }
    return mine === generation ? 'school' : 'silent'
  }
  markVoice(text, 'device-voice')
  return speakDevice(parts.join(' '), mine)
}

/** Starts getting an announcement's clips (from this iPad or the school's store) so speech starts without a pause. */
export function prepare(text: string, childId?: string): void {
  if (!ctx) return
  markVoice(text, 'prepare')
  for (const part of voiceParts(text, voiceChild(childId), openings)) void clipAudio(ctx, part).catch(() => {})
}

/**
 * Plays one sentence in the school's voice, waiting for it to be made if needed (a pronunciation preview, not the gate).
 * `onStart` runs the moment sound begins. Rejects when it can't be made, so the preview can say so.
 */
export async function playSentence(sentence: string, onStart?: () => void): Promise<void> {
  stopSound()
  const mine = generation
  const [line] = voiceParts(sentence)
  if (!line) return
  const clip = await clipAudio(audioContext(), line)
  if (mine !== generation) return
  onStart?.()
  await play(clip, mine)
}

// The iPad's own Indian English voice, used only when the school's clip isn't ready: a woman's voice, like the gate voice.
// Never another accent: a wrong accent says Indian names worse than silence plus the name on screen.
// Measured by recording each voice and transcribing it (2026-09-27): Apple's Tara, the Siri voice, garbled
// "Urgent. Reminder. Pickup for…" into nonsense, so it comes last; Rishi and Aman (men's voices) said every word, so
// they are used only when no clear woman's voice is installed. Isha (Settings → Accessibility → Spoken Content) is best.
const FEMALE = /\b(isha|neerja|heera|lekha)\b/i
const PREFERRED = [
  new RegExp(`(${FEMALE.source}.*(natural|online|enhanced|premium))|((natural|online|enhanced|premium).*${FEMALE.source})`, 'i'),
  FEMALE,
  /\brishi\b/i,
  /\baman\b/i,
]
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

async function speakDevice(text: string, mine: number): Promise<Spoken> {
  if (!speechSupported || mine !== generation) return 'silent'
  const voice = await indianVoice()
  if (!voice || mine !== generation) return 'silent'
  return new Promise((resolve) => {
    let started = false
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
      resolve(started ? 'device' : 'silent')
    }
    // ponytail: Safari occasionally never fires onend; a length-based timeout keeps the queue moving.
    const fallback = setTimeout(finish, 4000 + text.length * 90)
    // onstart is the proof the voice really spoke: a blocked voice can end at once without a sound.
    u.onstart = () => { started = true }
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
