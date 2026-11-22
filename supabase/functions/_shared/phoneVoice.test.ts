import { describe, expect, it } from 'vitest'
import { clipKey, clipPath, voiceParts } from './announce'
import { childMessages, commonPhrases, DEFAULT_GATE, gateSettings } from './gateAnnounce'
import { REMINDER_PENALTY, spokenText } from './gateTrip'
import { phoneVoiceFor, type VoiceSources, type VoiceTrip } from './phoneVoice'

const NOW = Date.parse('2026-10-15T10:00:00Z')
const VERSION = 'azure|en-IN-NeerjaNeural|mp3-24k|templates-1'
const TRIP = '00000000-0000-0000-0000-000000000abc'
const child = { fullName: 'Aaradhya Sharma', name: 'Aaradhya', programmeName: 'Nursery Morning', spoken: 'Aa-raadh-ya Sharma' }
const trip = (t: Partial<VoiceTrip> = {}): VoiceTrip => ({
  direction: 'pickup', arrive_at: new Date(NOW + 10 * 60_000).toISOString(), off_schedule: false, traveller_relation: 'Father', child, ...t,
})
const signed: string[] = []
const sources = (t: VoiceTrip | null = trip(), over: Partial<VoiceSources> = {}): VoiceSources => ({
  version: VERSION,
  settings: DEFAULT_GATE,
  trip: async (id) => (id === TRIP ? t : null),
  sign: async (path, seconds) => { signed.push(`${path}@${seconds}`); return `https://x.supabase.co/sign/${path}?token=t` },
  ...over,
})
const alert = { platform: 'android' as const, tag: `trip-${TRIP}`, url: '/coordinator', title: 'Aaradhya, pickup at 3:40 PM', expires_at: new Date(NOW + 10 * 60_000).toISOString() }

describe('the phone plays the recording the school made ahead', () => {
  it('picks the very clip the pronounce job recorded for this child, with her pronunciation', async () => {
    const v = await phoneVoiceFor(alert, sources(), NOW)
    expect(v?.clips).toHaveLength(1)
    const madeAhead = await Promise.all(childMessages(DEFAULT_GATE, { ...child, programme: child.programmeName }, ['Father']).map((m) => clipKey(VERSION, m)))
    expect(madeAhead).toContain(v!.clips[0]!.key)
    expect(v!.clips[0]!.url).toBe(`https://x.supabase.co/sign/${clipPath(v!.clips[0]!.key)}?token=t`)
  })
  it('is what the duty screen would say at that moment', async () => {
    const v = await phoneVoiceFor(alert, sources(), NOW)
    const screen = voiceParts(spokenText(trip(), child, NOW, DEFAULT_GATE), child)
    expect(v!.clips.map((c) => c.key)).toEqual(await Promise.all(screen.map((p) => clipKey(VERSION, p))))
  })
  it('follows the admin\'s wording, as the gate does', async () => {
    const settings = gateSettings({ pickup_eta: '{{preferred_name}} is being collected by {{relation}} {{eta}}. Pickup.' })
    const v = await phoneVoiceFor(alert, sources(trip(), { settings }), NOW)
    expect(v!.clips[0]!.key).toBe(await clipKey(VERSION, voiceParts(spokenText(trip(), child, NOW, settings), child)[0]!))
  })
  it('plays the sound check for a test alert, a clip kept for every voice version', async () => {
    const v = await phoneVoiceFor({ ...alert, tag: 'test-1', url: '/' }, sources(null), NOW)
    expect(v!.clips[0]!.key).toBe(await clipKey(VERSION, commonPhrases(DEFAULT_GATE)[3]!))
  })
})

describe('chime and queue place match the duty screen', () => {
  it('a reminder queues after every new announcement', async () => {
    const first = await phoneVoiceFor(alert, sources(), NOW)
    const reminder = await phoneVoiceFor({ ...alert, title: 'Reminder: Aaradhya, pickup at 3:40 PM' }, sources(), NOW)
    expect(first).toMatchObject({ chime: 'normal', priority: 20, order: Date.parse(trip().arrive_at) })
    expect(reminder!.priority).toBe(20 - REMINDER_PENALTY)
  })
  it('an arrival is urgent and first', async () => {
    const v = await phoneVoiceFor(alert, sources(trip({ arrived_at: new Date(NOW).toISOString() })), NOW)
    expect(v).toMatchObject({ chime: 'flagged', priority: 50 })
  })
  it('a fresh running-late update says its own words, once; its reminders don\'t', async () => {
    const late = trip({ late_at: new Date(NOW - 60_000).toISOString() })
    const first = await phoneVoiceFor({ ...alert, title: 'Aaradhya pickup delayed' }, sources(late), NOW)
    const reminder = await phoneVoiceFor({ ...alert, title: 'Reminder: Aaradhya, pickup at 3:40 PM' }, sources(late), NOW)
    expect(first!.chime).toBe('flagged')
    expect(first!.clips[0]!.key).not.toBe(reminder!.clips[0]!.key)
  })
})

describe('nothing in the school\'s voice when it would be wrong', () => {
  it('not for the web, a parent, a silent-device warning, or a trip that has gone', async () => {
    expect(await phoneVoiceFor({ ...alert, platform: 'web' }, sources(), NOW)).toBeNull()
    expect(await phoneVoiceFor({ ...alert, url: '/parent', title: 'Aaradhya has been collected' }, sources(), NOW)).toBeNull()
    expect(await phoneVoiceFor({ ...alert, tag: 'duty-1' }, sources(), NOW)).toBeNull()
    expect(await phoneVoiceFor({ ...alert, tag: 'trip-not-a-uuid' }, sources(), NOW)).toBeNull()
    expect(await phoneVoiceFor(alert, sources(null), NOW)).toBeNull()
  })
  it('no recordings before the first voice version, or if any link fails: the phone\'s voice reads the title instead', async () => {
    expect((await phoneVoiceFor(alert, sources(trip(), { version: null }), NOW))!.clips).toEqual([])
    expect((await phoneVoiceFor(alert, sources(trip(), { sign: async () => null }), NOW))!.clips).toEqual([])
  })
  it('links last only as long as the alert, between one and ten minutes', async () => {
    signed.length = 0
    await phoneVoiceFor({ ...alert, expires_at: new Date(NOW + 4 * 60_000).toISOString() }, sources(), NOW)
    await phoneVoiceFor({ ...alert, expires_at: new Date(NOW + 5_000).toISOString() }, sources(), NOW)
    await phoneVoiceFor({ ...alert, expires_at: new Date(NOW + 60 * 60_000).toISOString() }, sources(), NOW)
    expect(signed.map((s) => Number(s.split('@')[1]))).toEqual([240, 60, 600])
  })
})
