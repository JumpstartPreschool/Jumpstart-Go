// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The server: my_duty answers `server`; set_duty applies the version check, as 0061 does.
let server: Record<string, unknown> | null = null
let offline = false
const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
  if (offline) return { data: null, error: { message: 'Failed to fetch' } }
  if (name === 'my_duty') return { data: server, error: null }
  if (name === 'set_duty') {
    const next = args!.p_status as string
    if ((server?.status ?? 'off') === next) return { data: server, error: null }
    if ((args!.p_version ?? null) !== ((server?.version as number | undefined) ?? null)) return { data: null, error: { message: 'duty_conflict: Your duty was changed on another device.' } }
    const at = new Date().toISOString()
    server = next === 'off' ? null : server ? { ...server, status: next, version: (server.version as number) + 1, changed_at: at } : { status: 'active', version: 1, started_at: at, changed_at: at }
    return { data: server, error: null }
  }
  return { data: null, error: null }
})
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (n: string, a?: Record<string, unknown>) => rpc(n, a), auth: { getSession: async () => ({ data: { session: { user: { id: 'coord-1' } } } }) } } }))
vi.mock('./sound', () => ({
  chime: vi.fn(async () => true), speak: vi.fn(async () => 'school'), prepare: vi.fn(), stopSound: vi.fn(), releaseSound: vi.fn(),
  unlockSound: vi.fn(), soundReady: vi.fn(async () => false), soundSupported: true, SOUND_CHECK_BUDGET_MS: 8000,
  deviceOutput: { chime: vi.fn(async () => true), speak: vi.fn(async () => 'school') },
}))
vi.mock('../../native/duty', () => ({ nativeAlive: vi.fn(), nativeDutyStart: vi.fn(), nativeDutyStop: vi.fn(), requestNativeNotifications: vi.fn(), isNativeAndroid: () => false }))

const { useDuty } = await import('./useDuty')
const active = () => ({ status: 'active', version: 4, started_at: '2026-10-22T03:00:00Z', changed_at: '2026-10-22T03:00:00Z' })

/** Everything the app's lifecycle can throw at the page: app switch, lock, restore, focus loss, network loss. */
function lifecycle() {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('pagehide'))
  window.dispatchEvent(new Event('blur'))
  window.dispatchEvent(new Event('offline'))
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('pageshow'))
  window.dispatchEvent(new Event('focus'))
  window.dispatchEvent(new Event('online'))
}
const writes = () => rpc.mock.calls.filter(([n]) => n === 'set_duty')

beforeEach(() => { server = null; offline = false; rpc.mockClear(); localStorage.clear() })

describe('duty survives everything but an explicit tap', () => {
  it('opens straight onto an Active duty: no Resume after a reload or reopening', async () => {
    server = active()
    const { result } = renderHook(() => useDuty())
    await waitFor(() => expect(result.current.phase).toBe('on'))
    // The sound may need a tap after a reload (iOS); that's sound, not duty.
    await waitFor(() => expect(result.current.soundBlocked).toBe(true))
    expect(result.current.phase).toBe('on')
  })
  it('stays Active through app switches, locks, restores and lost connections, and never writes', async () => {
    server = active()
    const { result } = renderHook(() => useDuty())
    await waitFor(() => expect(result.current.phase).toBe('on'))
    offline = true
    await act(async () => { lifecycle(); await new Promise((r) => setTimeout(r, 10)) })
    expect(result.current.phase).toBe('on')
    offline = false
    await act(async () => { lifecycle(); await new Promise((r) => setTimeout(r, 10)) })
    expect(result.current.phase).toBe('on')
    expect(writes()).toHaveLength(0)
  })
  it('opened with no connection: the last confirmed duty for this person, marked unconfirmed, never Paused', async () => {
    server = active()
    const first = renderHook(() => useDuty())
    await waitFor(() => expect(first.result.current.phase).toBe('on'))
    first.unmount()
    offline = true
    const { result } = renderHook(() => useDuty())
    await waitFor(() => expect(result.current.phase).toBe('on'))
    expect(result.current.unconfirmed).toBe(true)
    await waitFor(() => expect(['reconnecting', 'offline']).toContain(result.current.connectivity))
  })
  it('pauses and resumes only on request, and a paused duty stays paused through the lifecycle', async () => {
    server = active()
    const { result } = renderHook(() => useDuty())
    await waitFor(() => expect(result.current.phase).toBe('on'))
    await act(async () => { await result.current.pause('Break') })
    expect(rpc).toHaveBeenCalledWith('set_duty', { p_status: 'paused', p_version: 4, p_reason: 'Break' })
    expect(result.current.phase).toBe('paused')
    await act(async () => { lifecycle(); await new Promise((r) => setTimeout(r, 10)) })
    expect(result.current.phase).toBe('paused')
    await act(async () => { await result.current.resume() })
    expect(result.current.phase).toBe('on')
  })
  it('a change made on another device wins: this one shows it and overwrites nothing', async () => {
    server = active()
    const { result } = renderHook(() => useDuty())
    await waitFor(() => expect(result.current.phase).toBe('on'))
    server = { ...active(), status: 'paused', version: 5 }   // the other device paused
    let ok = true
    await act(async () => { ok = await result.current.pause() })
    // Same request as the newer state: harmless, shown as paused.
    expect(ok).toBe(true)
    expect(result.current.phase).toBe('paused')
    server = { ...active(), version: 6 }                      // and resumed again
    await act(async () => { ok = await result.current.end() as unknown as boolean })
    expect(result.current.error).toMatch(/another device/)
    expect(result.current.phase).toBe('on')
    expect(server?.status).toBe('active')
  })
  it('offline, a pause is refused and the duty shown is unchanged', async () => {
    server = active()
    const { result } = renderHook(() => useDuty())
    await waitFor(() => expect(result.current.phase).toBe('on'))
    offline = true
    await act(async () => { await result.current.pause() })
    expect(result.current.phase).toBe('on')
    expect(result.current.error).toMatch(/hasn't changed/)
  })
  it('starts only once the school has it', async () => {
    const { result } = renderHook(() => useDuty())
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    act(() => result.current.start())
    expect(result.current.phase).toBe('check')
    offline = true
    await act(async () => { await result.current.confirmHeard() })
    expect(result.current.phase).toBe('check')
    offline = false
    await act(async () => { await result.current.confirmHeard() })
    expect(result.current.phase).toBe('on')
    expect(server?.status).toBe('active')
  })
})
