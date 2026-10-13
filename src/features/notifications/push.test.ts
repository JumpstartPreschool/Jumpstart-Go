import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = {
  on: true,
  status: { firebase: true, notificationsAllowed: true } as { firebase: boolean; notificationsAllowed: boolean } | undefined,
  registered: true,
  granted: true,
}
const unregister = vi.fn(async () => {})

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../native/duty', () => ({
  isNativeAndroid: () => native.on,
  nativeStatus: async () => native.status,
  registerNativePushToken: async () => native.registered,
  requestNativeNotifications: async () => native.granted,
  unregisterNativePushToken: () => unregister(),
}))

const { pushState, turnOnPush, turnOffPush } = await import('./push')

describe('push in the Android app', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
    native.on = true
    native.status = { firebase: true, notificationsAllowed: true }
    native.registered = true
    native.granted = true
    unregister.mockClear()
  })

  it('is on once the device token is saved', async () => {
    expect(await pushState()).toBe('on')
  })

  it('says not-configured when Firebase is not set up', async () => {
    native.status = { firebase: false, notificationsAllowed: true }
    expect(await pushState()).toBe('not-configured')
    expect(await turnOnPush()).toBe('not-configured')
  })

  it('is off when notifications are blocked or the token cannot be saved', async () => {
    native.status = { firebase: true, notificationsAllowed: false }
    expect(await pushState()).toBe('off')
    native.status = { firebase: true, notificationsAllowed: true }
    native.registered = false
    expect(await pushState()).toBe('off')
  })

  it('turning off deletes the token and stays off after a reload; turning on undoes it', async () => {
    expect(await turnOffPush()).toBe('off')
    expect(unregister).toHaveBeenCalled()
    expect(await pushState()).toBe('off')
    expect(await turnOnPush()).toBe('on')
    expect(await pushState()).toBe('on')
  })

  it('is denied when the permission is refused', async () => {
    native.granted = false
    expect(await turnOnPush()).toBe('denied')
  })
})
