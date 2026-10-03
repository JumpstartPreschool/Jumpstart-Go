import { describe, expect, it, vi } from 'vitest'
import { handle, type Deps } from './handler'
import type { WhatsAppLogRow } from '../_shared/wati'

function setupDeps(over: Partial<Deps> = {}) {
  const logs: WhatsAppLogRow[] = []
  const deps: Deps = {
    verify: vi.fn((raw) => JSON.parse(raw)),
    otpRecipient: vi.fn(async (phone) => (phone === '+919822000001' ? 'profile-uuid-1' : null)),
    wati: {
      sendTemplate: vi.fn(async () => ({ ok: true, broadcastId: 'bc-999', localId: 'test-local-id' })),
    },
    log: vi.fn(async (row) => {
      logs.push(row)
    }),
    template: 'jumpstart_signin_code',
    newId: () => 'fixed-local-id',
    ...over,
  }
  return { deps, logs }
}

describe('send-sms hook handler', () => {
  it('rejects non-POST methods with 405', async () => {
    const { deps } = setupDeps()
    const req = new Request('https://example.com', { method: 'GET' })
    const res = await handle(req, deps)
    expect(res.status).toBe(405)
  })

  it('rejects invalid signature with 401', async () => {
    const { deps } = setupDeps({
      verify: () => {
        throw new Error('invalid signature')
      },
    })
    const req = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ user: { phone: '+919822000001' }, sms: { otp: '123456' } }),
    })
    const res = await handle(req, deps)
    expect(res.status).toBe(401)
  })

  it('rejects malformed payload with 400', async () => {
    const { deps } = setupDeps()
    const req = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ invalid: true }),
    })
    const res = await handle(req, deps)
    expect(res.status).toBe(400)
  })

  it('returns empty 200 without sending WhatsApp when recipient is not registered (anti-enumeration)', async () => {
    const { deps, logs } = setupDeps()
    const req = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ user: { phone: '+919899999999' }, sms: { otp: '123456' } }),
    })
    const res = await handle(req, deps)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({})
    expect(deps.wati.sendTemplate).not.toHaveBeenCalled()
    expect(logs).toHaveLength(0)
  })

  it('sends WATI template and writes audit log for registered recipient', async () => {
    const { deps, logs } = setupDeps()
    const req = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ user: { phone: '+919822000001' }, sms: { otp: '654321' } }),
    })
    const res = await handle(req, deps)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({})

    expect(deps.wati.sendTemplate).toHaveBeenCalledWith({
      phone: '919822000001',
      template: 'jumpstart_signin_code',
      params: ['654321'],
      localMessageId: 'fixed-local-id',
      broadcastName: 'signin_code',
    })

    expect(logs).toHaveLength(1)
    expect(logs[0]).toEqual({
      profileId: 'profile-uuid-1',
      phone: '919822000001',
      kind: 'signin_code',
      template: 'jumpstart_signin_code',
      localId: 'fixed-local-id',
      broadcastId: 'bc-999',
      status: 'accepted',
      error: null,
    })
  })

  it('returns safe error envelope if WATI fails due to rate limiting or downtime', async () => {
    const { deps } = setupDeps({
      wati: {
        sendTemplate: vi.fn(async () => ({
          ok: false,
          category: 'rate_limited',
          retryable: true,
          localId: 'fixed-local-id',
        })),
      },
    })
    const req = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ user: { phone: '+919822000001' }, sms: { otp: '654321' } }),
    })
    const res = await handle(req, deps)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      error: {
        http_code: 503,
        message: "Couldn't send the WhatsApp code right now.",
      },
    })
  })
})
