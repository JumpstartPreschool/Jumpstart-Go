import { describe, expect, it } from 'vitest'
import type { Programme } from '../../domain/programme'
import { toMinutes } from '../../domain/time'
import { arrivalSlots } from './rules'
import { distanceM, formatDistance, positionOf, SCHOOL } from './geo'

const halfDay: Programme = {
  name: 'Jr KG · Half day', weekdays: [1, 2, 3, 4, 5, 6], saturdayRule: 'every', term: null, hours: { from: toMinutes('09:00'), to: toMinutes('13:00') },
  windows: { dropoff: { from: toMinutes('08:45'), to: toMinutes('09:00') }, pickup: { from: toMinutes('13:00'), to: toMinutes('13:15') } },
}
const plus: Programme = { ...halfDay, name: 'Jr KG · 360°+', windows: { dropoff: { from: toMinutes('08:45'), to: toMinutes('09:00') }, pickup: { from: toMinutes('16:30'), to: toMinutes('19:00') } } }

describe('arrivalSlots', () => {
  it('steps 5 minutes for a short window, starting 10 minutes from now, marking where each falls', () => {
    const s = arrivalSlots(halfDay, 'pickup', toMinutes('12:52'), 6)
    expect(s.map((x) => x.at)).toEqual(['13:05', '13:10', '13:15', '13:20', '13:25', '13:30'].map(toMinutes))
    expect(s.map((x) => x.state)).toEqual(['inside', 'inside', 'inside', 'late', 'late', 'late'])
  })
  it('offers the window and 15 minutes either side, even when it is hours away', () => {
    const s = arrivalSlots({ ...halfDay, windows: { dropoff: { from: toMinutes('11:30'), to: toMinutes('11:45') }, pickup: { from: toMinutes('17:30'), to: toMinutes('17:45') } } }, 'pickup', toMinutes('12:10'))
    expect(s[0]).toEqual({ at: toMinutes('17:15'), state: 'early' })
    expect(s.filter((x) => x.state === 'inside').map((x) => x.at)).toEqual(['17:30', '17:35', '17:40', '17:45'].map(toMinutes))
    expect(s.at(-1)).toEqual({ at: toMinutes('18:00'), state: 'late' })
  })
  it('steps 15 minutes inside a long window', () => {
    expect(arrivalSlots(plus, 'pickup', toMinutes('18:40')).map((x) => x.at)).toEqual([toMinutes('19:00')])
  })
  it('after the window, offers later times marked late', () => {
    const s = arrivalSlots(halfDay, 'pickup', toMinutes('14:00'), 3)
    expect(s).toEqual(['14:10', '14:15', '14:20'].map((t) => ({ at: toMinutes(t), state: 'late' })))
  })
  it('keeps offering late times after the usual hours (0026), and nothing past midnight', () => {
    expect(arrivalSlots(plus, 'pickup', toMinutes('19:10'))[0]).toEqual({ at: toMinutes('19:30'), state: 'late' }) // a long window steps by 15 minutes
    expect(arrivalSlots(plus, 'pickup', toMinutes('23:52'))).toEqual([])
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
