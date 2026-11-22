// The push service worker (public/push-sw.js), run against a fake worker scope.
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const code = readFileSync(new URL('../../../public/push-sw.js', import.meta.url), 'utf8')
const TRIP = '00000000-0000-0000-0000-000000059d02'
const ACK = 'https://x.supabase.co/functions/v1/push-send/receipt'

interface Win { id: string; url: string; focused?: boolean; visibilityState?: string; focus: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> }

function worker(windows: Win[] = []) {
  const handlers = new Map<string, (e: unknown) => void>()
  const shown: Array<{ title: string; options: Record<string, unknown> }> = []
  const fetch = vi.fn(async () => new Response(null))
  const openWindow = vi.fn(async () => null)
  const self = {
    location: { origin: 'https://jumpstart-go.example' },
    navigator: {},
    addEventListener: (type: string, fn: (e: unknown) => void) => handlers.set(type, fn),
    registration: {
      showNotification: vi.fn(async (title: string, options: Record<string, unknown>) => void shown.push({ title, options })),
      getNotifications: async () => shown,
    },
    clients: { matchAll: async () => windows, openWindow },
  }
  runInNewContext(code, { self, fetch, URL, JSON, Promise, Boolean })
  // A duty screen posting what it announces (GateQueue).
  const say = (from: Win, m: unknown) => handlers.get('message')!({ data: m, source: from })
  const fire = async (type: string, e: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve()
    handlers.get(type)!({ ...e, waitUntil: (p: Promise<unknown>) => { done = Promise.all([done, p]) } })
    await done
  }
  const push = (payload: unknown) => fire('push', { data: { json: () => payload, text: () => JSON.stringify(payload) } })
  const click = (data: unknown) => fire('notificationclick', { notification: { data, close: vi.fn() } })
  return { shown, fetch, openWindow, push, click, say }
}

const win = (url: string, front = false, id = 'w1'): Win => ({ id, url, focused: front, visibilityState: front ? 'visible' : 'hidden', focus: vi.fn(async () => {}), navigate: vi.fn(async () => {}), postMessage: vi.fn() })

describe('push service worker', () => {
  it('shows a gate alert that stays, links to its request and reports it displayed', async () => {
    const w = worker([win('https://jumpstart-go.example/coordinator')])
    await w.push({ title: 'Ishaan, pickup at 4:15 PM', body: 'Divya (mother) is on the way.', url: '/coordinator', tag: `trip-${TRIP}`, id: 41, receipt: 'r-41', ack: ACK })
    expect(w.shown[0]!.options).toMatchObject({ requireInteraction: true, tag: `trip-${TRIP}`, renotify: true, data: { url: `/coordinator?trip=${TRIP}` } })
    expect(w.fetch).toHaveBeenCalledWith(ACK, expect.objectContaining({ method: 'POST', mode: 'no-cors', body: JSON.stringify({ id: 41, receipt: 'r-41', event: 'displayed' }) }))
  })

  it('tells open windows to read afresh', async () => {
    const open = win('https://jumpstart-go.example/coordinator')
    const w = worker([open])
    await w.push({ title: 't', body: 'b', url: '/coordinator', tag: `trip-${TRIP}` })
    expect(open.postMessage).toHaveBeenCalledWith({ type: 'jumpstart-push', tag: `trip-${TRIP}` })
  })

  it('keeps links on this site and reports only to an https address', async () => {
    const w = worker()
    await w.push({ title: 't', body: 'b', url: 'https://evil.example', tag: 'x', id: 1, receipt: 'r', ack: 'http://evil.example' })
    await w.push({ title: 't', body: 'b', url: '//evil.example', tag: 'y' })
    expect(w.shown.map((s) => (s.options.data as { url: string }).url)).toEqual(['/', '/'])
    expect(w.fetch).not.toHaveBeenCalled()
  })

  it('shows an ordinary alert without holding the screen', async () => {
    const w = worker()
    await w.push({ title: 'Rain day', body: 'School closes at noon.', url: '/parent', tag: 'office-1' })
    expect(w.shown[0]!.options.requireInteraction).toBeUndefined()
    expect((w.shown[0]!.options.data as { url: string }).url).toBe('/parent')
  })

  it('still shows the alert when the receipt cannot be sent', async () => {
    const w = worker()
    w.fetch.mockRejectedValueOnce(new Error('offline'))
    await w.push({ title: 't', body: 'b', url: '/coordinator', tag: `trip-${TRIP}`, id: 2, receipt: 'r', ack: ACK })
    expect(w.shown).toHaveLength(1)
  })

  it('mutes an alert only on a screen in front of someone that says it is announcing that request', async () => {
    const screen = win('https://jumpstart-go.example/coordinator', true)
    const w = worker([screen])
    const alert = { title: 't', body: 'b', url: '/coordinator', tag: `trip-${TRIP}` }
    await w.push(alert)
    expect(w.shown.at(-1)!.options.silent).toBeUndefined() // on /coordinator but has said nothing (Start duty, or a restarted worker)
    w.say(screen, { type: 'jumpstart-announcing', on: true, trips: [TRIP] })
    await w.push(alert)
    expect(w.shown.at(-1)!.options).toMatchObject({ silent: true, requireInteraction: true })
    expect(w.shown.at(-1)!.options.vibrate).toBeUndefined()
    await w.push({ ...alert, tag: 'trip-11111111-1111-1111-1111-111111111111' })
    expect(w.shown.at(-1)!.options.silent).toBeUndefined() // another class it isn't announcing
    await w.push({ ...alert, tag: 'duty-1', title: 'No signal from Kavita\'s device' })
    expect(w.shown.at(-1)!.options.silent).toBeUndefined()
    await w.push({ ...alert, tag: 'test-1' })
    expect(w.shown.at(-1)!.options.silent).toBeUndefined()
    w.say(screen, { type: 'jumpstart-announcing', on: false }) // muted, sound paused or duty ended
    await w.push(alert)
    expect(w.shown.at(-1)!.options.silent).toBeUndefined()
    expect(w.shown.at(-1)!.options.vibrate).toBeDefined()
  })

  it('always sounds when the announcing screen is in the background', async () => {
    const screen = win('https://jumpstart-go.example/coordinator')
    const w = worker([screen])
    w.say(screen, { type: 'jumpstart-announcing', on: true, trips: [TRIP] })
    await w.push({ title: 't', body: 'b', url: '/coordinator', tag: `trip-${TRIP}` })
    expect(w.shown[0]!.options.silent).toBeUndefined()
  })

  it('never opens another site through a bent path', async () => {
    const w = worker()
    await w.push({ title: 't', body: 'b', url: '/\\evil.example', tag: 'a' })
    await w.push({ title: 't', body: 'b', url: '/\t/evil.example', tag: 'b' })
    expect(w.shown.map((x) => (x.options.data as { url: string }).url)).toEqual(['/', '/'])
  })

  it('opens the request on a duty screen that is already open, without reloading it', async () => {
    const open = win('https://jumpstart-go.example/coordinator')
    const w = worker([open])
    await w.click({ url: `/coordinator?trip=${TRIP}`, id: 41, receipt: 'r-41', ack: ACK })
    expect(open.focus).toHaveBeenCalled()
    expect(open.navigate).not.toHaveBeenCalled()
    expect(open.postMessage).toHaveBeenCalledWith({ type: 'jumpstart-open', url: `/coordinator?trip=${TRIP}` })
    expect(w.fetch).toHaveBeenCalledWith(ACK, expect.objectContaining({ body: JSON.stringify({ id: 41, receipt: 'r-41', event: 'opened' }) }))
  })

  it('never reloads a duty screen: a test alert or other page only brings it forward', async () => {
    for (const url of ['/', '/parent/messages/']) {
      const duty = win('https://jumpstart-go.example/coordinator')
      const w = worker([duty])
      await w.click({ url })
      expect(duty.focus).toHaveBeenCalled()
      expect(duty.navigate).not.toHaveBeenCalled()
      expect(w.openWindow).not.toHaveBeenCalled()
    }
  })

  it('prefers the window already on that page', async () => {
    const other = win('https://jumpstart-go.example/parent', false, 'a')
    const duty = win('https://jumpstart-go.example/coordinator', false, 'b')
    const w = worker([other, duty])
    await w.click({ url: `/coordinator?trip=${TRIP}` })
    expect(duty.postMessage).toHaveBeenCalledWith({ type: 'jumpstart-open', url: `/coordinator?trip=${TRIP}` })
    expect(other.navigate).not.toHaveBeenCalled()
  })

  it('moves another open page to the request, or opens the app', async () => {
    const open = win('https://jumpstart-go.example/parent')
    const w = worker([open])
    await w.click({ url: `/coordinator?trip=${TRIP}` })
    expect(open.navigate).toHaveBeenCalledWith(`https://jumpstart-go.example/coordinator?trip=${TRIP}`)
    const closed = worker()
    await closed.click({ url: '/coordinator' })
    expect(closed.openWindow).toHaveBeenCalledWith('https://jumpstart-go.example/coordinator')
  })
})
