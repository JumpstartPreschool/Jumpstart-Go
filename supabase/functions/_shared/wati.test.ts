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
    expect(WATI_TEMPLATES.FAMILY_INVITATION.fallback).toBe('jumpstart_invitation')
    expect(WATI_TEMPLATES.STAFF_INVITATION.fallback).toBe('jumpstart_staff_invitation')
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
    const envWithCustom = (name: string) => {
      if (name === 'WATI_TEMPLATE_SIGNIN_CODE') return 'custom_signin_template'
      if (name === 'WATI_TEMPLATE_FAMILY_INVITATION') return 'custom_family_invitation'
      return undefined
    }

    expect(templateName('SIGN_IN_CODE', envWithCustom)).toBe('custom_signin_template')
    expect(templateName('FAMILY_INVITATION', envWithCustom)).toBe('custom_family_invitation')
    expect(templateName('STAFF_INVITATION', envWithCustom)).toBe('jumpstart_staff_invitation')
    expect(templateName('PASSWORD_RESET', envWithCustom)).toBe('custom_signin_template')
  })

  it('falls back to default template names if env is empty', () => {
    const emptyEnv = () => undefined
    expect(templateName('SIGN_IN_CODE', emptyEnv)).toBe('jumpstart_signin_code')
    expect(templateName('PASSWORD_RESET', emptyEnv)).toBe('jumpstart_signin_code')
    expect(templateName('FAMILY_INVITATION', emptyEnv)).toBe('jumpstart_invitation')
    expect(templateName('STAFF_INVITATION', emptyEnv)).toBe('jumpstart_staff_invitation')
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
})
