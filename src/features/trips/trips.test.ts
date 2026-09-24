import { describe, expect, it } from 'vitest'
import type { Programme } from '../../domain/programme'
import { toMinutes } from '../../domain/time'
import { arrivalSlots } from './rules'
import { distanceM, formatDistance, positionOf, toE164, whatsappUrl, SCHOOL } from './geo'

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
  it('steps 15 minutes for a long window and stops at the gate closing', () => {
    const s = arrivalSlots(plus, 'pickup', toMinutes('18:40'))
    expect(s.map((x) => x.at)).toEqual(['19:00', '19:15'].map(toMinutes))
    expect(s.map((x) => x.state)).toEqual(['inside', 'late'])
  })
  it('has nothing after the gate closes', () => {
    expect(arrivalSlots(plus, 'pickup', toMinutes('19:10'))).toEqual([])
  })
})

describe('phone numbers', () => {
  it('reads Indian mobiles however they are typed', () => {
    for (const v of ['98765 43210', '098765-43210', '+91 98765 43210', '919876543210']) expect(toE164(v)).toBe('+919876543210')
  })
  it('keeps other countries only with their code', () => {
    expect(toE164('+971 50 123 4567')).toBe('+971501234567')
    expect(toE164('12345')).toBeNull()
    expect(toE164('5876543210')).toBeNull() // not an Indian mobile, and no country code
  })
  it('builds a WhatsApp link with the message', () => {
    expect(whatsappUrl('+919876543210', 'Hi & bye')).toBe('https://wa.me/919876543210?text=Hi%20%26%20bye')
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
