// Emails an invitation (D36) through Brevo's transactional API, then records it. Called by the admin's app with their
// sign-in; the database checks it's the admin, that the person can be invited, and the rate limit (invite_details, 0020).
// Deploy: npx supabase functions deploy invite-send
// Secrets: BREVO_API_KEY (Brevo → SMTP & API → API keys), INVITE_FROM (optional, default ai@jumpstartpreschool.in),
// APP_ORIGIN (optional: the app's https origin, the only site allowed to call this; the same one `route` uses).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { inviteEmail, type InviteDetails } from '../_shared/invite.ts'

const BREVO_KEY = Deno.env.get('BREVO_API_KEY') ?? ''
const FROM = Deno.env.get('INVITE_FROM') ?? 'ai@jumpstartpreschool.in'
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  Vary: 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405)
  if (!BREVO_KEY) return reply({ error: 'Email invitations are not set up yet (BREVO_API_KEY).' }, 503)

  const auth = req.headers.get('Authorization') ?? ''
  let profile: unknown
  try { profile = (await req.json()).profile } catch { /* checked below */ }
  if (typeof profile !== 'string' || !/^[0-9a-f-]{36}$/i.test(profile)) return reply({ error: 'Choose who to invite.' }, 400)

  // As the caller, so row-level security and the admin check apply exactly as in the app.
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false }, global: { headers: { Authorization: auth } },
  })
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
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Jumpstart', email: FROM },
      to: [{ email: d.email, name: d.full_name }],
      subject: mail.subject, htmlContent: mail.html, textContent: mail.text,
      tags: ['invite'],
    }),
  })
  if (!sent.ok) {
    // Only the status is logged: Brevo's error text can repeat the recipient's address.
    console.error('brevo send failed', sent.status)
    return reply({ error: "The email couldn't be sent. Try again in a minute, or send the invitation by text or WhatsApp." }, 502)
  }
  await db.rpc('mark_invited', { p_profile: profile, p_via: 'email' })
  return reply({ sent: true, to: d.email })
})
