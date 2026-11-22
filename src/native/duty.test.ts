import { beforeEach, describe, expect, it, vi } from 'vitest'

const plugin = {
  start: vi.fn(async () => {}), stop: vi.fn(async () => {}), alive: vi.fn(async () => {}),
  status: vi.fn(async () => ({ firebase: true })), getPushToken: vi.fn(async () => ({ token: 'tok-1' })),
  requestNotificationPermission: vi.fn(async () => ({ granted: true })), addListener: vi.fn(async () => ({ remove: async () => {} })),
}
const cap = { native: false }
const rpc = vi.fn(async (..._a: unknown[]) => ({ error: null as unknown }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => cap.native, getPlatform: () => (cap.native ? 'android' : 'web') },
  registerPlugin: () => plugin,
}))
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))

const duty = await import('./duty')

describe('native duty bridge', () => {
  beforeEach(() => { vi.clearAllMocks(); cap.native = false })

  it('does nothing on the web', async () => {
    expect(duty.isNativeAndroid()).toBe(false)
    await duty.nativeDutyStart(); await duty.nativeDutyStop(); await duty.nativeAlive()
    expect(await duty.nativeStatus()).toBeUndefined()
    expect(await duty.requestNativeNotifications()).toBe(false)
    expect(await duty.registerNativePushToken()).toBe(false)
    expect(plugin.start).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('calls the plugin on Android and saves the push token', async () => {
    cap.native = true
    await duty.nativeDutyStart()
    expect(plugin.start).toHaveBeenCalled()
    expect(await duty.registerNativePushToken()).toBe(true)
    expect(rpc).toHaveBeenCalledWith('save_device_token', { p_platform: 'android', p_token: 'tok-1', p_app_version: '1.0' })
  })

  it('never lets a native failure break duty', async () => {
    cap.native = true
    plugin.start.mockRejectedValueOnce(new Error('boom'))
    await expect(duty.nativeDutyStart()).resolves.toBeUndefined()
  })

  it('has no token when Firebase is not set up', async () => {
    cap.native = true
    plugin.getPushToken.mockResolvedValueOnce({ token: null as unknown as string })
    expect(await duty.registerNativePushToken()).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('forgets the token on the server', async () => {
    cap.native = true
    await duty.unregisterNativePushToken()
    expect(rpc).toHaveBeenCalledWith('delete_device_token', { p_token: 'tok-1' })
  })
})
