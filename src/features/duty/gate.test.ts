import { describe, expect, it } from 'vitest'
import type { Trip } from '../trips/api'
import { DEFAULT_GATE, gateSettings } from '../../../supabase/functions/_shared/gateAnnounce'
import { announceStage, cancelledText, isLate, isUrgent, lateText, priorityOf, PRIORITY, settled, shouldAnnounce, spokenText, stageOf, type GateChild } from './gate'

const child: GateChild = { id: 'c', name: 'Aarav', fullName: 'Aarav Sharma', classId: 'k', className: 'Nursery', programmeName: 'Nursery Morning' }
const S = DEFAULT_GATE
// The parent set off at 1:00 PM India time (07:30Z).
const T0 = Date.parse('2026-09-28T07:30:00Z')
const min = (m: number) => T0 + m * 60_000
const iso = (ms: number) => new Date(ms).toISOString()
const trip = (arriveInMin: number, over: Partial<Trip> = {}) => ({
  id: 't', child_id: 'c', direction: 'pickup', day: '2026-09-28', status: 'en_route', arrive_at: iso(min(arriveInMin)),
  off_schedule: false, reason: null, created_by: 'p', traveller_name: 'Priya Sharma', traveller_relation: 'Mother',
  created_at: iso(T0), updated_at: iso(T0), acknowledged_at: null, ...over,
}) as Trip

describe('the ETA is always spoken', () => {
  it('says the time for each button: 5, 10 and 15 minutes', () => {
    expect(spokenText(trip(5), child, T0, S)).toBe("Aarav Sharma's mother will arrive for pickup in about five minutes. Please get Aarav ready.")
    expect(spokenText(trip(10), child, T0, S)).toBe("Aarav Sharma's mother will arrive for pickup in about ten minutes. Please get Aarav ready.")
    expect(spokenText(trip(15), child, T0, S)).toBe("Aarav Sharma's mother will arrive for pickup in about fifteen minutes. Please get Aarav ready.")
  })

  it('works out a custom time from arrive_at: 22 minutes is about twenty, 13 about fifteen, 6 about five', () => {
    expect(spokenText(trip(22), child, T0, S)).toContain('in about twenty minutes')
    expect(spokenText(trip(13), child, T0, S)).toContain('in about fifteen minutes')
    expect(spokenText(trip(6), child, T0, S)).toContain('in about five minutes')
    expect(spokenText(trip(9), child, T0, S)).toContain('in about ten minutes')
  })

  it('says the time left now, not the time first chosen, as time passes', () => {
    const t = trip(15)
    expect(spokenText(t, child, min(5), S)).toContain('in about ten minutes')
    expect(spokenText(t, child, min(10), S)).toContain('in about five minutes')
    expect(spokenText(t, child, min(12.5), S)).toContain('in about two minutes')
    // The time has come and they haven't tapped "I've arrived": any moment now, never a stuck "five minutes".
    expect(spokenText(t, child, min(16), S)).toBe("Aarav Sharma's mother will arrive for pickup any moment now. Please get Aarav ready.")
  })

  it('says a clock time for an arrival more than about an hour away, in India time', () => {
    expect(spokenText(trip(82), child, T0, S)).toContain('at about two twenty two in the afternoon')
  })

  it('uses the new time after "running late" or "change time"', () => {
    const late = trip(25, { updated_at: iso(min(3)) })
    expect(spokenText(late, child, min(3), S)).toContain('in about twenty minutes')
    expect(stageOf(late, min(3), S)).toBe('far')
  })

  it('says arrived, not minutes, once the parent taps "I\'ve arrived"', () => {
    const t = trip(10, { arrived_at: iso(min(2)) })
    expect(spokenText(t, child, min(2), S)).toBe("Aarav Sharma's mother has arrived for pickup. Please get Aarav ready.")
    expect(stageOf(t, min(2), S)).toBe('arrived')
  })

  it('drop-offs say the time and arrival the same way', () => {
    expect(spokenText(trip(10, { direction: 'dropoff' }), child, T0, S)).toBe('Aarav Sharma will arrive for drop-off in about ten minutes.')
    expect(spokenText(trip(5, { direction: 'dropoff' }), child, T0, S)).toBe('Aarav Sharma will arrive for drop-off in about five minutes.')
    expect(spokenText(trip(5, { direction: 'dropoff', arrived_at: iso(T0) }), child, T0, S)).toBe('Aarav Sharma has arrived for drop-off.')
  })

  it('says "pickup person" for a one-time collector, and never a phone, code or reason', () => {
    const said = spokenText(trip(10, { traveller_kind: 'third_person', traveller_relation: 'Driver', traveller_phone: '+919876543210', reason: "Doctor's visit", off_schedule: true }), child, T0, S)
    expect(said).toBe("Aarav Sharma's pickup person will arrive for pickup in about ten minutes. Please get Aarav ready.")
    expect(said).not.toMatch(/9876|doctor|driver/i)
  })

  it('says a cancellation once, from its own template', () => {
    expect(cancelledText(trip(10), child, S)).toBe('Pickup for Aarav Sharma is cancelled.')
    expect(cancelledText(trip(10, { direction: 'dropoff' }), child, S)).toBe('Drop-off for Aarav Sharma is cancelled.')
  })
})

describe("the admin's templates and timings", () => {
  it('uses a changed template for new announcements', () => {
    const s = gateSettings({ pickup_eta: '{{preferred_name}} is being collected by {{relation}} {{eta}}. Pickup.', dropoff_eta: '{{child_name}} drop-off in about {{minutes}} minutes.' })
    expect(spokenText(trip(10), child, T0, s)).toBe('Aarav is being collected by mother in about ten minutes. Pickup.')
    expect(spokenText(trip(15, { direction: 'dropoff' }), child, T0, s)).toBe('Aarav Sharma drop-off in about fifteen minutes.')
    // A {{minutes}} wording can't say "any moment now": the default says it instead of a wrong number.
    expect(spokenText(trip(0, { direction: 'dropoff' }), child, T0, s)).toBe('Aarav Sharma will arrive for drop-off any moment now.')
  })

  it('falls back to the default for a broken or missing template, so the gate never goes quiet', () => {
    const s = gateSettings({ pickup_eta: 'Someone is coming.', pickup_arrived: '{{child_name}} {{eval}} arrived pickup', opening_new: 'New {{child_name}}.' })
    expect(spokenText(trip(10), child, T0, s)).toBe(spokenText(trip(10), child, T0, DEFAULT_GATE))
    expect(s.opening_new).toBe(DEFAULT_GATE.opening_new)
    expect(gateSettings(null)).toEqual(DEFAULT_GATE)
  })

  it('moves through the stages at the admin\'s timings: early, get ready, urgent, due', () => {
    const t = trip(30)
    expect([0, 16, 21, 26, 29.5].map((m) => stageOf(t, min(m), S))).toEqual(['far', 'early', 'ready', 'urgent', 'due'])
    const s = gateSettings({ early_min: 20, ready_min: 15, urgent_min: 7 })
    expect([0, 11, 16, 24].map((m) => stageOf(t, min(m), s))).toEqual(['far', 'early', 'ready', 'urgent'])
    // Due is heard as reminders of the urgent announcement, not a second urgent one.
    expect(announceStage('due')).toBe('urgent')
  })

  it('keeps the timings in order or not at all', () => {
    const s = gateSettings({ early_min: 10, ready_min: 10, urgent_min: 5 })
    expect([s.early_min, s.ready_min, s.urgent_min]).toEqual([15, 10, 5])
  })
})

describe('urgency and queue order (fixed by the system)', () => {
  it('arrived first, then urgent or due, then outside the usual time, then the rest', () => {
    expect(priorityOf(trip(10, { arrived_at: iso(T0) }), T0, S)).toBe(PRIORITY.arrived)
    expect(priorityOf(trip(4), T0, S)).toBe(PRIORITY.urgent)
    expect(priorityOf(trip(0), T0, S)).toBe(PRIORITY.urgent)
    expect(priorityOf(trip(14, { off_schedule: true }), T0, S)).toBe(PRIORITY.offSchedule)
    expect(priorityOf(trip(14), T0, S)).toBe(PRIORITY.normal)
    expect(PRIORITY.arrived > PRIORITY.urgent && PRIORITY.urgent > PRIORITY.offSchedule && PRIORITY.offSchedule > PRIORITY.normal).toBe(true)
  })

  it('is urgent within the urgent time, at arrival, when due, or outside the usual time', () => {
    expect(isUrgent(trip(5), T0, S)).toBe(true)
    expect(isUrgent(trip(8), T0, S)).toBe(false)
    expect(isUrgent(trip(8), T0, gateSettings({ early_min: 20, ready_min: 10, urgent_min: 7 }))).toBe(false)
    expect(isUrgent(trip(7), T0, gateSettings({ early_min: 20, ready_min: 10, urgent_min: 7 }))).toBe(true)
    expect(isUrgent(trip(30, { off_schedule: true }), T0, S)).toBe(true)
  })

  it('stays quiet once acknowledged, until the parent taps "I\'ve arrived"', () => {
    const mine = new Set(['k'])
    const acked = trip(10, { acknowledged_at: iso(min(1)), acknowledged_by: 'x' })
    expect(shouldAnnounce(acked, 'k', mine, mine, min(2))).toBe(false)
    expect(shouldAnnounce({ ...acked, arrived_at: iso(min(3)) }, 'k', mine, mine, min(3))).toBe(true)
    expect(shouldAnnounce(trip(10, { status: 'cancelled' }), 'k', mine, mine, T0)).toBe(false)
  })
})

describe('running late (0043)', () => {
  const late = (arriveMin: number, over: Partial<Trip> = {}) => trip(arriveMin, { late_at: iso(T0), late_from: iso(min(arriveMin - 10)), ...over })
  it('says the late update with the new time, for pickup and drop-off', () => {
    expect(lateText(late(10), child, T0, S)).toBe("Pickup update. Aarav Sharma's mother is running late and will arrive in about ten minutes.")
    expect(lateText(late(15, { direction: 'dropoff' }), child, T0, S)).toBe('Drop-off update. Aarav Sharma is running late and will arrive in about fifteen minutes.')
    expect(lateText(late(10, { late_note: 'Traffic near school' }), child, T0, S)).not.toMatch(/traffic/i)
  })
  it('sits below arrived and urgent, above outside the usual time and normal', () => {
    expect(priorityOf(late(12), T0, S)).toBe(PRIORITY.late)
    expect(priorityOf(late(12, { off_schedule: true }), T0, S)).toBe(PRIORITY.late)
    expect(priorityOf(late(4), T0, S)).toBe(PRIORITY.urgent)
    expect(priorityOf(late(12, { arrived_at: iso(T0) }), T0, S)).toBe(PRIORITY.arrived)
    expect(PRIORITY.urgent > PRIORITY.late && PRIORITY.late > PRIORITY.offSchedule).toBe(true)
  })
  it('is no longer "running late" once they arrive', () => {
    expect(isLate(late(12))).toBe(true)
    expect(isLate(late(12, { arrived_at: iso(T0) }))).toBe(false)
    expect(isLate(trip(12))).toBe(false)
  })
})

describe('handled requests (lock-screen alerts taken down)', () => {
  it('is handled once closed, cancelled or acknowledged, and open again when the collector arrives after that', () => {
    expect(settled(trip(10))).toBe(false)
    expect(settled(trip(10, { status: 'completed' as Trip['status'] }))).toBe(true)
    expect(settled(trip(10, { status: 'cancelled' as Trip['status'] }))).toBe(true)
    expect(settled(trip(10, { acknowledged_at: iso(min(1)) }))).toBe(true)
    expect(settled(trip(10, { acknowledged_at: iso(min(1)), arrived_at: iso(min(5)) }))).toBe(false)
  })
})
