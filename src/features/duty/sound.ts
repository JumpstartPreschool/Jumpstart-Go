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

function pickVoice() {
  const voices = speechSynthesis.getVoices()
  voice =
    voices.find((v) => v.lang === 'en-IN') ??
    voices.find((v) => v.lang.startsWith('en-GB')) ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null
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

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'en-IN'
    u.rate = 0.95
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

export const deviceOutput: AnnouncerOutput = { chime, speak }
