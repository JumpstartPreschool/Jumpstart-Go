// WATI (WhatsApp Business) client for the sign-in code and invitations. Pure: no Deno globals and no npm imports, so
// it is typechecked and tested like the rest of _shared. Callers inject fetch and sleep.
//
// WATI v3 answers 200 as soon as it ACCEPTS a message; delivery is reported later by the webhook (wati-webhook).
// Errors never carry the token, the phone number or a one-time code, so callers may log or return them.

export const WATI_TEMPLATES = {
  // 1 = the 6-digit code
  SIGN_IN_CODE: { env: 'WATI_TEMPLATE_SIGNIN', fallback: 'jumpstart_signin_code', params: ['1'] },
  // 1 = first name, 2 = children, 3 = app link
  FAMILY_INVITATION: { env: 'WATI_TEMPLATE_INVITATION', fallback: 'jumpstart_invitation', params: ['1', '2', '3'] },
  // 1 = first name, 2 = role, 3 = app link
  STAFF_INVITATION: { env: 'WATI_TEMPLATE_STAFF_INVITATION', fallback: 'jumpstart_staff_invitation', params: ['1', '2', '3'] },
} as const
export type TemplateKey = keyof typeof WATI_TEMPLATES

/** The template's name on WATI: the secret when set (so a renamed template needs no deploy), else the default. */
export function templateName(key: TemplateKey, env: (name: string) => string | undefined): string {
  const t = WATI_TEMPLATES[key]
  return env(t.env)?.trim() || t.fallback
}

/**
 * The number as WATI wants it: digits, country code first, no '+'. Same rules as the database: spaces, dashes, dots and
 * brackets are dropped, a missing '+' is assumed, and a bare 10-digit number is Indian (+91). Null when it can't be a
 * phone number (E.164 is 8 to 15 digits).
 */
export function watiPhone(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null
  const cleaned = input.replace(/[\s\-().]/g, '')
  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned
  if (!/^[0-9]+$/.test(digits)) return null
  const full = !cleaned.startsWith('+') && digits.length === 10 ? `91${digits}` : digits
  return /^[1-9][0-9]{7,14}$/.test(full) ? full : null
}

export type WatiFailure = 'not_configured' | 'auth' | 'forbidden' | 'bad_request' | 'rejected' | 'rate_limited' | 'unavailable' | 'timeout'
export type SendResult = { ok: true; broadcastId: string | null } | { ok: false; category: WatiFailure; retryable: boolean }
export type TemplatesResult = { ok: true; templates: Array<{ name: string; status: string }> } | { ok: false; category: WatiFailure; retryable: boolean }

/** One row of the delivery log (app.whatsapp_log). Never holds a code. */
export interface WhatsAppLogRow {
  profileId: string | null
  /** Digits without '+', as WATI takes it. */
  phone: string
  kind: 'signin_code' | 'invitation' | 'staff_invitation'
  template: string
  localId: string
  broadcastId: string | null
  status: 'accepted' | 'failed_to_send'
  error: string | null
}

export interface Wati {
  sendTemplate(a: { phone: string; template: string; params: string[]; localMessageId: string; broadcastName: string }): Promise<SendResult>
  listTemplates(): Promise<TemplatesResult>
}

export interface WatiOptions {
  baseUrl?: string
  token?: string
  /** The WhatsApp number to send from when the account has several; null otherwise. */
  channel?: string | null
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  /** Clock for the time budget; Date.now by default. */
  now?: () => number
  /** Longest one request may take; the remaining budget caps it further. */
  attemptTimeoutMs?: number
}

const DEFAULT_BASE_URL = 'https://live-mt-server.wati.io'
const MAX_ATTEMPTS = 3
const BACKOFF_MS = [300, 900]
const RETRY_AFTER_CAP_MS = 2000
// The Supabase Auth hook must answer within about 5 s, so every call, retries included, stays under this.
const BUDGET_MS = 4500

type Failure = { ok: false; category: WatiFailure; retryable: boolean }
type Call = { ok: true; json: unknown } | Failure

const fail = (category: WatiFailure, retryable = false): Failure => ({ ok: false, category, retryable })

function statusFailure(status: number): Failure {
  if (status === 401) return fail('auth')
  if (status === 403) return fail('forbidden')
  if (status === 429) return fail('rate_limited', true)
  if (status >= 500) return fail('unavailable', true)
  return fail('bad_request')
}

class TimedOut extends Error {}

export function createWati(opts: WatiOptions): Wati {
  const base = (opts.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const token = opts.token?.trim() ?? ''
  const now = opts.now ?? Date.now
  const attemptMs = opts.attemptTimeoutMs ?? 1500

  async function once(method: string, path: string, body: unknown, ms: number): Promise<Response> {
    const ctl = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { ctl.abort(); reject(new TimedOut()) }, ms) })
    try {
      return await Promise.race([
        opts.fetch(`${base}${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: ctl.signal,
        }),
        timeout,
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  /** Up to 3 tries inside the budget; only timeouts, network errors, 5xx and 429 are tried again, with the same body. */
  async function call(method: string, path: string, body?: unknown): Promise<Call> {
    if (!token) return fail('not_configured')
    const start = now()
    let last: Failure = fail('timeout', true)
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const left = BUDGET_MS - (now() - start)
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
      if (!last.retryable || attempt === MAX_ATTEMPTS || now() - start + wait >= BUDGET_MS) return last
      await opts.sleep(wait)
    }
    return last
  }

  return {
    async sendTemplate({ phone, template, params, localMessageId, broadcastName }) {
      const r = await call('POST', '/api/ext/v3/messageTemplates/send', {
        channel: opts.channel || null,
        template_name: template,
        broadcast_name: broadcastName,
        recipients: [{
          phone_number: phone,
          local_message_id: localMessageId,
          custom_params: params.map((value, i) => ({ name: String(i + 1), value })),
        }],
      })
      if (!r.ok) return r
      const j = (r.json ?? {}) as { success?: unknown; ok?: unknown; broadcast_id?: unknown; recipients?: unknown }
      const refused = Array.isArray(j.recipients) && j.recipients.some((x) => {
        const errors = (x as { errors?: unknown }).errors
        return Array.isArray(errors) && errors.length > 0
      })
      if (j.success === false || j.ok === false || refused) return fail('rejected')
      return { ok: true, broadcastId: typeof j.broadcast_id === 'string' ? j.broadcast_id : null }
    },

    async listTemplates() {
      const r = await call('GET', '/api/ext/v3/messageTemplates?page_number=1&page_size=100')
      if (!r.ok) return r
      const list = (r.json as { templates?: unknown } | null)?.templates
      const templates = (Array.isArray(list) ? list : []).flatMap((t) => {
        const x = t as { name?: unknown; status?: unknown }
        return typeof x.name === 'string' ? [{ name: x.name, status: typeof x.status === 'string' ? x.status : '' }] : []
      })
      return { ok: true, templates }
    },
  }
}
