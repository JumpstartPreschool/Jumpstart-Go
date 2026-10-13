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
import { fcmAssertion, fcmMessageFor, fcmTokenGone, payloadFor, webTtl, type Claimed, type ServiceAccount } from '../_shared/push.ts'

const secret = Deno.env.get('PUSH_SECRET') ?? ''
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

// Phones with the native app go through Firebase Cloud Messaging. FCM_SERVICE_ACCOUNT is the Firebase service-account JSON;
// without it their rows are recorded 'skipped no fcm' (not an error, so not retried) and web delivery carries on.
const fcmSecret = Deno.env.get('FCM_SERVICE_ACCOUNT')
// A malformed secret must not take web delivery down with it: treat it as not set, and say so in the log.
const fcm: ServiceAccount | null = (() => {
  if (!fcmSecret) return null
  try {
    const sa = JSON.parse(fcmSecret) as ServiceAccount
    if (sa.client_email && sa.private_key && sa.project_id) return sa
  } catch { /* falls through */ }
  console.error('FCM_SERVICE_ACCOUNT is not a Firebase service-account JSON; native phones are skipped')
  return null
})()
let fcmToken: { value: string; until: number } | null = null

// A Google access token lasts an hour; keep it for 50 minutes.
async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  if (fcmToken && fcmToken.until > Date.now()) return fcmToken.value
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await fcmAssertion(sa, Math.floor(Date.now() / 1000)) }),
  })
  const j = (await res.json()) as { access_token?: string }
  if (!res.ok || !j.access_token) throw new Error(`google token ${res.status}`)
  fcmToken = { value: j.access_token, until: Date.now() + 50 * 60_000 }
  return j.access_token
}

async function sendNative(r: Claimed, sa: ServiceAccount): Promise<'sent' | 'gone' | string> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await fcmAccessToken(sa)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fcmMessageFor(r)),
  })
  if (res.ok) return 'sent'
  const text = await res.text()
  if (res.status === 401) fcmToken = null
  if (fcmTokenGone(res.status, text)) {
    await db.rpc('push_forget_token', { p_token: r.token })
    return 'gone'
  }
  return `error ${res.status} ${text}`
}

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
      if (r.platform !== 'web') {
        if (!fcm) {
          await db.rpc('push_result', { p_outbox: r.outbox_id, p_result: 'skipped no fcm' })
          return
        }
        try {
          const result = await sendNative(r, fcm)
          if (result === 'sent') sent += 1
          else if (result === 'gone') gone += 1
          await db.rpc('push_result', { p_outbox: r.outbox_id, p_result: result })
        } catch (e) {
          await db.rpc('push_result', { p_outbox: r.outbox_id, p_result: `error ${String((e as Error).message ?? e)}`.slice(0, 200) })
        }
        return
      }
      try {
        await webpush.sendNotification({ endpoint: r.endpoint!, keys: { p256dh: r.p256dh!, auth: r.auth! } }, payloadFor(r), { TTL: webTtl(r.tag), urgency: 'high', topic: r.tag?.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '_') })
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
