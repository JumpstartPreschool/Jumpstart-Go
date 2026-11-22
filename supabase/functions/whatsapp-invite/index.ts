// Admin → Settings → WhatsApp: checks the WATI connection, template approval, and recent delivery log.
// Sends nothing: the only message this app sends on WhatsApp is the sign-in code, from send-sms.
// Deploy: npx supabase functions deploy whatsapp-invite   (keeps JWT verification on; the caller must also be the admin)
// Secrets: WATI_API_TOKEN, WATI_API_BASE_URL (optional), WATI_CHANNEL (optional), WATI_TEMPLATE_SIGNIN_CODE or
// WATI_TEMPLATE_SIGNIN (optional), APP_ORIGIN (optional).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createWati, templateName, WATI_TEMPLATES, type TemplateKey } from '../_shared/wati.ts'

const env = (name: string) => Deno.env.get(name)

const cors = {
  'Access-Control-Allow-Origin': env('APP_ORIGIN') ?? '*',
  Vary: 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const caller = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  })

  // Check admin
  const { data: recent, error: recentError } = await caller.rpc('whatsapp_recent')
  if (recentError) {
    const status = recentError.code === '42501' ? 403 : 500
    return reply({ error: recentError.message ?? 'Only the admin can check WhatsApp setup.' }, status)
  }

  const token = env('WATI_API_TOKEN')?.trim()
  if (!token) {
    return reply({
      token: 'missing',
      templates: (Object.keys(WATI_TEMPLATES) as TemplateKey[]).map((key) => ({
        key,
        name: templateName(key, env),
        status: 'missing',
      })),
      recent,
      message: 'Set WATI_API_TOKEN in Supabase secrets to connect WhatsApp.',
    })
  }

  const wati = createWati({
    baseUrl: env('WATI_API_BASE_URL'),
    token,
    channel: env('WATI_CHANNEL') || null,
    fetch,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  })

  const listed = await wati.listTemplates()
  if (!listed.ok) {
    const tokenStatus =
      listed.category === 'auth' || listed.category === 'forbidden'
        ? 'rejected'
        : listed.category === 'unavailable' || listed.category === 'timeout'
        ? 'unreachable'
        : 'rejected'

    return reply({
      token: tokenStatus,
      templates: (Object.keys(WATI_TEMPLATES) as TemplateKey[]).map((key) => ({
        key,
        name: templateName(key, env),
        status: 'missing',
      })),
      recent,
      error: `WhatsApp connection failed (${listed.category}).`,
    })
  }

  const found = new Map(listed.templates.map((t) => [t.name.toLowerCase(), t.status]))
  const templates = (Object.keys(WATI_TEMPLATES) as TemplateKey[]).map((key) => {
    const name = templateName(key, env)
    const rawStatus = found.get(name.toLowerCase())?.toUpperCase()
    const status =
      rawStatus === 'APPROVED' ? 'APPROVED'
      : rawStatus === 'PENDING' ? 'PENDING'
      : rawStatus === 'REJECTED' ? 'REJECTED'
      : 'missing'
    return { key, name, status }
  })

  return reply({
    token: 'ok',
    templates,
    recent,
  })
})
