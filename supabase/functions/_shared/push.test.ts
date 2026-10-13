import { describe, expect, it } from 'vitest'
import { fcmAssertion, fcmMessageFor, fcmTokenGone, payloadFor, webTtl } from './push'

describe('push payload', () => {
  it('keeps links inside the app and trims for the lock screen', () => {
    expect(JSON.parse(payloadFor({ title: 'Kabir is ready at the gate', body: 'Ready at 4:15 PM.', url: '/parent', tag: 'trip-1' }))).toEqual({ title: 'Kabir is ready at the gate', body: 'Ready at 4:15 PM.', url: '/parent', tag: 'trip-1' })
    expect(JSON.parse(payloadFor({ title: 't', body: 'b', url: 'https://evil.example', tag: null })).url).toBe('/')
    expect(JSON.parse(payloadFor({ title: 't', body: 'b', url: '//evil.example', tag: null })).url).toBe('/')
    expect(JSON.parse(payloadFor({ title: 'x'.repeat(200), body: 'y'.repeat(400), url: '/', tag: null })).body).toHaveLength(240)
  })
})

describe('push TTL', () => {
  it('lets a trip alert wait 10 minutes and everything else an hour', () => {
    expect(webTtl('trip-1')).toBe(600)
    expect(webTtl('duty-1')).toBe(3600)
    expect(webTtl('ann-1')).toBe(3600)
    expect(webTtl(null)).toBe(3600)
  })
})

describe('FCM message', () => {
  const row = { outbox_id: 7, title: 'Reminder: Arnav, pickup at 4:15 PM', body: 'Meera is on the way.', url: '/coordinator', tag: 'trip-abc', platform: 'android' as const, token: 'tok' }
  it('is data only on Android, with the sentence to speak and a short life for a trip', () => {
    const m = fcmMessageFor(row).message
    expect(m.notification).toBeUndefined()
    expect(m.token).toBe('tok')
    expect(m.data).toEqual({ kind: 'gate', tag: 'trip-abc', title: row.title, body: row.body, url: '/coordinator', speak: 'Reminder: Arnav, pickup at 4:15 PM. Meera is on the way.', outbox_id: '7' })
    expect(m.android).toEqual({ priority: 'HIGH', ttl: '600s', collapse_key: 'trip-abc' })
    expect(Object.values(m.data as Record<string, unknown>).every((v) => typeof v === 'string')).toBe(true)
  })
  it('treats duty alerts as gate news and anything else as info with an hour to live', () => {
    expect((fcmMessageFor({ ...row, tag: 'duty-1' }).message.data as { kind: string }).kind).toBe('gate')
    const info = fcmMessageFor({ ...row, tag: 'ann-1' }).message
    expect((info.data as { kind: string; speak: string })).toMatchObject({ kind: 'info', speak: '' })
    expect((info.android as { ttl: string }).ttl).toBe('3600s')
  })
  it('keeps links inside the app', () => {
    expect((fcmMessageFor({ ...row, url: 'https://evil.example' }).message.data as { url: string }).url).toBe('/')
  })
  it('asks iOS for a time-sensitive alert', () => {
    const m = fcmMessageFor({ ...row, platform: 'ios' }).message as { apns: { headers: Record<string, string>; payload: { aps: Record<string, unknown> } }; android?: unknown }
    expect(m.android).toBeUndefined()
    expect(m.apns.headers).toEqual({ 'apns-priority': '10', 'apns-push-type': 'alert', 'apns-collapse-id': 'trip-abc' })
    expect(m.apns.payload.aps).toEqual({ alert: { title: row.title, body: row.body }, sound: 'default', 'interruption-level': 'time-sensitive', 'thread-id': 'gate' })
  })
})

describe('FCM sign-in', () => {
  it('signs a JWT Google can verify with the service account key', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
    const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`
    const jwt = await fcmAssertion({ client_email: 'push@proj.iam.gserviceaccount.com', private_key: pem, project_id: 'proj' }, 1000)
    const [h, c, sig] = jwt.split('.') as [string, string, string]
    expect(JSON.parse(atob(h))).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(atob(c))).toEqual({ iss: 'push@proj.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: 1000, exp: 4600 })
    const raw = Uint8Array.from(atob(sig.replaceAll('-', '+').replaceAll('_', '/')), (ch) => ch.charCodeAt(0))
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, raw, new TextEncoder().encode(`${h}.${c}`))).toBe(true)
  })
  it('forgets only tokens FCM says are dead', () => {
    expect(fcmTokenGone(404, '')).toBe(true)
    expect(fcmTokenGone(400, '{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}')).toBe(true)
    expect(fcmTokenGone(503, 'unavailable')).toBe(false)
  })
})
