// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MINE = 'https://web.push.apple.com/this-ipad'
const state = { push: 'on' as string, evidence: null as null | { last_test_at: string | null; test_heard_at: string | null }, status: [] as unknown[] }
const rpc = vi.fn(async (name: string, _args?: unknown) => {
  if (name === 'send_test_push') return { data: 'test-1', error: null }
  if (name === 'test_push_status') return { data: state.status, error: null }
  return { data: true, error: null }
})
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args?: unknown) => rpc(name, args),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.evidence, error: null }) }) }) }),
  },
}))
vi.mock('./push', () => ({ pushState: async () => state.push, currentEndpoint: async () => MINE, turnOnPush: async () => 'on' }))
vi.mock('../../native/duty', () => ({ isNativeAndroid: () => false }))
vi.mock('../../ui/Toast', () => ({ useToast: () => () => {} }))
vi.mock('../admin/api', () => ({ explainDbError: () => 'error' }))

const { DeviceReadiness } = await import('./DeviceReadiness')

describe('DeviceReadiness', () => {
  beforeEach(() => { state.push = 'on'; state.evidence = null; state.status = []; rpc.mockClear() })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('does not call a subscribed device Ready until a test was shown and heard', async () => {
    render(<DeviceReadiness />)
    expect(await screen.findByText('Needs attention')).toBeTruthy()
  })

  it('follows a test alert to this device and records that it was heard', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<DeviceReadiness />)
    await user.click(await screen.findByRole('button', { name: /Send a test alert/ }))
    expect(screen.getByText(/Lock the screen now/)).toBeTruthy()
    // Another device of the same person displayed it: not proof for this one.
    state.status = [{ platform: 'web', endpoint: 'https://fcm.googleapis.com/other', result: 'sent', displayed_at: '2026-10-15T10:00:10Z' }]
    await act(() => vi.advanceTimersByTimeAsync(3100))
    expect(screen.queryByText(/Did you hear its sound/)).toBeNull()
    state.status.push({ platform: 'web', endpoint: MINE, result: 'sent', displayed_at: '2026-10-15T10:00:11Z' })
    await act(() => vi.advanceTimersByTimeAsync(3100))
    expect(await screen.findByText(/This device displayed the test alert/)).toBeTruthy()
    state.evidence = { last_test_at: new Date().toISOString(), test_heard_at: new Date().toISOString() }
    await user.click(screen.getByRole('button', { name: /Yes, I heard it/ }))
    expect(rpc).toHaveBeenCalledWith('confirm_test_heard', { p_endpoint: MINE })
    expect(await screen.findByText('Ready')).toBeTruthy()
  })

  it('says so when the alert never reaches this device', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<DeviceReadiness />)
    await user.click(await screen.findByRole('button', { name: /Send a test alert/ }))
    state.status = [{ platform: 'web', endpoint: MINE, result: 'sent', displayed_at: null }]
    await act(() => vi.advanceTimersByTimeAsync(95_000))
    expect(await screen.findByText(/accepted it, but this device has not shown it/)).toBeTruthy()
  })

  it('offers the switch when notifications are off, and says blocked plainly', async () => {
    state.push = 'off'
    const { unmount } = render(<DeviceReadiness />)
    expect(await screen.findByRole('button', { name: /Turn on notifications/ })).toBeTruthy()
    unmount()
    state.push = 'denied'
    render(<DeviceReadiness />)
    expect(await screen.findByText('Notifications blocked')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Send a test alert/ })).toBeNull()
  })
})
