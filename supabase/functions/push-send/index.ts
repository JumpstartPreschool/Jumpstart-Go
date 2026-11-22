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
import { gateSettings } from '../_shared/gateAnnounce.ts'
import { phoneVoiceFor, type VoiceSources, type VoiceTrip } from '../_shared/phoneVoice.ts'
import { fcmAssertion, fcmMessageFor, fcmTokenGone, parseReceipt, payloadFor, readCapped, receiptLimiter, ttlFor, type Claimed, type PhoneVoice, type ServiceAccount } from '../_shared/push.ts'

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

// Where a device reports that an alert was displayed, opened (0059) or, in the Android app, spoken aloud (0060). No
// sign-in: the receipt id, which travels only inside that device's push, is the proof, and it can only mark that one alert.
const receiptUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/push-send/receipt`

const VOICE_BUCKET = 'voice-audio'
/**
 * What the phones in this run need to play the school's recordings: the voice version and gate settings read once, each
 * trip and each clip link once however many devices get it. A failed read means no recordings, never a lost alert: the
 * phone's own voice reads the title instead.
 */
async function voiceSources(): Promise<(VoiceSources & { newRound(): void }) | null> {
  const [meta, cfg] = await Promise.all([
    db.from('voice_meta').select('value').eq('key', 'voice').maybeSingle(),
    db.from('gate_announcement_settings').select('*').maybeSingle(),
  ])
  if (meta.error || cfg.error) { console.error('voice sources', meta.error?.message ?? cfg.error?.message); return null }
  const trips = new Map<string, Promise<VoiceTrip | null>>()
  const links = new Map<string, Promise<string | null>>()
  return {
    version: (meta.data as { value: string } | null)?.value ?? null,
    settings: gateSettings(cfg.data),
    trip(id) {
      if (!trips.has(id)) trips.set(id, (async () => {
        const { data, error } = await db.from('trips')
          .select('direction, arrive_at, off_schedule, traveller_relation, traveller_kind, arrived_at, late_at, children(full_name, preferred_name, programmes!children_programme_id_fkey(name), child_pronunciations(spoken_name))')
          .eq('id', id).maybeSingle()
        if (error || !data) return null
        type Row = Omit<VoiceTrip, 'child'> & { children: { full_name: string; preferred_name: string | null; programmes: { name: string } | null; child_pronunciations: { spoken_name: string | null } | null } | null }
        const { children: c, ...trip } = data as unknown as Row
        if (!c) return null
        // As the duty screen names the child (GateQueue), so the words, and so the clip's key, are the same.
        return { ...trip, child: { fullName: c.full_name, name: c.preferred_name ?? c.full_name.split(' ')[0]!, programmeName: c.programmes?.name ?? '', spoken: c.child_pronunciations?.spoken_name ?? null } }
      })())
      return trips.get(id)!
    },
    sign(path, seconds) {
      // By lifetime too, rounded up to the minute: each alert's link lasts about as long as that alert, and its devices
      // (each working the seconds out a moment apart) share one link.
      const life = Math.ceil(seconds / 60) * 60
      const key = `${path}@${life}`
      if (!links.has(key)) links.set(key, db.storage.from(VOICE_BUCKET).createSignedUrl(path, life).then(({ data }) => data?.signedUrl ?? null, () => null))
      return links.get(key)!
    },
    // Each claimed batch reads its trips afresh: a later batch may hold the alerts a trip change (arrived, running late) made.
    newRound() { trips.clear() },
  }
}

async function sendNative(r: Claimed, sa: ServiceAccount, voice: PhoneVoice | null): Promise<'sent' | 'gone' | string> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await fcmAccessToken(sa)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fcmMessageFor(r, Date.now(), voice, receiptUrl)),
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

const receipts = receiptLimiter()

async function receipt(req: Request): Promise<Response> {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type' }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return new Response(null, { status: 405, headers })
  // The address the platform's own proxy saw (the last x-forwarded-for hop), not one the caller wrote first.
  const who = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'unknown'
  // Checked before the body is read, so a caller sending junk is turned away at once.
  if (receipts.blocked(who, Date.now())) return new Response(null, { status: 429, headers })
  const bad = (status: number) => { receipts.failed(who, Date.now()); return new Response(null, { status, headers }) }
  // A stated length over 1 KB is refused unread. A proxy may forward the body without a length, so it is read up to 1 KB
  // and for at most 3 seconds.
  if (Number(req.headers.get('content-length')) > 1000) return bad(413)
  const body = await readCapped(req, 1000)
  if (body === null) return bad(413)
  const r = parseReceipt(body)
  if (!r) return bad(400)
  const { data, error } = await db.rpc('push_receipt', { p_outbox: r.id, p_receipt: r.receipt, p_event: r.event })
  if (error) console.error('push_receipt', error.message)
  if (!error && !data) return bad(404)
  return new Response(null, { status: error ? 500 : 204, headers })
}

Deno.serve(async (req) => {
  if (new URL(req.url).pathname.endsWith('/receipt')) return receipt(req)
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 })
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!vapidPublic || !vapidPrivate) return new Response(JSON.stringify({ error: 'push not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ai@jumpstartpreschool.in', vapidPublic, vapidPrivate)
  let sent = 0
  let gone = 0
  // Read on the first phone row only: a run with web devices alone never touches the voice tables.
  let voices: Promise<(VoiceSources & { newRound(): void }) | null> | undefined
  // A few batches at most per call; the minute job picks up anything left.
  for (let round = 0; round < 5; round++) {
    const { data, error } = await db.rpc('push_claim', { p_limit: 100 })
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    const rows = (data ?? []) as Claimed[]
    if (!rows.length) break
    if (voices) (await voices)?.newRound()
    await Promise.all(rows.map(async (r) => {
      if (r.platform !== 'web') {
        if (!fcm) {
          await db.rpc('push_result', { p_outbox: r.outbox_id, p_result: 'skipped no fcm' })
          return
        }
        try {
          voices ??= voiceSources().catch(() => null)
          const src = await voices
          const voice = src ? await phoneVoiceFor(r, src, Date.now()).catch((e) => { console.error('phone voice', (e as Error).message); return null }) : null
          const result = await sendNative(r, fcm, voice)
          if (result === 'sent') sent += 1
          else if (result === 'gone') gone += 1
          await db.rpc('push_result', { p_outbox: r.outbox_id, p_result: result })
        } catch (e) {
          await db.rpc('push_result', { p_outbox: r.outbox_id, p_result: `error ${String((e as Error).message ?? e)}`.slice(0, 200) })
        }
        return
      }
      try {
        await webpush.sendNotification({ endpoint: r.endpoint!, keys: { p256dh: r.p256dh!, auth: r.auth! } }, payloadFor(r, receiptUrl), { TTL: ttlFor(r, Date.now()), urgency: 'high', topic: r.tag?.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '_') })
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
