// Delivers queued push notifications (0016): claims a batch from the outbox, sends each to the person's devices, and
// forgets devices the push service says are gone. Called by the database (pg_net, and a once-a-minute job) with a secret.
// Deploy: npx supabase functions deploy push-send --no-verify-jwt
// Secrets: PUSH_SECRET (the same as app.push_config.secret), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:).
//   Make the pair with `node scripts/vapid-keys.mjs`; the app build needs the public half as VITE_VAPID_PUBLIC_KEY.
//   npx supabase secrets set PUSH_SECRET=... VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...
// Invoked by the database with `Authorization: Bearer <PUSH_SECRET>`: the kick_push trigger (0016, pg_net) and the minute
// 'push-flush' job read the url and secret from the one row in app.push_config:
//   insert into app.push_config (url, secret) values ('https://<ref>.supabase.co/functions/v1/push-send', '<PUSH_SECRET>');
// Without the VAPID secrets it answers 503 and leaves the queue untouched, so nothing is lost or marked sent.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { payloadFor, type Claimed } from '../_shared/push.ts'

const secret = Deno.env.get('PUSH_SECRET') ?? ''
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(async (req) => {
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 })
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!vapidPublic || !vapidPrivate) return new Response(JSON.stringify({ error: 'push not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ai@jumpstartpreschool.in', vapidPublic, vapidPrivate)
  let sent = 0
  let gone = 0
  // A few batches at most per call; the minute job picks up anything left.
  for (let round = 0; round < 5; round++) {
    const { data, error } = await db.rpc('push_claim', { p_limit: 100 })
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    const rows = (data ?? []) as Claimed[]
    if (!rows.length) break
    await Promise.all(rows.map(async (r) => {
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payloadFor(r), { TTL: 3600, urgency: 'high', topic: r.tag?.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '_') })
        sent += 1
        await db.rpc('push_result', { p_outbox: r.outbox_id, p_result: 'sent' })
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        const dead = status === 404 || status === 410
        if (dead) gone += 1
        await db.rpc('push_result', { p_outbox: r.outbox_id, p_result: dead ? 'gone' : `error ${status ?? ''} ${String((e as Error).message ?? e)}`.slice(0, 200), p_gone: dead ? r.subscription_id : null })
      }
    }))
  }
  return new Response(JSON.stringify({ sent, gone }), { headers: { 'Content-Type': 'application/json' } })
})
