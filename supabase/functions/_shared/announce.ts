/**
 * The gate voice's words, shared by the coordinator's iPad (src/features/duty) and the pronounce function, so both
 * build exactly the same sentences and the same clip keys. The iPad plays a sentence only if the school already has its
 * clip, or can make one in time; the pronounce function makes each child's everyday sentences ahead of time.
 *
 * Names on screen never change: a child's approved pronunciation ("Aa-raadh-ya") is applied only to the words a voice
 * is given, and only within that child's own announcement.
 */

/**
 * Part of every clip key. Change it whenever the model, its revision, the speaker, the description, the seed or the
 * audio format changes: every clip is then made again instead of mixing two voices.
 */
export const VOICE_VERSION = 'indic-parler-tts@7b527af5|mary|calm-v1|seed-20260927|mp3-64k'
/**
 * Bump when the words a voice is given change (sayable(), the building blocks below) but the voice doesn't. The
 * pronounce function then makes the shared phrases again and requeues every child's sentences.
 */
export const WORDING_VERSION = 'words-3'
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

/** "Please get Aarav ready. Sneha is on the way." → one entry per sentence. Each sentence is one clip. */
export const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)

/** The text if a voice may be given it, else null: 1–400 characters of letters, marks, digits, spaces and pauses. */
export function checkSpeech(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const text = input.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!text || text.length > MAX_CHARS) return null
  return /^[\p{L}\p{M}\p{N} .,'?!:;-]+$/u.test(text) ? text : null
}

/** The clip's file name: the voice version and the exact words, hashed. Paths never contain a name. */
export async function clipKey(sentence: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${VOICE_VERSION}\n${sentence}`))
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
function numberWords(n: number): string {
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

/**
 * The words a voice can read aloud. The gate voice reads text literally: "3:15 PM" or "Jr KG" come out garbled, so
 * times, numbers and the school's abbreviations are written out. Only the voice gets this; the screen keeps "3:15 PM".
 */
export function sayable(text: string): string {
  return text
    .replace(/\b(\d{1,2}):(\d{2})(?:\s*([AP]M)\b)?/gi, (all, h: string, m: string, half?: string) =>
      +h > 23 || +m > 59 || (half && (+h < 1 || +h > 12)) ? all : timeWords(+h, +m, half))
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

/** The announcement's sentences as the voice is given them. */
export const voiceLines = (text: string, child?: VoiceChild | null) => sentences(tidy(text)).map((s) => voiceSentence(s, child)).filter(Boolean)

// The announcement's building blocks. gate.ts composes them; warmSentences() below makes the everyday ones ahead of time.
// Checked with the school voice (2026-09-27): it garbles one-word or plural sentences ("Reminder." → "Remindo",
// "Announcements are on." → "Unmentsments are on", "Time changed." rambles on), so these are short full sentences.
export const NEW_LEAD = 'New announcement. '
export const URGENT_LEAD = 'Urgent. '
export const REPEAT_LEAD = 'This is a reminder. '
export const TIME_CHANGED = 'The time has changed. '
export const ARRIVING_NOW = 'Arriving now.'
export const SOUND_CHECK = 'This is a sound check. Gate announcements are working.'
export type Kind = 'pickup' | 'dropoff'
const kindWord = (k: Kind) => (k === 'pickup' ? 'Pickup' : 'Drop-off')
export const firstWord = (name: string) => name.trim().split(/\s+/)[0] ?? name
export const kindFor = (k: Kind, fullName: string, className: string) => `${kindWord(k)} for ${fullName}, ${className}.`
/** "Aarav's mother, Sneha, is on the way." or "Sneha is on the way." */
export const onTheWay = (childName: string, relation: string | null, traveller: string) =>
  relation ? `${childName}'s ${relation.toLowerCase()}, ${firstWord(traveller)}, is on the way.` : `${firstWord(traveller)} is on the way.`
export const arrivingAbout = (clock: string) => `Arriving about ${clock}.`
export const getReady = (childName: string) => `Please get ${childName} ready.`
export const cancelled = (k: Kind, fullName: string) => `${kindWord(k)} for ${fullName} is cancelled.`

/** Minutes after midnight → "3:15 PM", exactly as the app shows times (src/domain/time.ts formatTime). */
export function clockText(min: number): string {
  const h = Math.floor(min / 60)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(min % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** The few sentences almost every announcement starts or ends with: made first. */
export const leadPhrases = () =>
  sentences(NEW_LEAD + URGENT_LEAD + REPEAT_LEAD + TIME_CHANGED + ARRIVING_NOW + ' ' + SOUND_CHECK).map((s) => voiceSentence(s))

/** "Arriving about …" for every 5-minute time from 7 AM to 8 PM (gate.ts rounds arrivals to 5 minutes). */
export function timePhrases(): string[] {
  const times: string[] = []
  for (let m = 7 * 60; m < 20 * 60; m += 5) times.push(voiceSentence(arrivingAbout(clockText(m))))
  return times
}

/** Sentences every announcement shares: the leads and the times. */
export const commonPhrases = () => [...leadPhrases(), ...timePhrases()]

/** A child's everyday sentences, as the voice is given them: made ahead so the gate never waits for them. */
export function warmSentences(child: VoiceChild, className: string, guardians: ReadonlyArray<{ name: string; relation: string | null }>): string[] {
  const out = [
    `${child.fullName}.`,
    kindFor('pickup', child.fullName, className),
    kindFor('dropoff', child.fullName, className),
    getReady(child.name),
    cancelled('pickup', child.fullName),
    cancelled('dropoff', child.fullName),
    ...guardians.map((g) => onTheWay(child.name, g.relation, g.name)),
  ]
  return [...new Set(out.map((s) => voiceSentence(s, child)).filter((s) => checkSpeech(s)))]
}
