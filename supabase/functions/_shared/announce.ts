/**
 * The gate voice's words, in one place (D50), shared by the coordinator's iPad (src/features/duty) and the pronounce
 * function. The pronounce function makes every child's announcements ahead of time from these templates and keeps them;
 * the iPad builds the same words when a parent taps, so it finds the clip already made and plays it at once.
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
export const voiceVersion = (voice: string) => `azure|${voice}|mp3-24k|${WORDING_VERSION}`
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

/**
 * An announcement as the voice is given it, in at most two recordings: the opening ("New announcement."), which is
 * always the same words and so kept on each iPad, then everything else as one recording, so it flows like one person
 * speaking instead of sentences stitched together.
 */
export function voiceParts(text: string, child?: VoiceChild | null): string[] {
  const all = sentences(tidy(text))
  const opening = all[0] && LEADS.includes(all[0]) ? voiceSentence(all.shift()!) : ''
  return [opening, voiceSentence(all.join(' '), child)].filter(Boolean)
}

// The announcement's words. Every announcement starts with one of the leads (kept on each iPad), then one message.
export const NEW_LEAD = 'New announcement. '
export const URGENT_LEAD = 'Urgent new announcement. '
export const REPEAT_LEAD = 'This is a reminder. '
const LEADS = [NEW_LEAD, URGENT_LEAD, REPEAT_LEAD].map((l) => l.trim())
export const SOUND_CHECK = 'This is a sound check. Gate announcements are working.'

export type Kind = 'pickup' | 'dropoff'
/** How far the trip has got: set off, about ten minutes away, about five minutes away, or at the gate. */
export type Phase = 'onway' | 'ten' | 'five' | 'arrived'
export const PHASES: readonly Phase[] = ['onway', 'ten', 'five', 'arrived']
/** Anyone who isn't on the child's record, such as a driver with a one-time link. */
export const PICKUP_PERSON = 'pickup person'

/**
 * The templates (owner's wording, 2026-09-29). {child} is the child's full name, {who} the relation of the person
 * coming ("father", "grandmother", or "pickup person"). Short, calm, and said the same way every time.
 */
const TEMPLATES: Record<Kind, Record<Phase, (child: string, who: string) => string>> = {
  pickup: {
    onway: (c, who) => `${c}'s ${who} is on the way for pickup.`,
    ten: (c, who) => `${c}'s ${who} will arrive for pickup in about ten minutes.`,
    five: (c, who) => `${c}'s ${who} will arrive for pickup in about five minutes.`,
    arrived: (c, who) => `${c}'s ${who} has arrived for pickup.`,
  },
  dropoff: {
    onway: (c) => `${c} is on the way for drop-off.`,
    ten: (c) => `${c} will arrive for drop-off in about ten minutes.`,
    five: (c) => `${c} will arrive for drop-off in about five minutes.`,
    arrived: (c) => `${c} has arrived for drop-off.`,
  },
}

/** "father" from "Father"; anyone without a relation on record is the pickup person. */
export const whoFor = (relation: string | null | undefined) => tidy(relation, 30).toLowerCase() || PICKUP_PERSON

export const getReady = (childName: string) => `Please get ${childName} ready.`

/**
 * One announcement's message: the template, and for a pickup "Please get … ready." so the gate knows what to do.
 * "Vihaan Kulkarni's father will arrive for pickup in about ten minutes. Please get Vihaan ready."
 */
export function message(kind: Kind, phase: Phase, child: { fullName: string; name: string }, relation: string | null | undefined): string {
  const said = TEMPLATES[kind][phase](child.fullName, whoFor(relation))
  return kind === 'pickup' ? `${said} ${getReady(child.name)}` : said
}

export const cancelled = (k: Kind, fullName: string) => `${k === 'pickup' ? 'Pickup' : 'Drop-off'} for ${fullName} is cancelled.`

/** The shared openings and the sound check: kept on every iPad. */
export const commonPhrases = () => [NEW_LEAD, URGENT_LEAD, REPEAT_LEAD, SOUND_CHECK].map((s) => voiceSentence(s.trim()))

/**
 * Every recording one child's announcements can need, as the voice is given them: each phase of pickup for each
 * relation on their record and for a pickup person, each phase of drop-off, and both cancellations. Made ahead.
 */
export function childMessages(child: VoiceChild, relations: ReadonlyArray<string | null>): string[] {
  const out: string[] = []
  for (const who of new Set([...relations.map(whoFor), PICKUP_PERSON])) {
    for (const phase of PHASES) out.push(message('pickup', phase, child, who))
  }
  for (const phase of PHASES) out.push(message('dropoff', phase, child, null))
  out.push(cancelled('pickup', child.fullName), cancelled('dropoff', child.fullName))
  return [...new Set(out.map((m) => voiceSentence(m, child)).filter((m) => checkSpeech(m)))]
}
