import { describe, expect, it } from 'vitest'
import { voiceGender, voiceScore } from './sound'
import { voiceLabel } from './VoicePicker'

const v = (name: string, lang: string) => ({ name, lang })

describe('announcement voice', () => {
  it('puts neural and downloaded voices above basic ones, Indian English first', () => {
    const ranked = [
      v('Rishi', 'en-IN'), v('Samantha', 'en-US'), v('Google UK English Female', 'en-GB'), v('Isha (Enhanced)', 'en-IN'),
      v('Microsoft Neerja Online (Natural) - English (India)', 'en-IN'), v('Ava (Premium)', 'en-US'),
    ].sort((a, b) => voiceScore(b) - voiceScore(a)).map((x) => x.name)
    expect(ranked).toEqual([
      'Microsoft Neerja Online (Natural) - English (India)', 'Isha (Enhanced)', 'Ava (Premium)', 'Google UK English Female', 'Samantha', 'Rishi',
    ])
  })
  it("on a device with only built-in voices, picks a smooth woman's voice", () => {
    const builtIn = [v('Rishi', 'en-IN'), v('Daniel', 'en-GB'), v('Samantha', 'en-US'), v('Fred', 'en-US')]
    expect(builtIn.sort((a, b) => voiceScore(b) - voiceScore(a))[0]!.name).toBe('Samantha')
  })
  it("prefers a woman's voice even over a man's neural voice", () => {
    const best = [v('Microsoft Prabhat Online (Natural) - English (India)', 'en-IN'), v('Google UK English Female', 'en-GB'), v('Google UK English Male', 'en-GB')]
      .sort((a, b) => voiceScore(b) - voiceScore(a))[0]!.name
    expect(best).toBe('Google UK English Female')
  })
  it("an Indian English woman's voice outranks a more polished American one, so names sound right", () => {
    const best = [v('Ava (Premium)', 'en-US'), v('Tara', 'en-IN'), v('Aman', 'en-IN'), v('Samantha', 'en-US')].sort((a, b) => voiceScore(b) - voiceScore(a))[0]!.name
    expect(best).toBe('Tara')
  })
  it('tells women and men apart by name', () => {
    expect(voiceGender('Isha (Enhanced)')).toBe('female')
    expect(voiceGender('Microsoft Neerja Online (Natural) - English (India)')).toBe('female')
    expect(voiceGender('Google UK English Male')).toBe('male')
    expect(voiceGender('Daniel')).toBe('male')
    expect(voiceGender('Zelda')).toBe(null)
  })
  it('never offers robotic novelty voices or other languages', () => {
    for (const name of ['Zarvox', 'Bubbles', 'Bad News', 'Eddy (English (US))', 'Grandpa']) expect(voiceScore(v(name, 'en-US'))).toBe(-1)
    expect(voiceScore(v('Lekha', 'hi-IN'))).toBe(-1)
  })
  it('shows a short friendly name', () => {
    expect(voiceLabel(v('Microsoft Neerja Online (Natural) - English (India)', 'en-IN'))).toBe('Neerja')
    expect(voiceLabel(v('Isha (Enhanced)', 'en-IN'))).toBe('Isha')
    expect(voiceLabel(v('Google UK English Female', 'en-GB'))).toBe('UK English Female')
  })
})

describe('voice quality label', () => {
  it('depends only on the voice, not on who is preferred', async () => {
    const { voiceQuality } = await import('./sound')
    expect(voiceQuality('Samantha')).toBe('standard')
    expect(voiceQuality('Isha (Enhanced)')).toBe('enhanced')
    expect(voiceQuality('Ava (Premium)')).toBe('premium')
    expect(voiceQuality('Microsoft Neerja Online (Natural) - English (India)')).toBe('natural')
    expect(voiceQuality('Google UK English Female')).toBe('online')
  })
})
