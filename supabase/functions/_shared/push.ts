/** A notification claimed from the outbox, with one of the person's devices (public.push_claim). Web rows carry endpoint and keys, native rows a token. */
export interface Claimed {
  outbox_id: number
  title: string
  body: string
  url: string
  tag: string | null
  platform: 'web' | 'android' | 'ios'
  subscription_id: string | null
  endpoint: string | null
  p256dh: string | null
  auth: string | null
  token: string | null
  /** Proof for the device's receipt (0059): sent back by the service worker when it shows or opens the alert. */
  receipt: string
  /** When the alert stops being worth delivering (0059). */
  expires_at: string
}

/** How long the push service may hold a web alert for a phone that is off: 10 minutes for a trip, else an hour. */
export function webTtl(tag: string | null): number {
  return tag?.startsWith('trip-') ? 600 : 3600
}

/** Seconds the push service may still hold this alert: what is left before its expiry, never more than webTtl, at least 30. */
export function ttlFor(r: Pick<Claimed, 'tag' | 'expires_at'>, nowMs: number): number {
  const left = Math.floor((Date.parse(r.expires_at) - nowMs) / 1000)
  return Math.max(30, Math.min(webTtl(r.tag), Number.isFinite(left) ? left : webTtl(r.tag)))
}

/**
 * At most `limit` bad receipts (malformed or unknown) per caller per minute, counted in this function instance (each
 * instance has its own count, so this slows a flood rather than stopping it). Only failures count: if the platform's
 * proxy makes every device look like one caller, someone posting junk still cannot crowd out the devices' real receipts,
 * which are bounded by the alerts actually sent.
 */
export function receiptLimiter(limit = 60) {
  let minute = 0
  const counts = new Map<string, number>()
  const tick = (nowMs: number) => {
    const m = Math.floor(nowMs / 60_000)
    if (m !== minute) { minute = m; counts.clear() }
  }
  return {
    blocked(who: string, nowMs: number): boolean { tick(nowMs); return (counts.get(who) ?? 0) >= limit },
    failed(who: string, nowMs: number): void { tick(nowMs); counts.set(who, (counts.get(who) ?? 0) + 1) },
  }
}

/**
 * What the phone shows (public/push-sw.js reads it): short enough for a lock screen, a same-site link only, and a tag so
 * a newer alert about the same trip replaces the older one.
 */
/** A path on this site, or '/': one leading slash, and no backslash, whitespace or control character a browser would bend into another host. */
export const safePath = (u: string): string => (/^\/(?!\/)[^\\\s\u0000-\u001f]*$/.test(u) ? u : '/')

export function payloadFor(r: Pick<Claimed, 'outbox_id' | 'title' | 'body' | 'url' | 'tag' | 'receipt'>, receiptUrl?: string): string {
  const url = safePath(r.url)
  // id, receipt and where to send it: the service worker reports that the alert was displayed and opened.
  const ack = receiptUrl ? { id: r.outbox_id, receipt: r.receipt, ack: receiptUrl } : {}
  return JSON.stringify({ title: r.title.slice(0, 120), body: r.body.slice(0, 240), url, tag: r.tag ?? undefined, ...ack })
}

/**
 * A request body as text, or null once it passes `max` bytes or takes longer than `ms` (stops reading there, so a huge or
 * trickled body cannot hold the function open).
 */
export async function readCapped(req: Request, max: number, ms = 3000): Promise<string | null> {
  if (!req.body) return ''
  const reader = req.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms) })
  try {
    for (;;) {
      const chunk = await Promise.race([reader.read(), late])
      if (chunk === null || (!chunk.done && (size += chunk.value.byteLength) > max)) { void reader.cancel().catch(() => {}); return null }
      if (chunk.done) break
      parts.push(chunk.value)
    }
  } finally {
    clearTimeout(timer)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const p of parts) { all.set(p, at); at += p.byteLength }
  return new TextDecoder().decode(all)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A device's receipt (POST /push-send/receipt, sent as text so the browser needs no CORS preflight), or null when malformed. */
export function parseReceipt(text: string): { id: number; receipt: string; event: 'displayed' | 'opened' } | null {
  if (text.length > 300) return null
  let v: unknown
  try { v = JSON.parse(text) } catch { return null }
  if (typeof v !== 'object' || v === null) return null
  const { id, receipt, event } = v as Record<string, unknown>
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null
  if (typeof receipt !== 'string' || !UUID.test(receipt)) return null
  if (event !== 'displayed' && event !== 'opened') return null
  return { id, receipt, event }
}

/**
 * The FCM HTTP v1 message for a native phone. Android gets data only, so the app's own service wakes up, shows the alert
 * and speaks it even when the screen is off. iOS gets a normal alert (time-sensitive for the gate).
 */
export function fcmMessageFor(r: Pick<Claimed, 'outbox_id' | 'title' | 'body' | 'url' | 'tag' | 'platform' | 'token'> & Partial<Pick<Claimed, 'expires_at'>>, nowMs = Date.now()): { message: Record<string, unknown> } {
  const title = r.title.slice(0, 120)
  const body = r.body.slice(0, 240)
  const url = safePath(r.url)
  const tag = r.tag ?? ''
  const gate = tag.startsWith('trip-') || tag.startsWith('duty-')
  const data: Record<string, string> = { kind: gate ? 'gate' : 'info', tag, title, body, url, speak: gate ? `${title}. ${body}` : '', outbox_id: String(r.outbox_id) }
  if (r.platform === 'ios') {
    return {
      message: {
        token: r.token,
        data,
        apns: {
          headers: { 'apns-priority': '10', 'apns-push-type': 'alert', 'apns-collapse-id': tag.slice(0, 64) },
          payload: { aps: { alert: { title, body }, sound: 'default', 'interruption-level': gate ? 'time-sensitive' : 'active', 'thread-id': 'gate' } },
        },
      },
    }
  }
  return { message: { token: r.token, data, android: { priority: 'HIGH', ttl: `${r.expires_at ? ttlFor({ tag: r.tag, expires_at: r.expires_at }, nowMs) : webTtl(r.tag)}s`, collapse_key: tag } } }
}

export interface ServiceAccount { client_email: string; private_key: string; project_id: string }

const b64url = (b: ArrayBuffer | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...new Uint8Array(b))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

/** A signed RS256 JWT asking Google for a Firebase Cloud Messaging access token. */
export async function fcmAssertion(sa: ServiceAccount, nowSec: number): Promise<string> {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: nowSec, exp: nowSec + 3600 }))
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[A-Z ]+-----|\s/g, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claims}`))
  return `${head}.${claims}.${b64url(sig)}`
}

/** Did FCM say this token is dead (404, UNREGISTERED, or an invalid token)? Other errors are retried. */
export function fcmTokenGone(status: number, body: string): boolean {
  return status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(body)
}
