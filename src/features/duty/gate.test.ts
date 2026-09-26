import { describe, expect, it } from 'vitest'
import type { Trip } from '../trips/api'
import { cancelledText, isUrgent, spokenText, type GateChild } from './gate'

const child: GateChild = { id: 'c', name: 'Aarav', fullName: 'Aarav Kulkarni', classId: 'k', className: 'Nursery', programmeName: 'Nursery · 360°' }
const at = (iso: string) => Date.parse(iso)
const trip = (over: Partial<Trip> = {}) => ({
  id: 't', child_id: 'c', direction: 'pickup', day: '2026-09-28', status: 'en_route', arrive_at: '2026-09-28T07:15:00Z',
  off_schedule: false, reason: null, created_by: 'p', traveller_name: 'Sneha Kulkarni', traveller_relation: 'Mother',
  created_at: '2026-09-28T06:50:00Z', updated_at: '2026-09-28T06:50:00Z', ...over,
}) as Trip

describe('gate announcements', () => {
  it('says the kind, the child and class, who, when, then asks for the child to be ready', () => {
    expect(spokenText(trip(), child, at('2026-09-28T06:50:00Z'))).toBe(
      "Pickup for Aarav Kulkarni, Nursery. Aarav's mother, Sneha, is on the way. Arriving about 12:45 PM. Please get Aarav ready.")
  })
  it('is urgent, and says "Arriving now", within five minutes of arrival', () => {
    const now = at('2026-09-28T07:12:00Z')
    expect(isUrgent(trip(), now)).toBe(true)
    expect(isUrgent(trip(), at('2026-09-28T06:50:00Z'))).toBe(false)
    expect(spokenText(trip(), child, now)).toContain('Arriving now.')
  })
  it('is urgent outside the usual time, with the reason; a changed time says so first', () => {
    const t = trip({ off_schedule: true, reason: "Doctor's visit", updated_at: '2026-09-28T06:55:00Z' })
    expect(isUrgent(t, at('2026-09-28T06:00:00Z'))).toBe(true)
    const said = spokenText(t, child, at('2026-09-28T06:00:00Z'))
    expect(said.startsWith('Time changed. Pickup for Aarav Kulkarni')).toBe(true)
    expect(said).toContain("Reason: Doctor's visit.")
  })
  it('drop-offs skip "get ready", and cancellations are one sentence', () => {
    expect(spokenText(trip({ direction: 'dropoff' }), child, at('2026-09-28T06:50:00Z'))).not.toContain('ready')
    expect(cancelledText(trip(), child)).toBe('Pickup for Aarav Kulkarni is cancelled.')
  })
})
