import { describe, expect, it } from 'vitest'
import { applyPronunciations, normalizeForSpeech, normalizeIndianNameForSpeech, speechText } from './pronunciation'

const NAMES = ['Aarav', 'Aadhya', 'Ananya', 'Anirudh', 'Aaradhya', 'Shreyas', 'Ishaan', 'Vihaan', 'Dhruv', 'Krish', 'Lakshya',
  'Vedant', 'Pranav', 'Atharv', 'Shivansh', 'Saanvi', 'Myra']

describe('names for speech (D43)', () => {
  it('leaves Indian names exactly as written: no transliteration, no Western approximation', () => {
    for (const n of NAMES) expect(normalizeIndianNameForSpeech(n)).toBe(n)
    for (const n of ['Anirudh Sharma', 'Saanvi Kulkarni', 'Vedant Deshmukh', 'Aaradhya Patil', 'Shreyas Joshi', 'Avni Shah', 'Rudransh Chavan']) {
      expect(normalizeIndianNameForSpeech(n)).toBe(n)
    }
  })

  it('tidies spacing, initials, hyphens and apostrophes', () => {
    expect(normalizeIndianNameForSpeech('First Last')).toBe('First Last')
    expect(normalizeIndianNameForSpeech('  First   Last  ')).toBe('First Last')
    expect(normalizeIndianNameForSpeech('First-Middle Last')).toBe('First-Middle Last')
    expect(normalizeIndianNameForSpeech("D'Souza")).toBe("D'Souza")
    expect(normalizeIndianNameForSpeech('D’Souza')).toBe("D'Souza")
    expect(normalizeIndianNameForSpeech('A.K. Sharma')).toBe('A. K. Sharma')
    expect(normalizeIndianNameForSpeech('Diya Kulkarni (Test)')).toBe('Diya Kulkarni')
  })

  it('keeps accented and Indian-script letters, and normalises how they were typed', () => {
    expect(normalizeIndianNameForSpeech('Zoé')).toBe('Zoé')
    expect(normalizeIndianNameForSpeech('Zoé')).toBe('Zoé') // e + combining accent → one letter
    expect(normalizeIndianNameForSpeech('आरव शर्मा')).toBe('आरव शर्मा')
  })

  it('handles empty, missing, odd and very long input safely', () => {
    expect(normalizeIndianNameForSpeech('')).toBe('')
    expect(normalizeIndianNameForSpeech(null)).toBe('')
    expect(normalizeIndianNameForSpeech(undefined)).toBe('')
    expect(normalizeIndianNameForSpeech('<script>Aarav</script> 😀 #1')).toBe('script Aarav script 1')
    expect(normalizeIndianNameForSpeech('Aa​rav')).toBe('Aarav') // zero-width space from a copy-paste
    expect(normalizeIndianNameForSpeech('A'.repeat(500)).length).toBe(80)
  })
})

describe('pronunciation list', () => {
  const lexicon = new Map([['shreyas', 'Shrey-us'], ['aarav', 'Aa-rav']])

  it('replaces whole words, any capitalisation, and nothing else', () => {
    expect(applyPronunciations('Please get Shreyas Joshi ready. SHREYAS, Shreyasi.', lexicon)).toBe('Please get Shrey-us Joshi ready. Shrey-us, Shreyasi.')
    expect(applyPronunciations("Aarav's mother, Priya,", lexicon)).toBe("Aarav's mother, Priya,")
    expect(applyPronunciations('Aarav is here', lexicon)).toBe('Aa-rav is here')
  })

  it('makes the words a voice is given, without touching what the screen shows', () => {
    const shown = 'New announcement. Please get Shreyas  Joshi (Test) ready for pickup.'
    expect(speechText(shown, lexicon)).toBe('New announcement. Please get Shrey-us Joshi ready for pickup.')
    expect(shown).toContain('(Test)')
    expect(normalizeForSpeech('  Ready at 12:40 PM  ')).toBe('Ready at 12:40 PM')
  })
})
