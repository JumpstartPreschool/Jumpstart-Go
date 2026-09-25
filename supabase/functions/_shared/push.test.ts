import { describe, expect, it } from 'vitest'
import { payloadFor } from './push'

describe('push payload', () => {
  it('keeps links inside the app and trims for the lock screen', () => {
    expect(JSON.parse(payloadFor({ title: 'Kabir is ready at the gate', body: 'Ready at 4:15 PM.', url: '/parent', tag: 'trip-1' }))).toEqual({ title: 'Kabir is ready at the gate', body: 'Ready at 4:15 PM.', url: '/parent', tag: 'trip-1' })
    expect(JSON.parse(payloadFor({ title: 't', body: 'b', url: 'https://evil.example', tag: null })).url).toBe('/')
    expect(JSON.parse(payloadFor({ title: 't', body: 'b', url: '//evil.example', tag: null })).url).toBe('/')
    expect(JSON.parse(payloadFor({ title: 'x'.repeat(200), body: 'y'.repeat(400), url: '/', tag: null })).body).toHaveLength(240)
  })
})
