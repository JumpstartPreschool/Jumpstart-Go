/**
 * How the gate voice is given words (D50), shared by the gate iPad (src/features/duty) and the pronounce function: text
 * tidied and made sayable, a child's approved pronunciation, and each clip's key. What the announcements say is in
 * gateAnnounce.ts.
 *
 * Names on screen never change: a child's approved pronunciation ("Aa-raadh-ya") is applied only to the words a voice
 * is given, and only within that child's own announcement.
 */

/**
 * Bump when the templates below or sayable() change: every clip is then made again, and iPads drop the old ones. The
 * voice itself is set on the server (AZURE_SPEECH_VOICE), and is part of the version too.
 */
export const WORDING_VERSION = 'templates-1'
/** The clips' version: the provider, the voice, the audio format and the wording. iPads read it with voice_version(). */
/** The voice, with its speaking style and rate when set (AZURE_SPEECH_STYLE, AZURE_SPEECH_RATE), so changing either re-records the clips. */
export const voiceVersion = (voice: string, style = '', rate = '') => `azure|${voice}${style ? `+${style}` : ''}${rate ? `@${rate}` : ''}|mp3-24k|${WORDING_VERSION}`
export const MAX_CHARS = 400

// Letters and marks in any script, digits, and the punctuation a voice uses for pauses and initials.
const UNSAYABLE = /[^\p{L}\p{M}\p{N}\s.,'’?!:;-]/gu
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu
const NOTES = /\s*\([^)]*\)/g

/** Text tidied for a voice: NFC, no invisible characters or "(Test)" notes, symbols as pauses, single spaces. */
export function tidy(text: string | null | undefined, max = MAX_CHARS): string {
  if (!text) return ''
  return text
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(NOTES, '')
    .replace(UNSAYABLE, ' ')
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
}

/** "Please get Aarav ready. Sneha is on the way." → one entry per sentence. */
export const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)

/** The text if a voice may be given it, else null: 1–400 characters of letters, marks, digits, spaces and pauses. */
export function checkSpeech(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const text = input.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!text || text.length > MAX_CHARS) return null
  return /^[\p{L}\p{M}\p{N} .,'?!:;-]+$/u.test(text) ? text : null
}

/** The clip's file name: the voice version and the exact words, hashed. Paths never contain a name. */
export async function clipKey(version: string, sentence: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${version}\n${sentence}`))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
export const clipPath = (key: string) => `sentences/${key}.mp3`

/** What the voice needs to know about a child: the name as registered, the name used day to day, and how to say it. */
export interface VoiceChild {
  fullName: string
  /** Preferred name, else the first name. */
  name: string
  /** The school's pronunciation of the full name ("Aa-raadh-ya Sharma"), or null to say it as written. */
  spoken: string | null
}

const WORD = /[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*/gu
const words = (s: string): string[] => s.match(WORD) ?? []
const lower = (s: string) => s.toLocaleLowerCase('en-IN')

/**
 * The child's name words → how each is said. Word for word when both have the same number of words; otherwise the
 * whole name is replaced where it appears, and the first word stands for the first name.
 */
function nameMap(child: VoiceChild): { whole: [string, string] | null; byWord: Map<string, string> } {
  const byWord = new Map<string, string>()
  const spoken = tidy(child.spoken, 120)
  if (!spoken) return { whole: null, byWord }
  const written = words(child.fullName)
  const said = spoken.split(' ')
  if (written.length === said.length) written.forEach((w, i) => byWord.set(lower(w), said[i]!))
  else if (written[0] && said[0]) byWord.set(lower(written[0]), said[0])
  return { whole: written.length === said.length ? null : [child.fullName, spoken], byWord }
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** 0–9999 in words, the Indian English way ("three hundred and sixty"). */
export function numberWords(n: number): string {
  if (n < 20) return ONES[n]!
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? ` ${ONES[n % 10]}` : '')
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred` + (n % 100 ? ` and ${numberWords(n % 100)}` : '')
  return `${numberWords(Math.floor(n / 1000))} thousand` + (n % 1000 ? `${n % 1000 < 100 ? ' and' : ''} ${numberWords(n % 1000)}` : '')
}

/** "3:15 PM" → "three fifteen in the afternoon"; "12:00 PM" → "twelve noon"; "13:05" → "one oh five". */
function timeWords(hour: number, min: number, half?: string): string {
  const h24 = half ? (hour % 12) + (half.toUpperCase() === 'PM' ? 12 : 0) : hour
  if (h24 === 12 && min === 0 && half) return 'twelve noon'
  const said = `${numberWords(h24 % 12 || 12)} ${min === 0 ? "o'clock" : min < 10 ? `oh ${ONES[min]}` : numberWords(min)}`
  if (!half) return said
  return `${said} ${h24 < 12 ? 'in the morning' : h24 < 17 ? 'in the afternoon' : 'in the evening'}`
}

/** 13:22 → "one twenty-two in the afternoon"; 12:00 → "twelve noon". */
export const clockWords = (h24: number, min: number) => timeWords(h24 % 12 || 12, min, h24 < 12 ? 'AM' : 'PM')

/**
 * The words a voice can read aloud. The gate voice reads text literally: "3:15 PM" or "Jr KG" come out garbled, so
 * times, numbers and the school's abbreviations are written out. Only the voice gets this; the screen keeps "3:15 PM".
 */
export function sayable(text: string): string {
  return text
    .replace(/\b(\d{1,2}):(\d{2})(?:\s*([AP]M)\b)?/gi, (all, h: string, m: string, half?: string) =>
      +h > 23 || +m > 59 || (half && (+h < 1 || +h > 12)) ? all : timeWords(+h, +m, half))
    // The school's name as two words: read as one unfamiliar word, Azure's voice dropped "Jumpstart" almost to a whisper
    // (owner, 2026-10-04). Two familiar words each get their own stress, at the same volume as the rest.
    .replace(/\bjump\s*-?\s*start\b/gi, 'Jump Start')
    .replace(/\bJr\b\.?/g, 'Junior').replace(/\bSr\b\.?/g, 'Senior').replace(/\bKG\b/g, 'K G')
    // Five or more digits is a phone or code: said digit by digit. Shorter numbers are said as numbers.
    .replace(/\d+/g, (d) => (d.length >= 5 ? [...d].map((x) => ONES[+x]).join(' ') : numberWords(+d)))
    .replace(/\s+/g, ' ')
}

/** A sentence as the voice is given it: tidied, with this child's pronunciation applied to their name only. */
export function voiceSentence(sentence: string, child?: VoiceChild | null): string {
  return sayable(named(tidy(sentence), child))
}

function named(tidied: string, child?: VoiceChild | null): string {
  let text = tidied
  if (!child?.spoken) return text
  const { whole, byWord } = nameMap(child)
  if (whole) {
    const at = lower(text).indexOf(lower(tidy(whole[0])))
    if (at >= 0) text = text.slice(0, at) + whole[1] + text.slice(at + tidy(whole[0]).length)
  }
  const names = new Set(words(child.fullName).concat(words(child.name)).map(lower))
  const say = (w: string) => (names.has(lower(w)) ? byWord.get(lower(w)) ?? w : w)
  // "Aaradhya's mother" is one word to the matcher; the name is the part before the possessive.
  return text.replace(WORD, (w) => {
    const possessive = /^(.+)'s$/i.exec(w)
    return possessive && names.has(lower(possessive[1]!)) ? `${say(possessive[1]!)}'s` : say(w)
  })
}

/** The built-in openings (gateAnnounce.ts); the gate passes the admin's own when they differ. */
export const DEFAULT_OPENINGS = ['New announcement.', 'Urgent new announcement.', 'This is a reminder.'] as const

/**
 * An announcement as the voice is given it, in at most two recordings: the opening ("New announcement."), which is
 * always the same words and so kept on each iPad, then everything else as one recording, so it flows like one person
 * speaking instead of sentences stitched together.
 */
export function voiceParts(text: string, child?: VoiceChild | null, openings: readonly string[] = DEFAULT_OPENINGS): string[] {
  const all = sentences(tidy(text))
  const opening = all[0] && openings.some((o) => tidy(o) === all[0]) ? voiceSentence(all.shift()!) : ''
  return [opening, voiceSentence(all.join(' '), child)].filter(Boolean)
}
