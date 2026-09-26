import { describe, expect, it } from 'vitest'
import { cacheKey, checkSpeech, MAX_CHARS } from './voiceText'

describe('studio voice contract (D43)', () => {
  it('accepts announcements in words, Indian scripts included', () => {
    expect(checkSpeech('New announcement. Please get Aarav Sharma ready for pickup.')).toBe('New announcement. Please get Aarav Sharma ready for pickup.')
    expect(checkSpeech("  Aarav's   mother, Priya, arrives at about 12:40 PM. ")).toBe("Aarav's mother, Priya, arrives at about 12:40 PM.")
    expect(checkSpeech('आरव शर्मा')).toBe('आरव शर्मा')
  })

  it('refuses anything that is not a short spoken sentence', () => {
    expect(checkSpeech('')).toBeNull()
    expect(checkSpeech('   ')).toBeNull()
    expect(checkSpeech(null)).toBeNull()
    expect(checkSpeech(42)).toBeNull()
    expect(checkSpeech('a'.repeat(MAX_CHARS + 1))).toBeNull()
    expect(checkSpeech('<speak>hi</speak>')).toBeNull()
    expect(checkSpeech('https://example.com')).toBeNull()
  })

  it('gives the same announcement the same key, and anything different a different one', async () => {
    const a = await cacheKey('voice-1', 'Please get Aarav ready.')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await cacheKey('voice-1', 'Please get Aarav ready.')).toBe(a)
    expect(await cacheKey('voice-2', 'Please get Aarav ready.')).not.toBe(a)
    expect(await cacheKey('voice-1', 'Please get Aadhya ready.')).not.toBe(a)
  })
})
