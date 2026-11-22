// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

type Status = (s: string) => void
const hub = vi.hoisted(() => ({ statuses: [] as Status[], removed: 0 }))
vi.mock('./supabase', () => ({
  supabase: {
    channel: () => {
      const ch = {
        on: () => ch,
        subscribe: (cb: Status) => { hub.statuses.push(cb); return ch },
      }
      return ch
    },
    removeChannel: () => { hub.removed++; return Promise.resolve('ok') },
  },
}))
const { onTableChange } = await import('./live')

beforeEach(() => { vi.useFakeTimers(); hub.statuses.length = 0; hub.removed = 0 })
afterEach(() => vi.useRealTimers())

it('re-joins with a growing wait after an error, and reads again once back', () => {
  const onChange = vi.fn()
  const stop = onTableChange('trips', onChange)
  hub.statuses[0]!('SUBSCRIBED')
  expect(onChange).not.toHaveBeenCalled() // the first join needs no catch-up
  hub.statuses[0]!('CHANNEL_ERROR')
  expect(hub.removed).toBe(1)
  vi.advanceTimersByTime(999)
  expect(hub.statuses).toHaveLength(1)
  vi.advanceTimersByTime(1)
  expect(hub.statuses).toHaveLength(2)
  hub.statuses[1]!('TIMED_OUT')
  vi.advanceTimersByTime(1_999)
  expect(hub.statuses).toHaveLength(2)
  vi.advanceTimersByTime(1)
  expect(hub.statuses).toHaveLength(3)
  hub.statuses[2]!('SUBSCRIBED')
  expect(onChange).toHaveBeenCalledTimes(1)
  stop()
  vi.advanceTimersByTime(60_000)
  expect(hub.statuses).toHaveLength(3)
})

it('reads again when the app comes back to the screen or the network returns, and not after stopping', () => {
  const onChange = vi.fn()
  const stop = onTableChange('trips', onChange)
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('online'))
  expect(onChange).toHaveBeenCalledTimes(2)
  stop()
  window.dispatchEvent(new Event('online'))
  expect(onChange).toHaveBeenCalledTimes(2)
})
