/**
 * How announcements are said, never how names are shown (D43). The gate screen keeps every name exactly as the school
 * typed it; only the words sent to a voice go through here:
 *   - tidied for speech: Unicode normalised (NFC, so "é" typed two ways is one letter), invisible and control
 *     characters dropped, "(Test)"-style notes removed, stray symbols turned into pauses, spaces collapsed;
 *   - then the school's pronunciation list applied word by word ("Shreyas" → "Shrey-us"), whole words only,
 *     matching any capitalisation, in any script (Devanagari names too).
 * Indian names are left as they are otherwise: no transliteration, no Western approximations.
 */

/** A pronunciation list: a lower-case written word → how to say it. */
export type Lexicon = ReadonlyMap<string, string>

const MAX_SENTENCE = 400
const MAX_NAME = 80

// Letters and marks in any script, digits, and the punctuation a voice uses for pauses and initials.
const UNSAYABLE = /[^\p{L}\p{M}\p{N}\s.,'’?!:;-]/gu
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu
const NOTES = /\s*\([^)]*\)/g

function tidy(text: string, max: number): string {
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

/**
 * A name as a voice should read it: "  Aarav   Sharma " → "Aarav Sharma", "A.K. Sharma" → "A. K. Sharma" (initials read
 * as letters), "Diya Kulkarni (Test)" → "Diya Kulkarni". Null, empty or unsayable input gives "".
 */
export function normalizeIndianNameForSpeech(name: string | null | undefined): string {
  if (!name) return ''
  return tidy(name, MAX_NAME).replace(/\b(\p{L})\.(?=\p{L})/gu, '$1. ').replace(/\s+/g, ' ')
}

/** A whole sentence tidied for speech (the announcement text, which already contains the names). */
export function normalizeForSpeech(text: string | null | undefined): string {
  if (!text) return ''
  return tidy(text, MAX_SENTENCE)
}

// A word: letters and combining marks (Devanagari vowel signs are marks), with inner apostrophes or hyphens.
const WORD = /[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*/gu

/** Replaces each listed word with how it's said. Words not on the list, and all punctuation, are untouched. */
export function applyPronunciations(text: string, lexicon: Lexicon): string {
  if (!lexicon.size) return text
  return text.replace(WORD, (word) => lexicon.get(word.toLocaleLowerCase('en-IN')) ?? word)
}

/** The words a voice is given for an announcement. */
export function speechText(text: string, lexicon: Lexicon): string {
  return applyPronunciations(normalizeForSpeech(text), lexicon)
}

// The school's list, loaded when a coordinator starts duty (useDuty) and shared by every voice on this device.
let current: Lexicon = new Map()
export function setPronunciations(rows: ReadonlyArray<{ written: string; spoken: string }>): void {
  current = new Map(rows.map((r) => [r.written.toLocaleLowerCase('en-IN'), r.spoken]))
}
export const currentPronunciations = (): Lexicon => current
