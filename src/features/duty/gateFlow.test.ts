// The gate from trip to spoken words: the real announcer and syncGate, a fake speaker, and a clock that moves. Each test
// is a trip's life as the gate iPad sees it, checked by what it says.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Trip } from '../trips/api'
import { DEFAULT_GATE, gateSettings, type GateSettings } from '../../../supabase/functions/_shared/gateAnnounce'
import { createAnnouncer } from './announcer'
import { syncGate, type GateChild, type GateMemory } from './gate'

const T0 = Date.parse('2026-09-28T07:30:00Z') // 1:00 PM in India
const iso = (ms: number) => new Date(ms).toISOString()
const child: GateChild = { id: 'c', name: 'Aarav', fullName: 'Aarav Sharma', classId: 'k', className: 'Nursery', programmeName: 'Nursery' }
const gate = { children: new Map([['c', child]]), myClasses: new Set(['k']), covered: new Set(['k']) }
const trip = (over: Partial<Trip>): Trip => ({
  id: 't1', child_id: 'c', direction: 'pickup', day: '2026-09-28', status: 'en_route', arrive_at: iso(T0 + 15 * 60_000),
  off_schedule: false, reason: null, created_by: 'p', traveller_name: 'Priya Sharma', traveller_relation: 'Mother',
  created_at: iso(T0), updated_at: iso(T0), acknowledged_by: null, acknowledged_at: null, ready_at: null, closed_at: null, handed_to: null, ...over,
}) as Trip

function gateDevice(settings: GateSettings = DEFAULT_GATE, since?: number) {
  const said: Array<{ at: number; text: string }> = []
  const announcer = createAnnouncer({
    chime: async () => {},
    // Speech takes 3 s, like a real sentence.
    speak: (text: string) => new Promise<void>((r) => setTimeout(() => { said.push({ at: (Date.now() - T0) / 60_000, text }); r() }, 3_000)),
  }, settings.reminder_min * 60_000)
  announcer.configure({ openings: { new: settings.opening_new, urgent: settings.opening_urgent, reminder: settings.opening_reminder }, repeatMs: settings.reminder_min * 60_000 })
  const memory: GateMemory = { announced: new Map(), cancelHeard: new Set(), lateHeard: new Map(), since }
  let trips: Trip[] = []
  /** Runs the gate for some minutes, a pass every 5 seconds as the iPad does. */
  async function run(minutes: number) {
    for (let i = 0; i < minutes * 12; i++) {
      syncGate(trips, gate, Date.now(), settings, () => settings, memory, announcer)
      await vi.advanceTimersByTimeAsync(5_000)
    }
  }
  return { said, run, setTrips: (t: Trip[]) => { trips = t; syncGate(trips, gate, Date.now(), settings, () => settings, memory, announcer) } }
}

describe('a trip, as the gate hears it', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0) })
  afterEach(() => vi.useRealTimers())

  it('15 minutes: new, reminders with the time left, urgent at five, then arrived at once', async () => {
    const g = gateDevice()
    g.setTrips([trip({})])
    await g.run(11)
    g.setTrips([trip({ arrived_at: iso(Date.now()), updated_at: iso(Date.now()) })])
    await g.run(0.5)
    const texts = g.said.map((s) => s.text)
    expect(texts[0]).toBe("Aarav Sharma's mother will arrive for pickup in about fifteen minutes. Please get Aarav ready.")
    expect(texts).toContain("Aarav Sharma's mother will arrive for pickup in about fifteen minutes. Please get Aarav ready.")
    expect(texts).toContain("Aarav Sharma's mother will arrive for pickup in about ten minutes. Please get Aarav ready.")
    expect(texts).toContain("Aarav Sharma's mother will arrive for pickup in about five minutes. Please get Aarav ready.")
    expect(texts.at(-1)).toBe("Aarav Sharma's mother has arrived for pickup. Please get Aarav ready.")
    // Every sentence before the arrival said the time; none said a stale one (fifteen after the first five minutes).
    for (const s of g.said.slice(0, -1)) expect(s.text).toMatch(/in about (fifteen|ten|five|two) minutes/)
    for (const s of g.said.filter((x) => x.at > 5.5 && !x.text.includes('arrived'))) expect(s.text).not.toContain('fifteen')
  })

  it('running late: the new time replaces the old, and the old five-minute reminder never plays', async () => {
    const g = gateDevice()
    g.setTrips([trip({ arrive_at: iso(T0 + 10 * 60_000) })])
    await g.run(3)
    // At 1:03 the parent says they'll be at 1:25 instead of 1:10.
    g.setTrips([trip({ arrive_at: iso(T0 + 25 * 60_000), updated_at: iso(Date.now()) })])
    const before = g.said.length
    await g.run(8)
    const after = g.said.slice(before).map((s) => s.text)
    expect(after[0]).toBe("Aarav Sharma's mother will arrive for pickup in about twenty minutes. Please get Aarav ready.")
    expect(after.some((t) => /five minutes|two minutes|any moment/.test(t))).toBe(false)
  })

  it('cancel: said once, and nothing more for the trip', async () => {
    const g = gateDevice()
    g.setTrips([trip({})])
    await g.run(1)
    const before = g.said.length
    g.setTrips([trip({ status: 'cancelled', updated_at: iso(Date.now()) })])
    await g.run(10)
    const later = g.said.slice(before).map((s) => s.text)
    expect(later).toEqual(['Pickup for Aarav Sharma is cancelled.'])
  })

  it('the admin\'s wording, openings and timings, end to end', async () => {
    const s = gateSettings({
      pickup_eta: '{{preferred_name}}, pickup by {{relation}}, {{eta}}.', opening_new: 'Attention please.', opening_reminder: 'Once more.',
      early_min: 20, ready_min: 15, urgent_min: 7, reminder_min: 2,
    })
    const g = gateDevice(s)
    g.setTrips([trip({ arrive_at: iso(T0 + 18 * 60_000) })])
    await g.run(2.2)
    expect(g.said.map((x) => x.text).slice(0, 2)).toEqual(['Aarav, pickup by mother, in about twenty minutes.', 'Aarav, pickup by mother, in about fifteen minutes.'])
  })

  it('two gate iPads hear the same trip once each, from the one trip record', async () => {
    const a = gateDevice()
    const b = gateDevice()
    a.setTrips([trip({})])
    b.setTrips([trip({})])
    await Promise.all([a.run(0.5), b.run(0.5)])
    expect(a.said.length).toBe(1)
    expect(b.said.length).toBe(1)
  })

  it('running late: the update is said at once in its own words, then reminders with the new time; the old time never plays', async () => {
    const g = gateDevice()
    g.setTrips([trip({ arrive_at: iso(T0 + 10 * 60_000) })])
    await g.run(4)
    // At 1:04 the parent taps Running late, +10: 1:10 becomes 1:20 (0043 sets late_at, late_from and a new arrive_at).
    const at = Date.now()
    g.setTrips([trip({ arrive_at: iso(T0 + 20 * 60_000), late_from: iso(T0 + 10 * 60_000), late_at: iso(at), late_note: 'Traffic near school', updated_at: iso(at) })])
    const before = g.said.length
    await g.run(9)
    const after = g.said.slice(before).map((x) => x.text)
    expect(after[0]).toBe("Pickup update. Aarav Sharma's mother is running late and will arrive in about fifteen minutes.")
    expect(after.filter((t) => t.includes('running late'))).toHaveLength(1)
    expect(after.slice(1).some((t) => /^(This is a reminder|New announcement|Urgent)/.test(t))).toBe(false)
    // Nothing for the old 1:10 (which would be "any moment now" or "two minutes" by now), and the note is never spoken.
    expect(after.some((t) => /any moment|two minutes|traffic/i.test(t))).toBe(false)
  })

  it('a second late update is said again with its new time; the same update is never said twice', async () => {
    const g = gateDevice()
    const late = (arriveMin: number, fromMin: number) => trip({ arrive_at: iso(T0 + arriveMin * 60_000), late_from: iso(T0 + fromMin * 60_000), late_at: iso(Date.now()), updated_at: iso(Date.now()) })
    g.setTrips([late(20, 10)])
    await g.run(1)
    g.setTrips([late(35, 20)])
    await g.run(1)
    const lateSaid = g.said.map((x) => x.text).filter((t) => t.includes('running late'))
    expect(lateSaid).toEqual([
      "Pickup update. Aarav Sharma's mother is running late and will arrive in about twenty minutes.",
      "Pickup update. Aarav Sharma's mother is running late and will arrive in about thirty minutes.",
    ])
  })

  it('an iPad reloaded after a running-late update does not announce it again, but still announces the trip with its time', async () => {
    const lateAt = T0 - 2 * 60_000
    const g = gateDevice(DEFAULT_GATE, T0)
    g.setTrips([trip({ arrive_at: iso(T0 + 15 * 60_000), late_from: iso(T0 + 5 * 60_000), late_at: iso(lateAt), updated_at: iso(lateAt) })])
    await g.run(1)
    expect(g.said.map((x) => x.text)).toEqual(["Aarav Sharma's mother will arrive for pickup in about fifteen minutes. Please get Aarav ready."])
  })
})
