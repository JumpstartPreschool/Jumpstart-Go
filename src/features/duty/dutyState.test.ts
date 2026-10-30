// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { clearCachedDuties, connectivityOf, dutyOnThisDevice, dutyTime, isDutyConflict, notificationReadiness, parseDuty, readCachedDuty, writeCachedDuty } from './dutyState'

const active = { status: 'active', version: 3, started_at: '2026-10-22T03:00:00Z', changed_at: '2026-10-22T07:10:00Z', paused_at: null, resumed_at: '2026-10-22T07:10:00Z', change_reason: 'resumed' }

describe('duty from the server', () => {
  it('reads active and paused, and anything else as off duty', () => {
    expect(parseDuty(active)?.status).toBe('active')
    expect(parseDuty({ ...active, status: 'paused' })?.status).toBe('paused')
    expect(parseDuty(null)).toBeNull()
    expect(parseDuty({ ...active, status: 'off' })).toBeNull()
    expect(parseDuty({ ...active, version: '3' })).toBeNull()
  })
  it('recognises a change made on another device', () => {
    expect(isDutyConflict({ message: 'duty_conflict: Your duty was changed on another device.' })).toBe(true)
    expect(isDutyConflict({ message: 'Failed to fetch' })).toBe(false)
    expect(isDutyConflict(null)).toBe(false)
  })
  it('keeps the last confirmed duty per person, so a shared tablet never shows someone else\'s', () => {
    writeCachedDuty('u1', parseDuty(active), 1000)
    expect(readCachedDuty('u1')?.duty?.status).toBe('active')
    expect(readCachedDuty('u2')).toBeUndefined()
    expect(dutyOnThisDevice()).toBe(true)
    writeCachedDuty('u1', null, 2000)
    expect(readCachedDuty('u1')).toEqual({ duty: null, at: 2000 })
    expect(dutyOnThisDevice()).toBe(false)
  })
})

describe('connection is its own fact', () => {
  const now = 1_000_000
  it('is online only when the school answered recently', () => {
    expect(connectivityOf({ browserOnline: true, lastOkAt: now - 5_000, lastFailAt: null, nowMs: now })).toBe('online')
    expect(connectivityOf({ browserOnline: true, lastOkAt: now - 200_000, lastFailAt: null, nowMs: now })).toBe('reconnecting')
    expect(connectivityOf({ browserOnline: true, lastOkAt: null, lastFailAt: null, nowMs: now })).toBe('unknown')
  })
  it('is offline or reconnecting when the browser or the school says so, never online', () => {
    expect(connectivityOf({ browserOnline: false, lastOkAt: now, lastFailAt: null, nowMs: now })).toBe('offline')
    expect(connectivityOf({ browserOnline: true, lastOkAt: now - 10_000, lastFailAt: now - 1_000, nowMs: now })).toBe('reconnecting')
  })
})

describe('notification readiness is its own fact', () => {
  it('maps every push state', () => {
    expect(notificationReadiness('on')).toBe('ready')
    expect(notificationReadiness('off')).toBe('permission')
    expect(notificationReadiness('denied')).toBe('permission')
    expect(notificationReadiness('needs-install')).toBe('permission')
    expect(notificationReadiness('not-configured')).toBe('unavailable')
    expect(notificationReadiness('unsupported')).toBe('unsupported')
    expect(notificationReadiness(null)).toBeNull()
  })
})

describe('duty across days', () => {
  const now = Date.parse('2026-10-22T08:30:00+05:30')
  it('says the day when duty started before today (duty runs past midnight)', () => {
    expect(dutyTime(Date.parse('2026-10-22T07:05:00+05:30'), now)).toMatch(/^7:05/)
    expect(dutyTime(Date.parse('2026-10-21T16:00:00+05:30'), now)).toMatch(/^yesterday, 4:00/i)
    expect(dutyTime(Date.parse('2026-10-20T16:00:00+05:30'), now)).toMatch(/^Tue,? 20 Oct, 4:00/i)
  })
  it('signing out forgets cached duties, so an old one never holds back updates', () => {
    writeCachedDuty('someone', parseDuty({ status: 'active', version: 1, started_at: '2026-10-22T03:00:00Z', changed_at: '2026-10-22T03:00:00Z' }), 1)
    expect(dutyOnThisDevice()).toBe(true)
    clearCachedDuties()
    expect(dutyOnThisDevice()).toBe(false)
  })
})
