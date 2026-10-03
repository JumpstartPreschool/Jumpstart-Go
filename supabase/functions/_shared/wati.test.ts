import { describe, expect, it, vi } from 'vitest'
import {
  createWati,
  maskPhone,
  SAFE_MESSAGING_ERROR,
  templateName,
  watiPhone,
  WATI_TEMPLATES,
} from './wati'

describe('WATI constants', () => {
  it('provides safe user-facing messaging error string', () => {
    expect(SAFE_MESSAGING_ERROR).toBe('Messaging is temporarily unavailable. Please try again.')
  })

  it('defines required template mappings', () => {
    expect(WATI_TEMPLATES.SIGN_IN_CODE.fallback).toBe('jumpstart_signin_code')
    expect(Object.keys(WATI_TEMPLATES)).toEqual(['SIGN_IN_CODE'])
  })
})

describe('WATI phone normalization (watiPhone)', () => {
  it('normalizes 10-digit Indian numbers with or without leading zero or spaces', () => {
    expect(watiPhone('9822000001')).toBe('919822000001')
    expect(watiPhone('09822000001')).toBe('919822000001')
    expect(watiPhone('0 98220 00001')).toBe('919822000001')
    expect(watiPhone('+91 98220 00001')).toBe('919822000001')
    expect(watiPhone('+919822000001')).toBe('919822000001')
    expect(watiPhone('919822000001')).toBe('919822000001')
  })

  it('normalizes international numbers', () => {
    expect(watiPhone('+1 (415) 555-2671')).toBe('14155552671')
    expect(watiPhone('+44 20 7946 0958')).toBe('442079460958')
    expect(watiPhone('+65 9123 4567')).toBe('6591234567')
  })

  it('rejects invalid, short, non-numeric, or null numbers', () => {
    expect(watiPhone(null)).toBeNull()
    expect(watiPhone(undefined)).toBeNull()
    expect(watiPhone('')).toBeNull()
    expect(watiPhone('123')).toBeNull()
    expect(watiPhone('abcdefghij')).toBeNull()
    expect(watiPhone('0000000000')).toBeNull()
    expect(watiPhone('+')).toBeNull()
  })
})

describe('WATI logging phone mask (maskPhone)', () => {
  it('masks phone numbers preserving country prefix and last 4 digits', () => {
    expect(maskPhone('919822000001')).toBe('9198****0001')
    expect(maskPhone('14155552671')).toBe('1415****2671')
  })

  it('masks short numbers completely', () => {
    expect(maskPhone('12345')).toBe('****')
    expect(maskPhone('')).toBe('****')
  })
})

describe('WATI template resolution (templateName)', () => {
  it('reads configured env variables with fallbacks', () => {
    expect(templateName('SIGN_IN_CODE', (n) => (n === 'WATI_TEMPLATE_SIGNIN_CODE' ? 'custom_signin_template' : undefined))).toBe('custom_signin_template')
    expect(templateName('SIGN_IN_CODE', (n) => (n === 'WATI_TEMPLATE_SIGNIN' ? ' legacy ' : undefined))).toBe('legacy')
  })

  it('falls back to the default template name if env is empty', () => {
    expect(templateName('SIGN_IN_CODE', () => undefined)).toBe('jumpstart_signin_code')
  })
})

describe('WATI client (createWati)', () => {
  const dummySleep = vi.fn(async () => {})

  it('fails with not_configured if token is missing', async () => {
    const mockFetch = vi.fn()
    const wati = createWati({
      token: '',
      fetch: mockFetch as unknown as typeof fetch,
      sleep: dummySleep,
    })

    const res = await wati.sendTemplate({
      phone: '9822000001',
      template: 'jumpstart_signin_code',
      params: ['123456'],
    })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.category).toBe('not_configured')
      expect(res.retryable).toBe(false)
    }
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('validates recipient phone and rejects invalid recipient without network call', async () => {
    const mockFetch = vi.fn()
    const wati = createWati({
      token: 'test_token',
      fetch: mockFetch as unknown as typeof fetch,
      sleep: dummySleep,
    })

    const res = await wati.sendTemplate({
      phone: 'invalid',
      template: 'jumpstart_signin_code',
      params: ['123456'],
    })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.category).toBe('invalid_recipient')
    }
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sends template message with Authorization Bearer header and returns broadcastId', async () => {
    let capturedUrl = ''
    let capturedOptions: RequestInit | undefined

    const mockFetch = vi.fn(async (url: string | URL | Request, opts?: RequestInit) => {
      capturedUrl = String(url)
      capturedOptions = opts
      return new Response(
        JSON.stringify({
          success: true,
          broadcast_id: 'bc_12345',
          recipients: [{ phone_number: '919822000001', errors: [] }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    })

    const wati = createWati({
      baseUrl: 'https://live-server-001.wati.io',
      token: 'secret_token_123',
      fetch: mockFetch as unknown as typeof fetch,
      sleep: dummySleep,
    })

    const res = await wati.sendTemplate({
      phone: '9822000001',
      template: 'jumpstart_signin_code',
      params: ['842190'],
      localMessageId: 'msg-local-1',
    })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.broadcastId).toBe('bc_12345')
      expect(res.localId).toBe('msg-local-1')
    }

    expect(capturedUrl).toBe('https://live-server-001.wati.io/api/ext/v3/messageTemplates/send')
    expect(capturedOptions?.method).toBe('POST')
    expect((capturedOptions?.headers as Record<string, string>)?.['Authorization']).toBe('Bearer secret_token_123')
    expect((capturedOptions?.headers as Record<string, string>)?.['Content-Type']).toBe('application/json')

    const body = JSON.parse(capturedOptions?.body as string)
    expect(body.template_name).toBe('jumpstart_signin_code')
    expect(body.recipients[0].phone_number).toBe('919822000001')
    expect(body.recipients[0].local_message_id).toBe('msg-local-1')
    expect(body.recipients[0].custom_params).toEqual([{ name: '1', value: '842190' }])
  })

  it('fails immediately on 401 Unauthorized without retrying', async () => {
    let callCount = 0
    const mockFetch = vi.fn(async () => {
      callCount++
      return new Response(JSON.stringify({ error: 'Invalid Token' }), { status: 401 })
    })

    const wati = createWati({
      token: 'bad_token',
      fetch: mockFetch as unknown as typeof fetch,
      sleep: dummySleep,
    })

    const res = await wati.sendTemplate({
      phone: '9822000001',
      template: 'jumpstart_signin_code',
      params: ['123456'],
    })

    expect(callCount).toBe(1)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.category).toBe('auth')
      expect(res.retryable).toBe(false)
    }
  })

  it('retries on 429 rate limit or 5xx up to MAX_ATTEMPTS then reports failure', async () => {
    let callCount = 0
    const mockFetch = vi.fn(async () => {
      callCount++
      return new Response(JSON.stringify({ error: 'Server busy' }), { status: 503 })
    })

    let simulatedTime = 1000
    const now = () => simulatedTime

    const wati = createWati({
      token: 'good_token',
      fetch: mockFetch as unknown as typeof fetch,
      sleep: async (ms) => {
        simulatedTime += ms
      },
      now,
    })

    const res = await wati.sendTemplate({
      phone: '9822000001',
      template: 'jumpstart_signin_code',
      params: ['123456'],
    })

    expect(callCount).toBe(3)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.category).toBe('unavailable')
      expect(res.retryable).toBe(true)
    }
  })

  it('listTemplates queries v3 endpoint and extracts names and approval statuses', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          templates: [
            { name: 'jumpstart_signin_code', status: 'APPROVED' },
            { name: 'jumpstart_invitation', status: 'PENDING' },
          ],
        }),
        { status: 200 }
      )
    })

    const wati = createWati({
      token: 'good_token',
      fetch: mockFetch as unknown as typeof fetch,
      sleep: dummySleep,
    })

    const res = await wati.listTemplates()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.templates).toEqual([
        { name: 'jumpstart_signin_code', status: 'APPROVED' },
        { name: 'jumpstart_invitation', status: 'PENDING' },
      ])
    }
  })

  const send = (c: ReturnType<typeof createWati>) => c.sendTemplate({ phone: '9822000001', template: 't', params: ['1'] })
  const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
  const client = (f: ReturnType<typeof vi.fn>, extra: Partial<Parameters<typeof createWati>[0]> = {}) =>
    createWati({ token: 'tok', fetch: f as unknown as typeof fetch, sleep: dummySleep, ...extra })

  it.each([
    ['success false', { success: false }],
    ['top-level error string', { success: true, error: 'Template not found' }],
    ['recipient success false', { success: true, recipients: [{ success: false }] }],
    ['recipient error string', { recipients: [{ error: 'Invalid number' }] }],
    ['recipient errors list', { recipients: [{ errors: ['bad'] }] }],
  ])('treats a 200 with %s as refused', async (_n, body) => {
    const res = await send(client(reply(body)))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.category).toBe('rejected')
  })

  it('accepts empty error fields', async () => {
    const res = await send(client(reply({ success: true, error: '', recipients: [{ error: null, errors: [] }] })))
    expect(res.ok).toBe(true)
  })

  it('omits channel from the body when it is not set, and sends it when set', async () => {
    const f = reply({ success: true })
    await send(client(f))
    await send(client(f, { channel: '+919000000000' }))
    const bodies = f.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string))
    expect('channel' in bodies[0]).toBe(false)
    expect(bodies[1].channel).toBe('+919000000000')
  })

  it('honours a short budget with one retry', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 503 }))
    const res = await send(client(f, { maxAttempts: 2, budgetMs: 3000, attemptTimeoutMs: 1200 }))
    expect(f).toHaveBeenCalledTimes(2)
    expect(res.ok).toBe(false)
  })

  it('pages through templates, upper-cases statuses and stops at a short page', async () => {
    const page = (n: number, status: string) => ({ templates: Array.from({ length: n }, (_, i) => ({ name: `t${status}${i}`, status })) })
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page(100, 'approved')), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page(1, 'Pending')), { status: 200 }))
    const res = await client(f).listTemplates()
    expect(f).toHaveBeenCalledTimes(2)
    expect(String(f.mock.calls[1]?.[0])).toContain('page_number=2')
    expect(res.ok && res.templates).toHaveLength(101)
    expect(res.ok && res.templates[0]?.status).toBe('APPROVED')
    expect(res.ok && res.templates[100]?.status).toBe('PENDING')
  })

  it('stops paging at the reported total and at ten pages', async () => {
    const full = () => new Response(JSON.stringify({ templates: Array.from({ length: 100 }, (_, i) => ({ name: `n${i}`, status: 'APPROVED' })), total: 100 }), { status: 200 })
    const a = vi.fn(async () => full())
    await client(a).listTemplates()
    expect(a).toHaveBeenCalledTimes(1)
    const b = vi.fn(async () => new Response(JSON.stringify({ templates: Array.from({ length: 100 }, (_, i) => ({ name: `n${i}`, status: 'APPROVED' })) }), { status: 200 }))
    await client(b).listTemplates()
    expect(b).toHaveBeenCalledTimes(10)
  })
})

describe('the endpoint and token as pasted from the WATI dashboard', () => {
  it('keeps only the host, since v3 paths never carry the account number', async () => {
    const { watiOrigin } = await import('./wati')
    expect(watiOrigin('https://live-mt-server.wati.io/123456')).toBe('https://live-mt-server.wati.io')
    expect(watiOrigin(' https://live-mt-server.wati.io/ ')).toBe('https://live-mt-server.wati.io')
    expect(watiOrigin('')).toBe('https://live-mt-server.wati.io')
    expect(watiOrigin('http://evil.example')).toBe('https://live-mt-server.wati.io')
  })
  it('sends one Bearer even when the token was pasted with it, to the v3 path on the host', async () => {
    const { createWati } = await import('./wati')
    const f = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ success: true, broadcast_id: 'b1' }), { status: 200 }))
    const w = createWati({ baseUrl: 'https://live-mt-server.wati.io/123456', token: 'Bearer abc.def', fetch: f as unknown as typeof fetch, sleep: async () => {} })
    const r = await w.sendTemplate({ phone: '+919820000001', template: 'jumpstart_signin_code', params: ['123456'] })
    expect(r.ok).toBe(true)
    expect(f.mock.calls[0]![0]).toBe('https://live-mt-server.wati.io/api/ext/v3/messageTemplates/send')
    expect((f.mock.calls[0]![1].headers as Record<string, string>).Authorization).toBe('Bearer abc.def')
  })
})
