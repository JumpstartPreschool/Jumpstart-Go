import { describe, expect, it } from 'vitest'
import { toMinutes } from '../../domain/time'
import { arrivalSlots } from './rules'
import { distanceM, formatDistance, positionOf, SCHOOL } from './geo'

describe('arrivalSlots', () => {
  it('steps 15 minutes from 10 minutes from now, whatever the programme (D56)', () => {
    expect(arrivalSlots(toMinutes('12:52'), { to: toMinutes('13:45') })).toEqual(['13:15', '13:30', '13:45'].map(toMinutes))
  })
  it('keeps to the limit of what is booked: a trip within 3 hours, today\'s time inside the gate day', () => {
    const now = toMinutes('12:10')
    expect(arrivalSlots(now, { to: now + 180 }).at(-1)).toBe(toMinutes('15:00'))
    expect(arrivalSlots(toMinutes('07:00'), { from: toMinutes('08:45'), to: toMinutes('19:15') })[0]).toBe(toMinutes('08:45'))
    expect(arrivalSlots(toMinutes('19:00'), { from: toMinutes('08:45'), to: toMinutes('19:15') })).toEqual([toMinutes('19:15')])
  })
  it('offers nothing past midnight', () => {
    expect(arrivalSlots(toMinutes('23:52'))).toEqual([])
  })
})

describe('positions', () => {
  const at = (sAgo: number, coarse = false) => ({ trip_id: 't', lat: SCHOOL.lat + 0.009, lng: SCHOOL.lng, accuracy: coarse ? 200 : 10,
    fix_at: new Date(1_000_000 - sAgo * 1000).toISOString(), received_at: new Date(1_000_000 - sAgo * 1000).toISOString(), coarse })
  it('is live, then recent, then stale, and unavailable with no point', () => {
    expect(positionOf(at(5), 1_000_000).state).toBe('live')
    expect(positionOf(at(30), 1_000_000).state).toBe('recent')
    expect(positionOf(at(120), 1_000_000).state).toBe('stale')
    expect(positionOf(null, 1_000_000).state).toBe('unavailable')
  })
  it('gives a distance only for an accurate fix', () => {
    expect(Math.round(positionOf(at(5), 1_000_000).away! / 10) * 10).toBe(1000)
    expect(positionOf(at(5, true), 1_000_000).away).toBeNull()
    expect(formatDistance(distanceM(SCHOOL, { lat: SCHOOL.lat + 0.0003, lng: SCHOOL.lng }))).toBe('30 m')
  })
})
