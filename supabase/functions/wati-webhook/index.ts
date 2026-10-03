// WATI status webhook: records message statuses (sent, delivered, read, failed) into app.whatsapp_log.
// Deploy: npx supabase functions deploy wati-webhook --no-verify-jwt
// Secrets: WATI_WEBHOOK_SECRET
import { createClient } from 'npm:@supabase/supabase-js@2'

const env = (name: string) => Deno.env.get(name)

const db = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Use POST', { status: 405 })

  const url = new URL(req.url)
  const key = url.searchParams.get('key')
  const expectedKey = env('WATI_WEBHOOK_SECRET')

  if (!expectedKey || key !== expectedKey) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload = await req.json().catch(() => null)
  if (!payload || typeof payload !== 'object') {
    return new Response('Invalid body', { status: 400 })
  }

  const p = payload as Record<string, unknown>
  const localId =
    (typeof p.localMessageId === 'string' ? p.localMessageId : null) ||
    (typeof p.local_message_id === 'string' ? p.local_message_id : null) ||
    (typeof (p.message as Record<string, unknown>)?.localMessageId === 'string'
      ? ((p.message as Record<string, unknown>).localMessageId as string)
      : null)

  const eventType =
    (typeof p.eventType === 'string' ? p.eventType : '') ||
    (typeof p.event === 'string' ? p.event : '') ||
    (typeof p.status === 'string' ? p.status : '')

  const rawStatus = eventType.toLowerCase()
  let status: 'sent' | 'delivered' | 'read' | 'failed' | null = null

  if (rawStatus.includes('sent')) status = 'sent'
  else if (rawStatus.includes('deliver')) status = 'delivered'
  else if (rawStatus.includes('read')) status = 'read'
  else if (rawStatus.includes('fail') || rawStatus.includes('reject')) status = 'failed'

  const errorText =
    (typeof p.errorMessage === 'string' ? p.errorMessage : null) ||
    (typeof p.error === 'string' ? p.error : null) ||
    (typeof p.description === 'string' ? p.description : null)

  if (localId && status) {
    await db.rpc('whatsapp_log_status', {
      p_local_id: localId,
      p_status: status,
      p_error: errorText,
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
