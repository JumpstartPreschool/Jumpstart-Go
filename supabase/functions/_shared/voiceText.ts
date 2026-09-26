/**
 * The studio voice's contract (D43), shared by the voice-say function and its tests: what text it accepts, how it's
 * spoken, and the cache key that makes the same announcement free the second time.
 */

/** ElevenLabs model and settings for a calm, clear school announcement. Changing any of these makes new cache keys. */
export const VOICE_MODEL = 'eleven_multilingual_v2' // reads Indian names and English with the same voice; Hindi and Marathi later
// stability 0.55: steady, like a person reading a notice, but not flat. similarity 0.8: stays true to the chosen voice.
// style 0.1: a little warmth, no performance. speed 0.95: a touch slower, for a noisy gate. seed: the same words sound
// the same every time they're made.
export const VOICE_SETTINGS = { stability: 0.55, similarity_boost: 0.8, style: 0.1, use_speaker_boost: true, speed: 0.95 } as const
export const VOICE_SEED = 20260926
export const MAX_CHARS = 400

/** The text if it's a speakable announcement, else null: 1–400 characters of letters, digits, spaces and pauses. */
export function checkSpeech(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const text = input.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!text || text.length > MAX_CHARS) return null
  return /^[\p{L}\p{M}\p{N} .,'?!:;-]+$/u.test(text) ? text : null
}

/** A stable file name for this voice saying these exact words with these settings. */
export async function cacheKey(voiceId: string, text: string): Promise<string> {
  const input = JSON.stringify([voiceId, VOICE_MODEL, VOICE_SETTINGS, VOICE_SEED, text])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Microsoft Azure's Indian English voices (free up to 500,000 characters a month): the announcement as SSML, a little
 * slower than normal for a noisy gate. Names are read the Indian way because the voice itself is Indian English.
 */
export const AZURE_DEFAULT_VOICE = 'en-IN-NeerjaNeural'
export const AZURE_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
export function azureSsml(voice: string, text: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-IN"><voice name="${xml(voice)}"><prosody rate="-6%">${xml(text)}</prosody></voice></speak>`
}
