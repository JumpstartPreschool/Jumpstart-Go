import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: {} }))
const { backgroundVoiceSays } = await import('./NativeHealth')

const base = { running: true, ignoringBatteryOptimizations: true, notificationsAllowed: true, alarmVolume: 7, alarmMax: 7, mediaVolume: 15, mediaMax: 15, manufacturer: 'Google', firebase: true }

describe('the background voice says only what the phone reported', () => {
  it('names the school voice or the phone voice from the last time it really spoke', () => {
    const at = Date.parse('2026-10-22T10:42:00+05:30')
    expect(backgroundVoiceSays({ ...base, speakAloud: true, lastSpokenAt: at, lastVoice: 'school' })).toMatch(/10:42.*school's voice/)
    expect(backgroundVoiceSays({ ...base, speakAloud: true, lastSpokenAt: at, lastVoice: 'device' })).toMatch(/phone's own voice/)
  })
  it('claims nothing before it has spoken, and says how to test it', () => {
    expect(backgroundVoiceSays({ ...base, speakAloud: true, lastSpokenAt: 0, lastVoice: '' })).toMatch(/Send a test alert/)
  })
  it('says when it is off, when push is missing, and when the app is too old', () => {
    expect(backgroundVoiceSays({ ...base, speakAloud: false })).toMatch(/^Off/)
    expect(backgroundVoiceSays({ ...base, speakAloud: true, firebase: false })).toMatch(/Push isn't set up/)
    expect(backgroundVoiceSays(base)).toMatch(/Install the latest/)
  })
})
