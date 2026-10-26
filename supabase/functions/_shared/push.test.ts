import { describe, expect, it } from 'vitest'
import { fcmAssertion, fcmMessageFor, fcmTokenGone, parseReceipt, payloadFor, readCapped, receiptLimiter, safePath, ttlFor, webTtl } from './push'

describe('push payload', () => {
  const r = { outbox_id: 7, receipt: '6f1c2a0e-3b4d-4c5e-8f9a-0b1c2d3e4f50' }
  it('keeps links inside the app and trims for the lock screen', () => {
    expect(JSON.parse(payloadFor({ ...r, title: 'Kabir is ready at the gate', body: 'Ready at 4:15 PM.', url: '/parent', tag: 'trip-1' }))).toEqual({ title: 'Kabir is ready at the gate', body: 'Ready at 4:15 PM.', url: '/parent', tag: 'trip-1' })
    expect(JSON.parse(payloadFor({ ...r, title: 't', body: 'b', url: 'https://evil.example', tag: null })).url).toBe('/')
    expect(JSON.parse(payloadFor({ ...r, title: 't', body: 'b', url: '//evil.example', tag: null })).url).toBe('/')
    expect(JSON.parse(payloadFor({ ...r, title: 'x'.repeat(200), body: 'y'.repeat(400), url: '/', tag: null })).body).toHaveLength(240)
  })

  it('carries the receipt only when push-send says where to send it', () => {
    const p = JSON.parse(payloadFor({ ...r, title: 'Ishaan, pickup at 4:15 PM', body: 'Divya (mother) is on the way.', url: '/coordinator', tag: 'trip-1' }, 'https://x.supabase.co/functions/v1/push-send/receipt'))
    expect(p).toMatchObject({ id: 7, receipt: r.receipt, ack: 'https://x.supabase.co/functions/v1/push-send/receipt' })
  })
})

describe('device receipts', () => {
  const receipt = '6f1c2a0e-3b4d-4c5e-8f9a-0b1c2d3e4f50'
  it('accepts displayed and opened with a numeric id and a uuid', () => {
    expect(parseReceipt(JSON.stringify({ id: 12, receipt, event: 'displayed' }))).toEqual({ id: 12, receipt, event: 'displayed' })
    expect(parseReceipt(JSON.stringify({ id: 12, receipt, event: 'opened' }))?.event).toBe('opened')
    expect(parseReceipt(JSON.stringify({ id: 12, receipt, event: 'spoken' }))?.event).toBe('spoken')
  })
  it('refuses anything else', () => {
    for (const bad of ['', 'not json', 'null', '[]', JSON.stringify({ id: '12', receipt, event: 'displayed' }), JSON.stringify({ id: -1, receipt, event: 'displayed' }),
      JSON.stringify({ id: 1.5, receipt, event: 'displayed' }), JSON.stringify({ id: 12, receipt: 'abc', event: 'displayed' }), JSON.stringify({ id: 12, receipt, event: 'played' }),
      JSON.stringify({ id: 12, receipt, event: 'displayed', pad: 'x'.repeat(400) })]) {
      expect(parseReceipt(bad)).toBeNull()
    }
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
  it('never speaks a parent\'s alert about a trip aloud', () => {
    expect((fcmMessageFor({ ...row, title: 'Arnav has been collected', url: '/parent' }).message.data as { kind: string; speak: string })).toMatchObject({ kind: 'info', speak: '' })
  })
  it('marks a test alert, so the phone says it aloud whatever the duty screen is doing', () => {
    expect((fcmMessageFor({ ...row, tag: 'test-1', url: '/', title: 'Test alert', body: 'Heard?' }).message.data as { kind: string; speak: string })).toMatchObject({ kind: 'test', speak: 'Test alert. Heard?' })
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

  const voice = { clips: [{ key: 'a'.repeat(64), url: 'https://x.supabase.co/storage/v1/object/sign/voice-audio/sentences/a.mp3?token=t' }], chime: 'flagged' as const, priority: 40, order: 1760000000000 }
  const receipt = '6f1c2a0e-3b4d-4c5e-8f9a-0b1c2d3e4f50'
  it('gives the phone the school\'s recording, its queue place, the expiry and a receipt, as strings', () => {
    const data = fcmMessageFor({ ...row, receipt, expires_at: '2026-10-15T10:10:00Z' }, Date.parse('2026-10-15T10:00:00Z'), voice, 'https://x.supabase.co/functions/v1/push-send/receipt').message.data as Record<string, string>
    expect(JSON.parse(data.clips!)).toEqual(voice.clips)
    expect(data).toMatchObject({ chime: 'flagged', priority: '40', order: '1760000000000', expires: String(Date.parse('2026-10-15T10:10:00Z')), receipt, ack: 'https://x.supabase.co/functions/v1/push-send/receipt' })
    expect(Object.values(data).every((v) => typeof v === 'string')).toBe(true)
    // The words are not sent: FCM data is readable by Google, and the title carries only the first name.
    expect(JSON.stringify(data)).not.toMatch(/Sharma|will arrive/)
    expect(new TextEncoder().encode(JSON.stringify(data)).length).toBeLessThan(4000)
  })
  it('lets the iOS extension change the alert only when there is a recording', () => {
    const aps = (v: typeof voice | null) => ((fcmMessageFor({ ...row, platform: 'ios' }, 0, v).message as { apns: { payload: { aps: Record<string, unknown> } } }).apns.payload.aps)
    expect(aps(voice)['mutable-content']).toBe(1)
    expect(aps({ ...voice, clips: [] })['mutable-content']).toBeUndefined()
    expect(aps(null)['mutable-content']).toBeUndefined()
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

describe('time to live from the expiry (0059)', () => {
  const now = Date.parse('2026-10-15T10:00:00Z')
  it('gives the push service only what is left', () => {
    expect(ttlFor({ tag: 'trip-1', expires_at: '2026-10-15T10:01:00Z' }, now)).toBe(60)
    expect(ttlFor({ tag: 'trip-1', expires_at: '2026-10-15T11:00:00Z' }, now)).toBe(600)
    expect(ttlFor({ tag: 'trip-1', expires_at: '2026-10-15T09:59:00Z' }, now)).toBe(30)
    expect(ttlFor({ tag: 'office-1', expires_at: 'not a date' }, now)).toBe(3600)
  })
  it('sets the Android time to live the same way', () => {
    const m = fcmMessageFor({ outbox_id: 1, title: 't', body: 'b', url: '/coordinator', tag: 'trip-1', platform: 'android', token: 'x', expires_at: '2026-10-15T10:02:00Z' }, now)
    expect((m.message.android as { ttl: string }).ttl).toBe('120s')
  })
})

describe('receipt limiter', () => {
  it('blocks a caller after 60 bad receipts in a minute, until the next minute', () => {
    const limit = receiptLimiter()
    const t = Date.parse('2026-10-15T10:00:05Z')
    for (let i = 0; i < 60; i++) { expect(limit.blocked('1.2.3.4', t)).toBe(false); limit.failed('1.2.3.4', t) }
    expect(limit.blocked('1.2.3.4', t)).toBe(true)
    expect(limit.blocked('5.6.7.8', t)).toBe(false)
    expect(limit.blocked('1.2.3.4', t + 60_000)).toBe(false)
  })

  it('never counts good receipts, so real devices behind one address are not turned away', () => {
    const limit = receiptLimiter()
    const t = Date.parse('2026-10-15T10:00:05Z')
    for (let i = 0; i < 500; i++) expect(limit.blocked('proxy', t)).toBe(false)
  })
})

describe('safe paths', () => {
  it('keeps a path on this site and refuses anything a browser could bend into another host', () => {
    expect(safePath('/coordinator')).toBe('/coordinator')
    expect(safePath('/parent/messages/1?x=2')).toBe('/parent/messages/1?x=2')
    for (const bad of ['//evil.example', '/\\evil.example', '/\t/evil.example', 'https://evil.example', '', '/a b']) expect(safePath(bad)).toBe('/')
  })
})

describe('receipt body', () => {
  const chunked = (text: string) => new Request('https://x/receipt', { method: 'POST', body: new Blob([text]).stream(), duplex: 'half' } as RequestInit)
  it('reads a body sent without a length, and refuses one over the cap', async () => {
    expect(await readCapped(chunked('{"id":1}'), 1000)).toBe('{"id":1}')
    expect(await readCapped(chunked('x'.repeat(1001)), 1000)).toBeNull()
    expect(await readCapped(new Request('https://x/receipt', { method: 'POST' }), 1000)).toBe('')
  })

  it('gives up on a body that trickles in', async () => {
    const never = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('{"id"')) } })
    const req = new Request('https://x/receipt', { method: 'POST', body: never, duplex: 'half' } as RequestInit)
    expect(await readCapped(req, 1000, 50)).toBeNull()
  })
})
