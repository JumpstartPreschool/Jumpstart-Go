// WATI status webhook logic, free of Deno and npm imports so it can be tested; wati-webhook/index.ts wires in the secret
// and the database.
//
// WATI webhooks are unsigned, so the shared secret rides in the URL WATI is configured to call:
//   https://<project>.supabase.co/functions/v1/wati-webhook?key=<WATI_WEBHOOK_SECRET>
// (query parameter `key`). The function compares it in constant time and never logs the URL.

export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed'

// WATI v3 message events, lower-cased. Anything else (incoming messages, template changes, ...) is ignored.
const EVENTS: Record<string, MessageStatus> = {
  templatemessagesent_v2: 'sent',
  sessionmessagesent_v2: 'sent',
  sentmessagedelivered_v2: 'delivered',
  sentmessageread_v2: 'read',
  // The same events from webhooks set up with WATI's older (non-v2) event choices.
  templatemessagesent: 'sent',
  sessionmessagesent: 'sent',
  sentmessagedelivered: 'delivered',
  sentmessageread: 'read',
  templatemessagefailed: 'failed',
  sessionmessagefailed: 'failed',
}

export function statusFor(eventType: unknown): MessageStatus | null {
  return typeof eventType === 'string' ? (EVENTS[eventType.toLowerCase()] ?? null) : null
}

/** The id this app gave WATI when it sent the message (local_message_id), wherever the payload carries it. */
export function localIdOf(p: Record<string, unknown>): string | null {
  const nested = (p.message as Record<string, unknown> | null | undefined)?.localMessageId
  for (const v of [p.localMessageId, p.local_message_id, nested]) if (typeof v === 'string' && v) return v
  return null
}

/** WATI's failure reason as a short string for the log: text only, at most 100 characters, with phone numbers removed. */
export function failureText(p: Record<string, unknown>): string | null {
  for (const v of [p.failedDetail, p.failedCode]) {
    if (typeof v === 'string' && v.trim()) return v.trim().replace(/\+?\d[\d\s-]{5,}\d/g, '[number]').slice(0, 100)
  }
  return null
}

/** Compares the SHA-256 digests of both values byte by byte without stopping at the first difference. */
export async function secretMatches(given: string | null, expected: string): Promise<boolean> {
  const hash = async (v: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))
  const [a, b] = await Promise.all([hash(given ?? ''), hash(expected)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return given !== null && expected !== '' && diff === 0
}

export interface WebhookDeps {
  secret: string | undefined
  /** public.whatsapp_log_status: false when the id is unknown; throws when the database fails. */
  record(localId: string, status: MessageStatus, error: string | null): Promise<boolean>
}

const reply = (status: number, body: string) => new Response(body, { status })

/**
 * Answers 200 once the event is recorded or is one we do not track, 401 for a wrong secret, and 503 when the database
 * fails so WATI retries. An unknown local id also answers 200: every message this app sends is logged before WATI is
 * called, so an unknown id is a message sent some other way, and a retry could never find it.
 */
export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== 'POST') return reply(405, 'Use POST')
  if (!deps.secret || !(await secretMatches(new URL(req.url).searchParams.get('key'), deps.secret))) return reply(401, 'Unauthorized')

  const payload = await req.json().catch(() => null)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return reply(400, 'Invalid body')
  const p = payload as Record<string, unknown>

  const status = statusFor(p.eventType)
  const localId = localIdOf(p)
  if (status && localId) {
    try {
      await deps.record(localId, status, status === 'failed' ? failureText(p) : null)
    } catch {
      console.error(JSON.stringify({ webhook: 'record_failed' }))
      return reply(503, 'Try again')
    }
  }
  return reply(200, JSON.stringify({ ok: true }))
}
