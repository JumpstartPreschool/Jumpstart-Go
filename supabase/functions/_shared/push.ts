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
}

/** How long the push service may hold a web alert for a phone that is off: 10 minutes for a trip, else an hour. */
export function webTtl(tag: string | null): number {
  return tag?.startsWith('trip-') ? 600 : 3600
}

/**
 * What the phone shows (public/push-sw.js reads it): short enough for a lock screen, a same-site link only, and a tag so
 * a newer alert about the same trip replaces the older one.
 */
export function payloadFor(r: Pick<Claimed, 'title' | 'body' | 'url' | 'tag'>): string {
  const url = r.url.startsWith('/') && !r.url.startsWith('//') ? r.url : '/'
  return JSON.stringify({ title: r.title.slice(0, 120), body: r.body.slice(0, 240), url, tag: r.tag ?? undefined })
}

/**
 * The FCM HTTP v1 message for a native phone. Android gets data only, so the app's own service wakes up, shows the alert
 * and speaks it even when the screen is off. iOS gets a normal alert (time-sensitive for the gate).
 */
export function fcmMessageFor(r: Pick<Claimed, 'outbox_id' | 'title' | 'body' | 'url' | 'tag' | 'platform' | 'token'>): { message: Record<string, unknown> } {
  const title = r.title.slice(0, 120)
  const body = r.body.slice(0, 240)
  const url = r.url.startsWith('/') && !r.url.startsWith('//') ? r.url : '/'
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
  return { message: { token: r.token, data, android: { priority: 'HIGH', ttl: tag.startsWith('trip-') ? '600s' : '3600s', collapse_key: tag } } }
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
