// Central WATI (WhatsApp Business API) client for Jumpstart Go.
// Pure TypeScript: no Deno globals or npm imports so it is fully testable in both Deno and Vitest.
//
// Security & Architecture:
// 1. Secrets (WATI_API_TOKEN, WATI_API_BASE_URL, etc.) are ONLY read server-side in Edge Functions.
// 2. Tokens are NEVER included in error messages, return objects, logs, or sent to client browsers.
// 3. Transient errors (5xx, 429, timeouts) use bounded retries; permanent errors (401, 403, 400, rejected) fail immediately.
// 4. WATI v3 answers 200 upon message ACCEPTANCE; final delivery statuses arrive via wati-webhook.

export const DEFAULT_WATI_BASE_URL = 'https://live-mt-server.wati.io'

/**
 * Message templates this app sends. Only the sign-in code goes out on WhatsApp (invitations are shared from the admin's
 * own phone), so it is the only template.
 *
 * Parameter definitions:
 * - SIGN_IN_CODE: 1 = verification code
 */
export const WATI_TEMPLATES = {
  SIGN_IN_CODE: {
    env: ['WATI_TEMPLATE_SIGNIN_CODE', 'WATI_TEMPLATE_SIGNIN'],
    fallback: 'jumpstart_signin_code',
    params: ['1'],
  },
} as const

export type TemplateKey = keyof typeof WATI_TEMPLATES

export const SAFE_MESSAGING_ERROR = 'Messaging is temporarily unavailable. Please try again.'

/** Resolves the configured template name from environment variables, or falls back to standard name. */
export function templateName(key: TemplateKey, env: (name: string) => string | undefined): string {
  const t = WATI_TEMPLATES[key]
  for (const envKey of t.env) {
    const val = env(envKey)?.trim()
    if (val) return val
  }
  return t.fallback
}

/**
 * Normalizes phone numbers to WATI recipient format (E.164 digits without '+').
 * Supports:
 * - 10-digit Indian numbers (e.g. '9822000001' or '09822000001' -> '919822000001')
 * - Numbers with country code (e.g. '+91 98220 00001' -> '919822000001')
 * - International numbers (e.g. '+1 (415) 555-2671' -> '14155552671')
 * Returns null if the number cannot be parsed to an 8-15 digit E.164 phone.
 */
export function watiPhone(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null

  const hasIntlPrefix = trimmed.startsWith('+') || trimmed.startsWith('00')
  let digits = trimmed.replace(/\D/g, '')

  if (hasIntlPrefix) {
    if (trimmed.startsWith('00')) digits = digits.slice(2)
    if (digits.startsWith('91')) {
      return /^91[6-9][0-9]{9}$/.test(digits) ? digits : null
    }
    return /^[1-9][0-9]{7,14}$/.test(digits) ? digits : null
  }

  // Without + or 00: treat as domestic / national number
  // Strip leading national trunk zeros (e.g. 09822000001 -> 9822000001)
  digits = digits.replace(/^0+/, '')

  // 12-digit Indian number entered without plus (e.g. 919822000001)
  if (digits.length === 12 && digits.startsWith('91') && /^91[6-9][0-9]{9}$/.test(digits)) {
    return digits
  }

  // 10-digit Indian mobile number
  if (/^[6-9][0-9]{9}$/.test(digits)) {
    return `91${digits}`
  }

  // General fallback for valid E.164 digits without plus (8-15 digits)
  return /^[1-9][0-9]{7,14}$/.test(digits) ? digits : null
}

/** Masks phone numbers for secure logging without exposing full identity (e.g. 9198****0001). */
export function maskPhone(phone: string): string {
  if (phone.length <= 6) return '****'
  return `${phone.slice(0, 4)}****${phone.slice(-4)}`
}

export type WatiFailure =
  | 'not_configured'
  | 'invalid_recipient'
  | 'invalid_template'
  | 'auth'
  | 'forbidden'
  | 'bad_request'
  | 'rejected'
  | 'rate_limited'
  | 'unavailable'
  | 'timeout'

export type SendResult =
  | { ok: true; broadcastId: string | null; localId: string }
  | { ok: false; category: WatiFailure; retryable: boolean; localId: string }

export type TemplatesResult =
  | { ok: true; templates: Array<{ name: string; status: string }> }
  | { ok: false; category: WatiFailure; retryable: boolean }

export interface WhatsAppLogRow {
  profileId: string | null
  phone: string
  kind: 'signin_code'
  template: string
  localId: string
  broadcastId: string | null
  status: 'accepted' | 'failed_to_send'
  error: string | null
}

export interface SendTemplateArgs {
  phone: string
  template: string
  params: string[]
  localMessageId?: string
  broadcastName?: string
}

export interface Wati {
  sendTemplate(args: SendTemplateArgs): Promise<SendResult>
  listTemplates(): Promise<TemplatesResult>
}

export interface WatiOptions {
  baseUrl?: string
  token?: string
  channel?: string | null
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  now?: () => number
  attemptTimeoutMs?: number
  /** Total time one call may take, retries included. Default 4500. */
  budgetMs?: number
  /** Most tries per call, the first included. Default 3. */
  maxAttempts?: number
}

const BACKOFF_MS = [300, 900]
const RETRY_AFTER_CAP_MS = 2000
const PAGE_SIZE = 100
const MAX_PAGES = 10

type Failure = { ok: false; category: WatiFailure; retryable: boolean }
type Call = { ok: true; json: unknown } | Failure

const fail = (category: WatiFailure, retryable = false): Failure => ({ ok: false, category, retryable })

function statusFailure(status: number): Failure {
  if (status === 401) return fail('auth', false)
  if (status === 403) return fail('forbidden', false)
  if (status === 429) return fail('rate_limited', true)
  if (status >= 500) return fail('unavailable', true)
  return fail('bad_request', false)
}

class TimedOut extends Error {}

/**
 * The API host only. WATI's dashboard shows the endpoint with the account number (https://live-mt-server.wati.io/123456),
 * which v1 and v2 need but v3 refuses: v3 paths start at the host. Anything that isn't an https URL uses the default.
 */
export function watiOrigin(input: string | undefined): string {
  try {
    const u = new URL((input ?? '').trim())
    return u.protocol === 'https:' ? u.origin : DEFAULT_WATI_BASE_URL
  } catch {
    return DEFAULT_WATI_BASE_URL
  }
}

export function createWati(opts: WatiOptions): Wati {
  const base = watiOrigin(opts.baseUrl)
  // WATI's dashboard shows the token as "Bearer eyJ…"; pasted whole, the header would say Bearer twice and get a 401.
  const token = (opts.token ?? '').trim().replace(/^bearer\s+/i, '')
  const now = opts.now ?? Date.now
  const attemptMs = opts.attemptTimeoutMs ?? 1500
  const budgetMs = opts.budgetMs ?? 4500
  const maxAttempts = opts.maxAttempts ?? 3

  async function once(method: string, path: string, body: unknown, ms: number): Promise<Response> {
    const ctl = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctl.abort()
        reject(new TimedOut())
      }, ms)
    })
    try {
      return await Promise.race([
        opts.fetch(`${base}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: ctl.signal,
        }),
        timeout,
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  async function call(method: string, path: string, body?: unknown): Promise<Call> {
    if (!token) return fail('not_configured', false)
    const start = now()
    let last: Failure = fail('timeout', true)

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const left = budgetMs - (now() - start)
      if (left <= 0) return last
      let wait = BACKOFF_MS[attempt - 1] ?? 0

      try {
        const res = await once(method, path, body, Math.min(attemptMs, left))
        if (res.ok) return { ok: true, json: await res.json().catch(() => null) }
        last = statusFailure(res.status)
        const header = res.headers.get('Retry-After')
        const after = Number(header)
        if (res.status === 429 && header !== null && Number.isFinite(after) && after >= 0) {
          wait = Math.min(after * 1000, RETRY_AFTER_CAP_MS)
        }
      } catch (e) {
        last = e instanceof TimedOut ? fail('timeout', true) : fail('unavailable', true)
      }

      if (!last.retryable || attempt === maxAttempts || now() - start + wait >= budgetMs) {
        return last
      }
      await opts.sleep(wait)
    }
    return last
  }

  return {
    async sendTemplate({ phone, template, params, localMessageId, broadcastName }) {
      const localId = localMessageId?.trim() || crypto.randomUUID()
      const normalizedPhone = watiPhone(phone)
      if (!normalizedPhone) {
        return { ok: false, category: 'invalid_recipient', retryable: false, localId }
      }
      if (!template?.trim()) {
        return { ok: false, category: 'invalid_template', retryable: false, localId }
      }

      const r = await call('POST', '/api/ext/v3/messageTemplates/send', {
        ...(opts.channel ? { channel: opts.channel } : {}),
        template_name: template.trim(),
        broadcast_name: broadcastName?.trim() || 'jumpstart_broadcast',
        recipients: [
          {
            phone_number: normalizedPhone,
            local_message_id: localId,
            custom_params: (params || []).map((value, i) => ({ name: String(i + 1), value: String(value) })),
          },
        ],
      })

      if (!r.ok) {
        return { ok: false, category: r.category, retryable: r.retryable, localId }
      }

      const j = (r.json ?? {}) as {
        success?: unknown
        ok?: unknown
        error?: unknown
        broadcast_id?: unknown
        recipients?: unknown
      }
      // WATI answers 200 with the refusal in the body: a false success, a top-level error, or a failed recipient.
      const set = (v: unknown) => v != null && v !== '' && v !== false
      const refused =
        j.success === false ||
        j.ok === false ||
        set(j.error) ||
        (Array.isArray(j.recipients) &&
          j.recipients.some((x) => {
            const rc = (x ?? {}) as { success?: unknown; error?: unknown; errors?: unknown }
            return rc.success === false || set(rc.error) || (Array.isArray(rc.errors) && rc.errors.length > 0)
          }))

      if (refused) {
        return { ok: false, category: 'rejected', retryable: false, localId }
      }

      return {
        ok: true,
        broadcastId: typeof j.broadcast_id === 'string' ? j.broadcast_id : null,
        localId,
      }
    },

    async listTemplates() {
      const templates: Array<{ name: string; status: string }> = []
      for (let page = 1; page <= MAX_PAGES; page++) {
        const r = await call('GET', `/api/ext/v3/messageTemplates?page_number=${page}&page_size=${PAGE_SIZE}`)
        if (!r.ok) return r
        const body = r.json as { templates?: unknown; total?: unknown } | null
        const list = Array.isArray(body?.templates) ? body.templates : []
        for (const t of list) {
          const x = t as { name?: unknown; status?: unknown }
          if (typeof x.name === 'string') {
            templates.push({ name: x.name, status: typeof x.status === 'string' ? x.status.toUpperCase() : '' })
          }
        }
        const total = typeof body?.total === 'number' ? body.total : null
        if (list.length < PAGE_SIZE || (total !== null && page * PAGE_SIZE >= total)) break
      }
      return { ok: true, templates }
    },
  }
}
