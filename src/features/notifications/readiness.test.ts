import { describe, expect, it } from 'vitest'
import { readinessOf } from './readiness'

const now = Date.parse('2026-10-15T10:00:00+05:30')
const ago = (days: number) => new Date(now - days * 86_400_000).toISOString()

describe('device readiness', () => {
  it('names each state that is not about evidence', () => {
    expect(readinessOf('unsupported', null, now).label).toBe('Unsupported')
    expect(readinessOf('needs-install', null, now).label).toBe('Setup required')
    expect(readinessOf('off', null, now).label).toBe('Setup required')
    expect(readinessOf('denied', null, now).label).toBe('Notifications blocked')
    expect(readinessOf('not-configured', null, now).label).toBe('Needs attention')
  })

  it('never calls permission and a subscription Ready', () => {
    expect(readinessOf('on', null, now).status).toBe('attention')
    expect(readinessOf('on', { lastTestAt: null, testHeardAt: null }, now).status).toBe('attention')
  })

  it('needs a person to have heard a test that this device displayed', () => {
    expect(readinessOf('on', { lastTestAt: ago(1), testHeardAt: null }, now).status).toBe('attention')
    const r = readinessOf('on', { lastTestAt: ago(1), testHeardAt: ago(1) }, now)
    expect(r.status).toBe('ready')
    expect(r.detail).toMatch(/Silent mode, Focus/)
  })

  it('asks again after a week', () => {
    expect(readinessOf('on', { lastTestAt: ago(8), testHeardAt: ago(8) }, now).status).toBe('attention')
    expect(readinessOf('on', { lastTestAt: ago(1), testHeardAt: ago(8) }, now).status).toBe('attention')
  })

  it('cannot read evidence for the Android app, so asks for a test by ear', () => {
    expect(readinessOf('on', null, now, true).status).toBe('attention')
  })
})
