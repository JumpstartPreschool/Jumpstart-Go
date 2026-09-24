import type { AnnouncerOutput, ChimeKind } from './announcer'

/**
 * Chime (Web Audio) and speech (Web Speech) for announcements on the coordinator's iPad (PRD D7).
 * iPadOS only allows sound after a tap, so `unlockSound()` must run inside the Start duty tap.
 */

let ctx: AudioContext | null = null
let voice: SpeechSynthesisVoice | null = null
// Safari can skip `onend` for utterances that were garbage-collected, so keep the current one referenced.
let current: SpeechSynthesisUtterance | null = null

export const soundSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'AudioContext' in window

// macOS and iOS novelty and old-style voices: they sound robotic, so they are never offered.
const ROBOTIC = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|eddy|flo|fred|good news|grandma|grandpa|hysterical|jester|junior|kathy|organ|pipe organ|princess|ralph|reed|rocko|sandy|shelley|superstar|trinoids|whisper|wobble|zarvox)\b/i

/**
 * How human a voice sounds, from what browsers expose: neural voices (Edge "Natural", "Online") and Apple's downloaded
 * Premium and Enhanced voices first, then Google's, then the rest. Indian English is preferred, then British. -1 = never.
 */
export type VoiceQuality = 'natural' | 'premium' | 'enhanced' | 'online' | 'standard'

/** How natural a voice sounds, from its name alone. */
export function voiceQuality(name: string): VoiceQuality {
  if (/natural|neural|online/i.test(name)) return 'natural'
  if (/premium/i.test(name)) return 'premium'
  if (/enhanced/i.test(name)) return 'enhanced'
  return /^google/i.test(name) ? 'online' : 'standard'
}
const QUALITY_SCORE: Record<VoiceQuality, number> = { natural: 100, premium: 90, enhanced: 80, online: 60, standard: 0 }

export function voiceScore(v: Pick<SpeechSynthesisVoice, 'name' | 'lang'>): number {
  const lang = v.lang.replace('_', '-').toLowerCase()
  if (!lang.startsWith('en') || ROBOTIC.test(v.name)) return -1
  let score = QUALITY_SCORE[voiceQuality(v.name)]
  // Among the built-in (compact) voices these are the smooth ones; older ones such as Rishi sound mechanical.
  // Samantha, the warmest of them, leads when nothing better is installed.
  if (score === 0 && SMOOTH.test(v.name)) score += /^samantha\b/i.test(v.name) ? 45 : 40
  // The school wants a warm woman's voice for announcements (owner, 2026-09-25), so any woman's voice comes first.
  if (voiceGender(v.name) === 'female') score += 60
  score += lang === 'en-in' ? 30 : lang === 'en-gb' ? 15 : 10
  return score
}
const SMOOTH = /^(samantha|daniel|karen|moira|tessa|serena|kate|oliver|arthur|martha|ava|allison|susan|tom|evan|nathan|zoe|nicky|aaron|fiona|isha|veena)\b/i

// Browsers don't say whether a voice is a woman's or a man's, so it's recognised from the well-known voice names.
const FEMALE = /\b(samantha|karen|moira|tessa|serena|kate|martha|ava|allison|susan|zoe|nicky|fiona|isha|veena|victoria|catherine|neerja|aria|jenny|sonia|libby|natasha|clara|emily|michelle|ana|maisie|hazel|heera|kalpana|zira|female)\b/i
const MALE = /\b(daniel|rishi|oliver|arthur|tom|evan|nathan|aaron|prabhat|guy|ryan|thomas|alex|gordon|lee|ravi|george|david|mark|william|christopher|eric|brian|male)\b/i

export function voiceGender(name: string): 'female' | 'male' | null {
  if (FEMALE.test(name)) return 'female'
  return MALE.test(name) ? 'male' : null
}

/** English voices on this device, most human-sounding first. */
export function rankedVoices(): SpeechSynthesisVoice[] {
  if (!soundSupported) return []
  return speechSynthesis.getVoices()
    .filter((v) => voiceScore(v) >= 0)
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name))
}

const VOICE_KEY = 'jumpstart.voice'

/** The voice this iPad uses: the one chosen in Start duty, or the most human-sounding one available. */
function pickVoice() {
  const voices = rankedVoices()
  let saved: string | null = null
  try { saved = localStorage.getItem(VOICE_KEY) } catch { /* storage blocked: use the best voice */ }
  voice = voices.find((v) => v.name === saved) ?? voices[0] ?? null
}

export function currentVoice(): SpeechSynthesisVoice | null {
  if (!voice && soundSupported) pickVoice()
  return voice
}

/** Remember a voice for this device. */
export function chooseVoice(name: string): void {
  try { localStorage.setItem(VOICE_KEY, name) } catch { /* not remembered; still used now */ }
  pickVoice()
}

/** Call from a tap. Unlocks the chime and the voice for the rest of the session. */
export function unlockSound(): void {
  // Play through the speaker even when the iPad is in Silent Mode (WebKit Audio Session API, Safari 16.4+).
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session) session.type = 'playback'
  ctx ??= new AudioContext()
  void ctx.resume()
  speechSynthesis.cancel()
  speechSynthesis.speak(new SpeechSynthesisUtterance(' '))
  pickVoice()
  speechSynthesis.onvoiceschanged = pickVoice
}

// Flagged requests get a different, rising three-note pattern (ANN-2).
const NOTES: Record<ChimeKind, number[]> = { normal: [659.3, 987.8], flagged: [784, 988, 1175] }
const NOTE_GAP = 0.2
const NOTE_LENGTH = 0.55

export function chime(kind: ChimeKind): Promise<void> {
  if (!ctx) return Promise.resolve()
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
    osc.start(t)
    osc.stop(t + NOTE_LENGTH + 0.05)
  })
  const ms = ((NOTES[kind].length - 1) * NOTE_GAP + NOTE_LENGTH + 0.15) * 1000
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function speak(text: string, voiceOverride?: SpeechSynthesisVoice): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    const v = voiceOverride ?? currentVoice()
    if (v) u.voice = v
    u.lang = v?.lang ?? 'en-IN'
    // A touch slower than default, at natural pitch: clearer across a noisy gate without sounding drawn out.
    u.rate = 0.95
    u.pitch = 1
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(fallback)
      if (current === u) current = null
      resolve()
    }
    // ponytail: Safari occasionally never fires onend; a length-based timeout keeps the queue moving.
    const fallback = setTimeout(finish, 4000 + text.length * 90)
    u.onend = finish
    u.onerror = finish
    current = u
    speechSynthesis.speak(u)
  })
}

export function stopSound(): void {
  speechSynthesis.cancel()
}

export const deviceOutput: AnnouncerOutput = { chime, speak, stop: stopSound }
