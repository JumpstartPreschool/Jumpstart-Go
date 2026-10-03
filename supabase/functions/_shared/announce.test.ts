import { describe, expect, it } from 'vitest'
import { cancelledText, lateText, spokenText } from '../../../src/features/duty/gate'
import type { Trip } from '../../../src/features/trips/api'
import { checkSpeech, clipKey, sayable, sentences, tidy, voiceParts, voiceSentence, voiceVersion, type VoiceChild } from './announce'
import { childMessages, commonPhrases, DEFAULT_GATE, gateSettings, SOUND_CHECK } from './gateAnnounce'

const aaradhya: VoiceChild = { fullName: 'Aaradhya Sharma', name: 'Aaradhya', spoken: null }
const T0 = Date.parse('2026-09-28T09:00:00Z')
const trip = (arriveInMin: number, over: Partial<Trip> = {}) => ({
  id: 't', child_id: 'c', direction: 'pickup', day: '2026-09-28', status: 'en_route', arrive_at: new Date(T0 + arriveInMin * 60_000).toISOString(),
  off_schedule: false, reason: null, created_by: 'p', traveller_name: 'Priya Sharma', traveller_relation: 'Mother',
  created_at: '2026-09-28T09:00:00Z', updated_at: '2026-09-28T09:00:00Z', ...over,
}) as Trip
const gateChild = { id: 'c', name: 'Aaradhya', fullName: 'Aaradhya Sharma', classId: 'k', className: 'Nursery A', programmeName: 'Nursery' }
const OPENINGS = [DEFAULT_GATE.opening_new, DEFAULT_GATE.opening_urgent, DEFAULT_GATE.opening_reminder]

describe('the gate voice words', () => {
  it("records ahead every sentence the 5, 10 and 15 minute buttons can need, at any moment of the trip, so the gate never waits", () => {
    for (const settings of [DEFAULT_GATE, gateSettings({ pickup_eta: '{{preferred_name}} pickup by {{relation}}, about {{minutes}} minutes.' })]) {
      const child = { ...aaradhya, programme: 'Nursery', spoken: 'Aa-raadh-ya Sharma' }
      const made = new Set([...commonPhrases(settings), ...childMessages(settings, child, ['Mother', 'Father'])])
      const trips = (n: number) => [
        trip(n), trip(n, { traveller_relation: 'Father' }), trip(n, { traveller_kind: 'third_person', traveller_relation: 'Driver' }),
        trip(n, { arrived_at: '2026-09-28T09:01:00Z' }), trip(n, { direction: 'dropoff' }), trip(n, { direction: 'dropoff', arrived_at: '2026-09-28T09:01:00Z' }),
      ]
      for (const n of [5, 10, 15]) {
        for (const t of trips(n)) {
          // Every half minute from setting off to well past the chosen time: the first announcement and every reminder.
          for (let m = 0; m <= n + 5; m += 0.5) {
            for (const lead of OPENINGS) {
              for (const part of voiceParts(`${lead} ${spokenText(t, gateChild, T0 + m * 60_000, settings)}`, child)) expect(made, part).toContain(part)
            }
          }
          for (const part of voiceParts(`${DEFAULT_GATE.opening_new} ${cancelledText(t, gateChild, settings)}`, child)) expect(made, part).toContain(part)
          // Running late by 5, 10 or 15 minutes, said the moment it's sent: recorded ahead too.
          if (!t.arrived_at) for (const n of [5, 10, 15]) {
            const late = { ...t, arrive_at: new Date(T0 + n * 60_000).toISOString(), late_at: '2026-09-28T09:00:00Z', late_from: t.arrive_at }
            for (const part of voiceParts(lateText(late, gateChild, T0, settings), child)) expect(made, part).toContain(part)
          }
        }
      }
      for (const part of voiceParts(SOUND_CHECK)) expect(made).toContain(part)
    }
  })

  it('speaks an opening, kept on the iPad, then the message as one recording', () => {
    const first = voiceParts(`New announcement. ${spokenText(trip(10), gateChild, T0, DEFAULT_GATE)}`, aaradhya)
    expect(first).toEqual(['New announcement.', "Aaradhya Sharma's mother will arrive for pickup in about ten minutes. Please get Aaradhya ready."])
    expect(voiceParts('Urgent new announcement. x.')[0]).toBe('Urgent new announcement.')
    // The admin's own opening is split off the same way, once the voice knows it.
    expect(voiceParts('Attention please. Kabir pickup.', null, ['Attention please.'])).toEqual(['Attention please.', 'Kabir pickup.'])
  })

  it('applies the approved pronunciation within that child only, and never to other words', () => {
    const child = { ...aaradhya, spoken: 'Aa-raadh-ya Sharma' }
    expect(voiceSentence('Pickup for Aaradhya Sharma, Nursery A.', child)).toBe('Pickup for Aa-raadh-ya Sharma, Nursery A.')
    expect(voiceSentence('Please get Aaradhya ready.', child)).toBe('Please get Aa-raadh-ya ready.')
    expect(voiceSentence("Aaradhya Sharma's mother has arrived for pickup.", child)).toBe("Aa-raadh-ya Sharma's mother has arrived for pickup.")
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
    const v = voiceVersion('en-IN-NeerjaNeural')
    const one = await clipKey(v, 'Aaradhya Sharma.')
    expect(one).toMatch(/^[0-9a-f]{64}$/)
    expect(await clipKey(v, 'Aaradhya Sharma.')).toBe(one)
    expect(await clipKey(v, 'Aaradhya Sharma')).not.toBe(one)
    expect(await clipKey(voiceVersion('en-IN-AartiNeural'), 'Aaradhya Sharma.')).not.toBe(one)
    expect(v).toContain('en-IN-NeerjaNeural')
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
  })

  it('splits announcements into one clip per sentence', () => {
    expect(sentences('New announcement. Pickup for Aarav, Nursery. Arriving now.')).toEqual(['New announcement.', 'Pickup for Aarav, Nursery.', 'Arriving now.'])
  })
})
