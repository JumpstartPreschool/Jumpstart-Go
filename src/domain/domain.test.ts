import { describe, expect, it } from 'vitest'
import { formatTime, indiaClock, toMinutes } from './time'
import { checkTime, programmeErrors, runsOn, type Programme } from './programme'
import { formatAge, freshness } from './freshness'
import { lateBand } from './lateness'

const t = toMinutes
const noHolidays = new Set<string>()

// Karve Road programmes from PRD §5.
const jrKgHalfDay: Programme = {
  name: 'Jr KG · Half day',
  weekdays: [1, 2, 3, 4, 5],
  saturdayRule: 'every',
  term: { start: '2026-06-01', end: '2027-03-31' },
  hours: { from: t('09:00'), to: t('13:00') },
  windows: { dropoff: { from: t('09:00'), to: t('09:30') }, pickup: { from: t('12:30'), to: t('13:00') } },
}
const learningCenter: Programme = {
  name: 'Learning Center',
  weekdays: [1, 2, 3, 4, 5, 6],
  saturdayRule: 'except_2nd_and_last',
  term: null,
  hours: { from: t('09:00'), to: t('19:00') },
  windows: 'flexible',
}

describe('time', () => {
  it('parses and formats', () => {
    expect(t('09:30')).toBe(570)
    expect(formatTime(t('13:05'))).toBe('1:05 PM')
    expect(formatTime(t('12:00'))).toBe('12:00 PM')
    expect(() => t('9:30')).toThrow()
    expect(() => t('24:00')).toThrow()
  })
  it('reads India time from a UTC instant', () => {
    expect(indiaClock(new Date('2026-09-24T18:40:00Z'))).toEqual({ date: '2026-09-25', minutes: t('00:10'), weekday: 5 })
  })
})

describe('programmes', () => {
  it('accepts the Karve Road programmes', () => {
    expect(programmeErrors(jrKgHalfDay)).toEqual([])
    expect(programmeErrors(learningCenter)).toEqual([])
  })
  it('rejects hours outside school hours and windows outside the programme', () => {
    expect(programmeErrors({ ...learningCenter, hours: { from: t('08:30'), to: t('19:00') } })).toContain(
      'Hours must be within school hours, 9:00 AM to 7:00 PM.',
    )
    const badWindow = { ...jrKgHalfDay, windows: { dropoff: { from: t('09:00'), to: t('09:30') }, pickup: { from: t('12:30'), to: t('13:30') } } }
    expect(programmeErrors(badWindow)).toEqual(['The pickup window must be within the programme hours.'])
  })
  it('knows which days a programme runs', () => {
    expect(runsOn(jrKgHalfDay, '2026-09-24', noHolidays)).toBe(true) // Thursday
    expect(runsOn(jrKgHalfDay, '2026-09-26', noHolidays)).toBe(false) // Saturday, Mon–Fri programme
    expect(runsOn(jrKgHalfDay, '2027-04-15', noHolidays)).toBe(false) // after the June–March term
    expect(runsOn(jrKgHalfDay, '2026-09-24', new Set(['2026-09-24']))).toBe(false)
  })
  it('skips the 2nd and last Saturday', () => {
    expect(runsOn(learningCenter, '2026-10-03', noHolidays)).toBe(true)
    expect(runsOn(learningCenter, '2026-10-10', noHolidays)).toBe(false) // 2nd
    expect(runsOn(learningCenter, '2026-10-24', noHolidays)).toBe(true) // 4th of 5
    expect(runsOn(learningCenter, '2026-10-31', noHolidays)).toBe(false) // last
    expect(runsOn(learningCenter, '2026-09-26', noHolidays)).toBe(false) // 4th and last of 4
  })
})

describe('checkTime', () => {
  it('allows a time inside the window with no flags', () => {
    expect(checkTime(jrKgHalfDay, 'pickup', t('12:45'), t('10:00'))).toEqual({ ok: true, offSchedule: false, shortNotice: false })
  })
  it('flags off-schedule and short notice, but still allows them', () => {
    expect(checkTime(jrKgHalfDay, 'pickup', t('11:00'), t('10:50'))).toEqual({ ok: true, offSchedule: true, shortNotice: true })
    expect(checkTime(jrKgHalfDay, 'pickup', t('13:10'), null)).toEqual({ ok: true, offSchedule: true, shortNotice: false })
  })
  it('treats the whole day as the window for flexible programmes', () => {
    expect(checkTime(learningCenter, 'pickup', t('17:40'), null)).toEqual({ ok: true, offSchedule: false, shortNotice: false })
  })
  it('refuses times outside 9 AM–7 PM and in the past', () => {
    expect(checkTime(learningCenter, 'pickup', t('19:15'), null)).toEqual({ ok: false, reason: 'outside_school_hours' })
    expect(checkTime(learningCenter, 'dropoff', t('08:45'), null)).toEqual({ ok: false, reason: 'outside_school_hours' })
    expect(checkTime(jrKgHalfDay, 'pickup', t('12:30'), t('12:40'))).toEqual({ ok: false, reason: 'in_the_past' })
  })
})

describe('freshness', () => {
  const now = 1_000_000
  it('labels by age', () => {
    expect(freshness(null, now)).toEqual({ state: 'unavailable', ageMs: null })
    expect(freshness({ fixAt: now - 14_999, receivedAt: now }, now).state).toBe('live')
    expect(freshness({ fixAt: now - 15_000, receivedAt: now }, now).state).toBe('recent')
    expect(freshness({ fixAt: now - 60_000, receivedAt: now }, now).state).toBe('stale')
  })
  it('never trusts a phone clock that runs ahead', () => {
    // Phone says the fix is from the future; the server received it 90 s ago.
    expect(freshness({ fixAt: now + 30_000, receivedAt: now - 90_000 }, now)).toEqual({ state: 'stale', ageMs: 90_000 })
  })
  it('formats ages', () => {
    expect(formatAge(32_000)).toBe('32s')
    expect(formatAge(185_000)).toBe('3 min')
    expect(formatAge(65 * 60_000)).toBe('1 h 5 min')
  })
})

describe('lateBand', () => {
  it('announces at the threshold and every 10 minutes after', () => {
    expect(lateBand(t('12:45'), t('12:54'))).toBe(0)
    expect(lateBand(t('12:45'), t('12:55'))).toBe(10)
    expect(lateBand(t('12:45'), t('13:04'))).toBe(10)
    expect(lateBand(t('12:45'), t('13:05'))).toBe(20)
    expect(lateBand(t('12:45'), t('12:30'))).toBe(0)
  })
})
