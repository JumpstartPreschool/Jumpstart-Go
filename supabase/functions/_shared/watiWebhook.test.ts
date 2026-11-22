import { describe, expect, it, vi } from 'vitest'
import { failureText, handleWebhook, localIdOf, secretMatches, statusFor } from './watiWebhook'

const call = (body: unknown, key: string | null = 's3cret', record = vi.fn(async () => true)) => {
  const url = `https://x.test/wati-webhook${key === null ? '' : `?key=${key}`}`
  return { record, res: handleWebhook(new Request(url, { method: 'POST', body: JSON.stringify(body) }), { secret: 's3cret', record }) }
}

describe('statusFor', () => {
  it.each([
    ['templateMessageSent_v2', 'sent'],
    ['sessionMessageSent_v2', 'sent'],
    ['sentMessageDELIVERED_v2', 'delivered'],
    ['sentMessageREAD_v2', 'read'],
    ['templateMessageFailed', 'failed'],
    ['sessionMessageFailed', 'failed'],
  ])('%s is %s', (e, s) => expect(statusFor(e)).toBe(s))

  it('ignores events it does not track', () => {
    for (const e of ['message', 'newContactMessageReceived', 'templateMessageSentFailedRetry', '', null, 5]) expect(statusFor(e)).toBeNull()
  })
})

it('reads the local id from the payload shapes WATI uses', () => {
  expect(localIdOf({ localMessageId: 'a' })).toBe('a')
  expect(localIdOf({ local_message_id: 'b' })).toBe('b')
  expect(localIdOf({ message: { localMessageId: 'c' } })).toBe('c')
  expect(localIdOf({ localMessageId: 5 })).toBeNull()
})

describe('failureText', () => {
  it('uses failedDetail, then failedCode, as short text', () => {
    expect(failureText({ failedDetail: 'Undeliverable', failedCode: '131026' })).toBe('Undeliverable')
    expect(failureText({ failedCode: '131026' })).toBe('131026')
    expect(failureText({ failedDetail: 42 })).toBeNull()
    expect(failureText({ failedDetail: 'x'.repeat(300) })).toHaveLength(100)
  })
  it('never keeps a phone number', () => {
    expect(failureText({ failedDetail: 'Cannot reach +91 98220 00001 now' })).toBe('Cannot reach [number] now')
    expect(failureText({ failedDetail: 'bad 919822000001' })).not.toMatch(/\d{6}/)
  })
})

it('compares secrets without accepting near misses', async () => {
  expect(await secretMatches('s3cret', 's3cret')).toBe(true)
  expect(await secretMatches('s3cre', 's3cret')).toBe(false)
  expect(await secretMatches(null, 's3cret')).toBe(false)
  expect(await secretMatches('', '')).toBe(false)
})

describe('handleWebhook', () => {
  it('records the status with the failure reason', async () => {
    const { res, record } = call({ eventType: 'templateMessageFailed', localMessageId: 'L1', failedDetail: 'Undeliverable' })
    expect((await res).status).toBe(200)
    expect(record).toHaveBeenCalledWith('L1', 'failed', 'Undeliverable')
  })

  it('records delivered and read, not as sent', async () => {
    const d = call({ eventType: 'sentMessageDELIVERED_v2', localMessageId: 'L1' })
    await d.res
    expect(d.record).toHaveBeenCalledWith('L1', 'delivered', null)
    const r = call({ eventType: 'sentMessageREAD_v2', localMessageId: 'L1' })
    await r.res
    expect(r.record).toHaveBeenCalledWith('L1', 'read', null)
  })

  it('answers 401 for a wrong or missing secret and does not touch the database', async () => {
    for (const key of ['nope', null]) {
      const { res, record } = call({ eventType: 'templateMessageSent_v2', localMessageId: 'L1' }, key)
      expect((await res).status).toBe(401)
      expect(record).not.toHaveBeenCalled()
    }
    const unset = await handleWebhook(new Request('https://x.test/?key=', { method: 'POST', body: '{}' }), { secret: undefined, record: vi.fn() })
    expect(unset.status).toBe(401)
  })

  it('answers 200 and records nothing for unknown events', async () => {
    const { res, record } = call({ eventType: 'newContactMessageReceived', localMessageId: 'L1' })
    expect((await res).status).toBe(200)
    expect(record).not.toHaveBeenCalled()
  })

  it('answers 200 when the id is unknown, and 503 when the database fails', async () => {
    expect((await call({ eventType: 'templateMessageSent_v2', localMessageId: 'ghost' }, 's3cret', vi.fn(async () => false)).res).status).toBe(200)
    const failing = vi.fn(async () => { throw new Error('db') })
    expect((await call({ eventType: 'templateMessageSent_v2', localMessageId: 'L1' }, 's3cret', failing).res).status).toBe(503)
  })

  it('rejects non-POST and non-object bodies', async () => {
    expect((await handleWebhook(new Request('https://x.test/?key=s3cret'), { secret: 's3cret', record: vi.fn() })).status).toBe(405)
    expect((await call([1]).res).status).toBe(400)
  })
})
