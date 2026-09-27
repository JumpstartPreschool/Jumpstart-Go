import { describe, expect, it } from 'vitest'
import { formatTime } from '../../../src/domain/time'
import { cancelledText, spokenText } from '../../../src/features/duty/gate'
import type { Trip } from '../../../src/features/trips/api'
import { checkSpeech, clipKey, clockText, commonPhrases, NEW_LEAD, REPEAT_LEAD, sayable, sentences, tidy, VOICE_VERSION, voiceLines, voiceSentence, warmSentences, type VoiceChild } from './announce'

const aaradhya: VoiceChild = { fullName: 'Aaradhya Sharma', name: 'Aaradhya', spoken: null }
const trip = (over: Partial<Trip> = {}) => ({
  id: 't', child_id: 'c', direction: 'pickup', day: '2026-09-28', status: 'en_route', arrive_at: '2026-09-28T09:45:00Z',
  off_schedule: false, reason: null, created_by: 'p', traveller_name: 'Priya Sharma', traveller_relation: 'Mother',
  created_at: '2026-09-28T09:00:00Z', updated_at: '2026-09-28T09:00:00Z', ...over,
}) as Trip
const gateChild = { id: 'c', name: 'Aaradhya', fullName: 'Aaradhya Sharma', classId: 'k', className: 'Nursery A', programmeName: 'Nursery' }

describe('the gate voice words', () => {
  it('makes every sentence of an everyday announcement ahead of time, so it plays at once', () => {
    const made = new Set([...commonPhrases(), ...warmSentences(aaradhya, 'Nursery A', [{ name: 'Priya Sharma', relation: 'Mother' }])])
    for (const text of [
      NEW_LEAD + spokenText(trip(), gateChild, Date.parse('2026-09-28T09:00:00Z')),
      NEW_LEAD + spokenText(trip({ direction: 'dropoff' }), gateChild, Date.parse('2026-09-28T09:43:00Z')),
      REPEAT_LEAD + spokenText(trip({ updated_at: '2026-09-28T09:10:00Z' }), gateChild, Date.parse('2026-09-28T09:15:00Z')),
      cancelledText(trip(), gateChild),
    ]) {
      for (const line of voiceLines(text, aaradhya)) expect(made, line).toContain(line)
    }
  })

  it('applies the approved pronunciation within that child only, and never to other words', () => {
    const child = { ...aaradhya, spoken: 'Aa-raadh-ya Sharma' }
    expect(voiceSentence('Pickup for Aaradhya Sharma, Nursery A.', child)).toBe('Pickup for Aa-raadh-ya Sharma, Nursery A.')
    expect(voiceSentence('Please get Aaradhya ready.', child)).toBe('Please get Aa-raadh-ya ready.')
    expect(voiceSentence("Aaradhya's mother, Priya, is on the way.", child)).toBe("Aa-raadh-ya's mother, Priya, is on the way.")
    expect(voiceSentence('Please get Aaradhya ready.', null)).toBe('Please get Aaradhya ready.')
  })

  it('handles a pronunciation with a different number of words', () => {
    const child = { fullName: 'Sai Charan Reddy', name: 'Sai', spoken: 'Saicharan Reddy' }
    expect(voiceSentence('Pickup for Sai Charan Reddy, Nursery.', child)).toBe('Pickup for Saicharan Reddy, Nursery.')
    expect(voiceSentence('Please get Sai ready.', child)).toBe('Please get Saicharan ready.')
  })

  it('uses a preferred name that is not part of the full name as written', () => {
    const child = { fullName: 'Aaradhya Sharma', name: 'Aadu', spoken: 'Aa-raadh-ya Sharma' }
    expect(voiceSentence('Please get Aadu ready.', child)).toBe('Please get Aadu ready.')
  })

  it('tidies text for a voice without changing Indian names', () => {
    for (const n of ['Aaradhya', 'Ishaan', 'Shaurya', 'Vihaan', 'Saanvi', 'Atharv', 'Yuvraj', 'आराध्या शर्मा', "D'Souza"]) expect(tidy(n)).toBe(n)
    expect(tidy('  Diya   Kulkarni (Test) ')).toBe('Diya Kulkarni')
    expect(tidy('<script>Aarav</script> 😀')).toBe('script Aarav script')
    expect(tidy('Aa​rav')).toBe('Aarav')
    expect(tidy(null)).toBe('')
  })

  it('accepts only speakable text, 1 to 400 characters', () => {
    expect(checkSpeech('Pickup for Aaradhya Sharma, Nursery A.')).toBe('Pickup for Aaradhya Sharma, Nursery A.')
    expect(checkSpeech('आराध्या शर्मा')).toBe('आराध्या शर्मा')
    for (const bad of ['', ' ', 'a'.repeat(401), '<b>', 'Aarav_1', 42, null]) expect(checkSpeech(bad)).toBeNull()
  })

  it('keys a clip by the voice version and the exact words, as a hash (no name in the path)', async () => {
    const one = await clipKey('Aaradhya Sharma.')
    expect(one).toMatch(/^[0-9a-f]{64}$/)
    expect(await clipKey('Aaradhya Sharma.')).toBe(one)
    expect(await clipKey('Aaradhya Sharma')).not.toBe(one)
    expect(VOICE_VERSION).toContain('7b527af5')
  })

  it('says times exactly as the app shows them, every 5 minutes of the school day', () => {
    for (const m of [0, 7 * 60, 12 * 60 + 45, 15 * 60 + 5, 19 * 60 + 55]) expect(clockText(m)).toBe(formatTime(m))
    const phrases = commonPhrases()
    expect(phrases).toContain("Arriving about seven o'clock in the morning.")
    expect(phrases).toContain('Arriving about seven fifty five in the evening.')
    expect(phrases).toContain('New announcement.')
    expect(new Set(phrases).size).toBe(phrases.length)
  })

  it('writes out times, numbers and class abbreviations for the voice, which reads text literally', () => {
    expect(sayable('Arriving about 3:15 PM.')).toBe('Arriving about three fifteen in the afternoon.')
    expect(sayable('Arriving about 12:00 PM.')).toBe('Arriving about twelve noon.')
    expect(sayable('Arriving about 12:45 PM.')).toBe('Arriving about twelve forty five in the afternoon.')
    expect(sayable('Arriving about 9:05 AM.')).toBe('Arriving about nine oh five in the morning.')
    expect(sayable('Arriving about 12:30 AM.')).toBe('Arriving about twelve thirty in the morning.')
    expect(sayable('Reason: doctor at 16:30.')).toBe('Reason: doctor at four thirty.')
    expect(sayable('Pickup for Aarav Kulkarni, Jr KG.')).toBe('Pickup for Aarav Kulkarni, Junior K G.')
    expect(sayable('Sr KG, room 360, 2 bags, 1015.')).toBe('Senior K G, room three hundred and sixty, two bags, one thousand and fifteen.')
    expect(sayable('Call 9876543210.')).toBe('Call nine eight seven six five four three two one zero.')
    expect(sayable('Aarav Kulkarni.')).toBe('Aarav Kulkarni.')
    for (const s of commonPhrases()) expect(s).not.toMatch(/\d/)
  })

  it('splits announcements into one clip per sentence', () => {
    expect(sentences('New announcement. Pickup for Aarav, Nursery. Arriving now.')).toEqual(['New announcement.', 'Pickup for Aarav, Nursery.', 'Arriving now.'])
  })
})
