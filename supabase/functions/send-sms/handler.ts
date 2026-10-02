// Supabase Auth's "Send SMS" hook: Supabase makes and checks the 6-digit code, this sends it on WhatsApp. Kept free of
// Deno and npm imports so it can be tested; index.ts wires in the signature check, the database and WATI.
import type { Wati, WatiFailure, WhatsAppLogRow } from '../_shared/wati.ts'

export interface Deps {
  /** Checks the Standard Webhooks signature and returns the hook's payload, or throws when it is not genuine. */
  verify(rawBody: string, headers: Record<string, string>): unknown
  /** public.otp_recipient: the profile that may sign in with this number, or null. */
  otpRecipient(phone: string): Promise<string | null>
  wati: Pick<Wati, 'sendTemplate'>
  /** Adds a row to the delivery log. Never given the code. */
  log(row: WhatsAppLogRow): Promise<void>
  /** The sign-in code template's name on WATI. */
  template: string
  /** Makes the id WATI reports back on; crypto.randomUUID in production. */
  newId?: () => string
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const BUSY: ReadonlySet<WatiFailure> = new Set(['rate_limited', 'unavailable', 'timeout'])

/**
 * POST from Supabase Auth { user: { phone }, sms: { otp } }. A number nobody registered gets the same empty 200 as a
 * sent code and costs nothing, so the answer never shows who is registered. A failed send answers with the hook's error
 * envelope, which Auth shows the person as "couldn't send".
 */
export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  const raw = await req.text()
  let payload: { user?: { phone?: unknown }; sms?: { otp?: unknown } }
  try {
    payload = deps.verify(raw, Object.fromEntries(req.headers.entries())) as typeof payload
  } catch {
    return json({ error: 'unauthorized' }, 401)
  }
  const phone = payload?.user?.phone
  const otp = payload?.sms?.otp
  if (typeof phone !== 'string' || typeof otp !== 'string' || !otp) return json({ error: 'bad_request' }, 400)

  const profileId = await deps.otpRecipient(phone)
  if (!profileId) return json({})

  const localId = (deps.newId ?? (() => crypto.randomUUID()))()
  const digits = phone.replace(/^\+/, '')
  const sent = await deps.wati.sendTemplate({ phone: digits, template: deps.template, params: [otp], localMessageId: localId, broadcastName: 'signin_code' })
  const row: WhatsAppLogRow = {
    profileId, phone: digits, kind: 'signin_code', template: deps.template, localId,
    broadcastId: sent.ok ? sent.broadcastId : null,
    status: sent.ok ? 'accepted' : 'failed_to_send',
    error: sent.ok ? null : sent.category,
  }
  // A log that can't be written must not stop a code that was sent.
  await deps.log(row).catch(() => {})
  if (sent.ok) return json({})
  return json({ error: { http_code: BUSY.has(sent.category) ? 503 : 500, message: "Couldn't send the WhatsApp code right now." } }, 200)
}
