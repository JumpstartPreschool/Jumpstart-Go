// Emails an invitation (D36) through Brevo's transactional API, then records it. Called by the admin's app with their
// sign-in; the database checks it's the admin, that the person can be invited, and the rate limit (invite_details, 0020).
// Deploy: npx supabase functions deploy invite-send
// Secrets: BREVO_API_KEY (Brevo → SMTP & API → API keys), INVITE_FROM (optional, default ai@jumpstartpreschool.in),
// APP_ORIGIN (optional: the app's https origin, the only site allowed to call this; the same one `route` uses).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { inviteEmail, type InviteDetails } from '../_shared/invite.ts'

// Read on every request, so a newly saved key or sender takes effect at once.
const brevoKey = () => (Deno.env.get('BREVO_API_KEY') ?? '').trim()
const sender = () => Deno.env.get('INVITE_FROM') ?? 'ai@jumpstartpreschool.in'
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  Vary: 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** What the admin can do about a refused email, in words. Brevo's message is only read for the words "IP", never logged. */
function brevoProblem(status: number, code: string, message: string): string {
  const from = sender()
  if (status === 401 && /\bip\b/i.test(message)) {
    return 'Brevo is blocking our server by its IP address. In Brevo, open Security → Authorised IPs and turn off "Block unknown IP addresses" for the API (Supabase sends from changing addresses).'
  }
  if (status === 401 || code === 'unauthorized') {
    return 'Brevo didn\'t accept the API key. Create a new API key in Brevo (SMTP & API → API Keys; it starts with xkeysib-, not xsmtpsib-) and save it again.'
  }
  if (code === 'permission_denied' || status === 403) return "Brevo's account can't send yet: check that it's activated and the key has permission to send emails."
  if (code === 'invalid_parameter' || code === 'missing_parameter' || status === 400) {
    return `Brevo refused the sender ${from}. In Brevo, open Senders, Domains & Dedicated IPs → Senders and verify ${from}.`
  }
  if (status === 402 || code === 'not_enough_credits') return "Brevo's free daily email limit is used up. Try again tomorrow, or send it by WhatsApp or SMS now."
  if (status === 429) return 'Brevo is busy. Try again in a minute, or send it by WhatsApp or SMS now.'
  return "The email couldn't be sent. Try again in a minute, or send it by WhatsApp or SMS now."
}

// As the caller, so row-level security and the admin check apply exactly as in the app.
const clientFor = (auth: string) => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
  auth: { persistSession: false }, global: { headers: { Authorization: auth } },
})

const brevo = (path: string) => fetch(`https://api.brevo.com/v3/${path}`, { headers: { 'api-key': brevoKey(), Accept: 'application/json' } })

/**
 * Settings → Check email setup: asks Brevo, without sending anything, whether the key works, whether the sender is
 * verified, and how many emails are left today. Admin only.
 */
async function checkSetup(db: ReturnType<typeof clientFor>, auth: string) {
  const { data: who } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
  const { data: admin } = await db.from('staff_roles').select('role, profiles!inner(user_id)').eq('role', 'admin').eq('profiles.user_id', who.user?.id ?? '').limit(1)
  if (!admin?.length) return reply({ error: 'Only the admin can check this.' }, 403)
  if (!brevoKey()) return reply({ key: 'missing', message: 'No Brevo API key is saved yet.' })
  const account = await brevo('account')
  if (!account.ok) {
    const body = (await account.json().catch(() => ({}))) as { code?: unknown; message?: unknown }
    // For the admin only: Brevo's own reason, which names the problem but never contains the key.
    const reason = String(body.message ?? '').slice(0, 300)
    return reply({ key: 'refused', message: brevoProblem(account.status, String(body.code ?? ''), reason), detail: `Brevo says (${account.status}): ${reason || 'no reason given'}` })
  }
  const info = (await account.json()) as { plan?: Array<{ type?: string; credits?: number; creditsType?: string }> }
  const left = info.plan?.find((p) => p.creditsType === 'sendLimit')?.credits ?? null
  const senders = (await (await brevo('senders')).json().catch(() => ({}))) as { senders?: Array<{ email?: string; active?: boolean }> }
  const from = sender()
  const s = senders.senders?.find((x) => x.email?.toLowerCase() === from.toLowerCase())
  return reply({
    key: 'ok', from, emailsLeft: left,
    sender: s ? (s.active ? 'verified' : 'not_verified') : 'missing',
    message: !s ? `${from} isn't a sender in Brevo yet. Add and verify it under Senders, Domains & Dedicated IPs → Senders.`
      : !s.active ? `${from} is in Brevo but not verified yet. Open the verification email Brevo sent to it.`
      : `Email is ready. Invitations send from ${from}${left != null ? `; ${left} emails left today` : ''}.`,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405)
  const auth = req.headers.get('Authorization') ?? ''
  let body: { profile?: unknown; check?: unknown } = {}
  try { body = await req.json() } catch { /* checked below */ }
  const db = clientFor(auth)
  if (body.check === true) return checkSetup(db, auth)
  if (!brevoKey()) return reply({ error: 'Email invitations are not set up yet: save the Brevo API key first.' }, 503)
  const profile = body.profile
  if (typeof profile !== 'string' || !/^[0-9a-f-]{36}$/i.test(profile)) return reply({ error: 'Choose who to invite.' }, 400)
  const { data, error } = await db.rpc('invite_details', { p_profile: profile })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === 'P0001' ? 400 : 500
    return reply({ error: error.message.replace(/^[a-z_]+: /, ''), code: error.code }, status)
  }
  const d = data as InviteDetails
  if (!d.email) return reply({ error: `${d.full_name} has no email address.` }, 400)

  const mail = inviteEmail(d)
  const sent = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': brevoKey(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Jumpstart', email: sender() },
      to: [{ email: d.email, name: d.full_name }],
      subject: mail.subject, htmlContent: mail.html, textContent: mail.text,
      tags: ['invite'],
    }),
  })
  if (!sent.ok) {
    // Brevo's code says what to fix; only the status and code are logged, never its message (it can repeat the address).
    const failed = (await sent.json().catch(() => ({}))) as { code?: unknown; message?: unknown }
    const code = String(failed.code ?? '')
    console.error('brevo send failed', sent.status, code)
    return reply({ error: brevoProblem(sent.status, code, String(failed.message ?? '')), brevo: { status: sent.status, code } }, 502)
  }
  await db.rpc('mark_invited', { p_profile: profile, p_via: 'email' })
  return reply({ sent: true, to: d.email })
})
