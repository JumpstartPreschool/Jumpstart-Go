import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWakeLock } from './wakeLock'

function fakeLock() {
  const handlers: (() => void)[] = []
  return { release: vi.fn(async () => handlers.forEach((h) => h())), addEventListener: (_: string, h: () => void) => void handlers.push(h) }
}

describe('wake lock', () => {
  const locks: ReturnType<typeof fakeLock>[] = []
  beforeEach(() => {
    locks.length = 0
    vi.stubGlobal('navigator', { wakeLock: { request: vi.fn(async () => { await Promise.resolve(); const l = fakeLock(); locks.push(l); return l }) } })
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('takes one lock however often it is asked, and End duty releases it', async () => {
    const onChange = vi.fn()
    const wl = createWakeLock(onChange)
    await Promise.all([wl.start(), wl.retry(), wl.retry()])
    expect(locks).toHaveLength(1)
    await wl.stop()
    expect(locks[0]!.release).toHaveBeenCalled()
  })

  it('releases a lock that arrives after End duty', async () => {
    const wl = createWakeLock(vi.fn())
    const starting = wl.start()
    await wl.stop()
    await starting
    expect(locks[0]!.release).toHaveBeenCalled()
  })
})

describe('wake lock on Apple Home Screen apps', () => {
  const iphone = (v: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148`
  it('is not trusted from the Home Screen before iOS 18.4', async () => {
    const { brokenOnApple } = await import('./wakeLock')
    expect(brokenOnApple(iphone('17_5'), true)).toBe(true)
    expect(brokenOnApple(iphone('18_3_1'), true)).toBe(true)
    expect(brokenOnApple(iphone('18_4'), true)).toBe(false)
    expect(brokenOnApple(iphone('26_0'), true)).toBe(false)
    // In Safari itself it works from iOS 16.4.
    expect(brokenOnApple(iphone('17_5'), false)).toBe(false)
    expect(brokenOnApple('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0', true)).toBe(false)
  })
})
