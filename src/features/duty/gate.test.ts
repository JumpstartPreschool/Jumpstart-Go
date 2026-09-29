import { describe, expect, it } from 'vitest'
import type { Trip } from '../trips/api'
import { cancelledText, isUrgent, phaseOf, spokenText, type GateChild } from './gate'

const child: GateChild = { id: 'c', name: 'Vihaan', fullName: 'Vihaan Kulkarni', classId: 'k', className: 'Junior KG', programmeName: 'Junior KG · 360°' }
const at = (iso: string) => Date.parse(iso)
const trip = (over: Partial<Trip> = {}) => ({
  id: 't', child_id: 'c', direction: 'pickup', day: '2026-09-28', status: 'en_route', arrive_at: '2026-09-28T07:15:00Z',
  off_schedule: false, reason: null, created_by: 'p', traveller_name: 'Priya Kulkarni', traveller_relation: 'Mother',
  created_at: '2026-09-28T06:50:00Z', updated_at: '2026-09-28T06:50:00Z', ...over,
}) as Trip

describe('gate announcements', () => {
  it('says the child and who is coming, then asks for the child to be ready (never the class or the time)', () => {
    const said = spokenText(trip(), child, at('2026-09-28T06:50:00Z'))
    expect(said).toBe("Vihaan Kulkarni's mother is on the way for pickup. Please get Vihaan ready.")
    expect(said).not.toMatch(/Junior KG|12:45|PM/)
  })
  it('gets more specific as the chosen time comes closer: about ten minutes, then about five', () => {
    expect(spokenText(trip(), child, at('2026-09-28T07:04:00Z'))).toBe("Vihaan Kulkarni's mother will arrive for pickup in about ten minutes. Please get Vihaan ready.")
    expect(spokenText(trip(), child, at('2026-09-28T07:10:00Z'))).toBe("Vihaan Kulkarni's mother will arrive for pickup in about five minutes. Please get Vihaan ready.")
    expect(phaseOf(trip(), at('2026-09-28T06:50:00Z'))).toBe('onway')
    // Past the chosen time without an arrival: still on the way, never "five minutes" forever.
    expect(phaseOf(trip(), at('2026-09-28T07:30:00Z'))).toBe('onway')
  })
  it('announces an arrival when the parent taps I\'ve arrived, as urgent', () => {
    const t = trip({ arrived_at: '2026-09-28T07:14:00Z' })
    expect(phaseOf(t, at('2026-09-28T06:50:00Z'))).toBe('arrived')
    expect(spokenText(t, child, at('2026-09-28T07:14:00Z'))).toBe("Vihaan Kulkarni's mother has arrived for pickup. Please get Vihaan ready.")
    expect(isUrgent(t, at('2026-09-28T06:00:00Z'))).toBe(true)
  })
  it('is urgent within five minutes of arrival, and outside the usual time', () => {
    expect(isUrgent(trip(), at('2026-09-28T07:12:00Z'))).toBe(true)
    expect(isUrgent(trip(), at('2026-09-28T06:50:00Z'))).toBe(false)
    expect(isUrgent(trip({ off_schedule: true, reason: "Doctor's visit" }), at('2026-09-28T06:00:00Z'))).toBe(true)
  })
  it('says "pickup person" for someone with a one-time link, or with no relation on record', () => {
    expect(spokenText(trip({ traveller_kind: 'third_person', traveller_relation: 'Driver' }), child, at('2026-09-28T06:50:00Z')))
      .toBe("Vihaan Kulkarni's pickup person is on the way for pickup. Please get Vihaan ready.")
    expect(spokenText(trip({ traveller_relation: null }), child, at('2026-09-28T06:50:00Z'))).toContain("Vihaan Kulkarni's pickup person")
  })
  it('drop-offs name the child only and skip "get ready"; cancellations are one sentence', () => {
    expect(spokenText(trip({ direction: 'dropoff' }), child, at('2026-09-28T07:04:00Z'))).toBe('Vihaan Kulkarni will arrive for drop-off in about ten minutes.')
    expect(spokenText(trip({ direction: 'dropoff', arrived_at: '2026-09-28T07:14:00Z' }), child, at('2026-09-28T07:14:00Z'))).toBe('Vihaan Kulkarni has arrived for drop-off.')
    expect(cancelledText(trip(), child)).toBe('Pickup for Vihaan Kulkarni is cancelled.')
  })
})
