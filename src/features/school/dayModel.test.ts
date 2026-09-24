import { describe, expect, it } from 'vitest'
import { toMinutes } from '../../domain/time'
import type { Programme } from '../../domain/programme'
import type { Trip } from '../trips/api'
import { busyAt, childDay } from './dayModel'

const jrkg: Programme = { name: 'Jr KG · Half day', weekdays: [1, 2, 3, 4, 5], saturdayRule: 'every', term: null, hours: { from: toMinutes('09:00'), to: toMinutes('13:00') },
  windows: { dropoff: { from: toMinutes('08:45'), to: toMinutes('09:00') }, pickup: { from: toMinutes('13:00'), to: toMinutes('13:15') } } }
const trip = (over: Partial<Trip>): Trip => ({ id: 't', child_id: 'k', direction: 'pickup', day: '2026-09-24', status: 'en_route', arrive_at: '2026-09-24T07:30:00Z', off_schedule: false, reason: null,
  created_by: 'g', traveller_name: 'Neha', traveller_relation: 'Mother', created_at: '', updated_at: '', acknowledged_by: null, acknowledged_at: null, ready_at: null, closed_at: null, handed_to: null, ...over })
const base = { programme: jrkg, regular: null, trips: [], attendance: null, times: [] }

describe("a child's day", () => {
  it('expects the regular time, a changed time over it, or the start of the window', () => {
    expect(childDay(base).expected).toEqual({ dropoff: toMinutes('08:45'), pickup: toMinutes('13:00') })
    expect(childDay({ ...base, regular: { dropoff: '08:50:00', pickup: '13:10:00' } }).next).toEqual({ at: toMinutes('08:50'), label: 'drop-off' })
    const d = childDay({ ...base, regular: { dropoff: '08:50:00', pickup: '13:10:00' }, times: [{ child_id: 'k', day: '', direction: 'pickup', at: '12:40:00', reason: 'Doctor', set_by: 'g' }] })
    expect(d.expected.pickup).toBe(toMinutes('12:40'))
  })
  it('goes expected, on the way, at school, collected; away overrides everything', () => {
    expect(childDay({ ...base, trips: [trip({ direction: 'dropoff' })] }).state).toBe('otw')
    const here = childDay({ ...base, trips: [trip({ direction: 'dropoff', status: 'checked_in', closed_at: '2026-09-24T03:20:00Z' })] })
    expect(here.state).toBe('here')
    expect(here.next).toEqual({ at: toMinutes('13:00'), label: 'pickup' })
    expect(childDay({ ...base, trips: [trip({ status: 'handed_over', closed_at: '2026-09-24T07:35:00Z' })] }).next).toEqual({ at: toMinutes('13:05'), label: 'collected' })
    expect(childDay({ ...base, attendance: { child_id: 'k', day: '', status: 'absent', note: 'Unwell', reported_by: null, checked_in_at: null, checked_out_at: null } }).state).toBe('away')
  })
  it('counts who else is due near a time, ignoring those away or done', () => {
    const due = (p: string) => ({ ...base, regular: { dropoff: '08:50:00', pickup: p } })
    const days = [{ id: 'a', day: childDay(due('13:05:00')) }, { id: 'b', day: childDay(due('13:10:00')) }, { id: 'c', day: childDay(due('13:30:00')) },
      { id: 'd', day: childDay({ ...due('13:05:00'), attendance: { child_id: 'd', day: '', status: 'off', note: null, reported_by: null, checked_in_at: null, checked_out_at: null } }) }]
    expect(busyAt(days, 'x', 'pickup', toMinutes('13:05'))).toBe(2)
    expect(busyAt(days, 'a', 'pickup', toMinutes('13:05'))).toBe(1)
  })
})
