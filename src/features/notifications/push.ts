import { supabase } from '../../lib/supabase'
import { isNativeAndroid, nativeStatus, registerNativePushToken, requestNativeNotifications, unregisterNativePushToken } from '../../native/duty'

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushState =
  | 'unsupported'     // this browser can't receive web push
  | 'needs-install'   // iPhone or iPad: only from the Home Screen app (iOS 16.4+)
  | 'not-configured'  // the school hasn't set up notifications yet (no VAPID key in this build)
  | 'denied'          // blocked in the browser's settings
  | 'off'
  | 'on'

const apple = () => /iPhone|iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Where this device stands for notifications, said as one of the states above. */
/** What can be told without waiting: unsupported, not installed, not set up, or blocked. Null when push could work. */
function basicState(): PushState | null {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return apple() && !standalone() ? 'needs-install' : 'unsupported'
  if (apple() && !standalone()) return 'needs-install'
  if (!KEY) return 'not-configured'
  if (Notification.permission === 'denied') return 'denied'
  return null
}

// Someone on this device switched alerts off on purpose (the switch, not signing out). The Android app needs it to stay
// off, since its Firebase token outlives the switch; everywhere, Start duty then stops asking for alerts each morning.
const OFF_KEY = 'jumpstart.nativePushOff'
function chosenOff(set?: boolean): boolean {
  try {
    if (set === undefined) return localStorage.getItem(OFF_KEY) === '1'
    if (set) localStorage.setItem(OFF_KEY, '1')
    else localStorage.removeItem(OFF_KEY)
  } catch {
    /* storage blocked */
  }
  return set === true
}

/** Alerts on this device were switched off on purpose (they stay off until switched on again). */
export const pushTurnedOff = (): boolean => chosenOff()

// The Android app's WebView has no Push API: notifications go through the app's own Firebase token instead.
async function nativeState(): Promise<PushState> {
  const s = await nativeStatus()
  if (!s?.firebase) return 'not-configured'
  if (!s.notificationsAllowed || chosenOff()) return 'off'
  return (await registerNativePushToken()) ? 'on' : 'off'
}

export async function pushState(): Promise<PushState> {
  if (isNativeAndroid()) return nativeState()
  const basic = basicState()
  if (basic) return basic
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub || Notification.permission !== 'granted') return 'off'
  // On only if the school will actually send here: this device's subscription saved for the person signed in. The server
  // forgets a subscription the push service rejects, and a shared tablet may have been someone else's.
  const { data, error } = await supabase.from('push_subscriptions').select('endpoint').eq('endpoint', sub.endpoint).maybeSingle()
  if (data) return 'on'
  if (error) return 'off'
  return (await saveSubscription(sub)) ? 'on' : 'off'
}

/** This browser's push endpoint, or null (no subscription, no service worker, or the Android app). */
export async function currentEndpoint(): Promise<string | null> {
  if (isNativeAndroid() || !('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription())?.endpoint ?? null
}

async function saveSubscription(sub: PushSubscription): Promise<boolean> {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_user_agent: navigator.userAgent })
  return !error
}

const key = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0))

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])

/** Asks the browser (call from a tap), subscribes this device and saves it for the signed-in person. */
export async function turnOnPush(): Promise<PushState> {
  chosenOff(false)
  if (isNativeAndroid()) {
    const granted = await requestNativeNotifications()
    if (!(await nativeStatus())?.firebase) return 'not-configured'
    if (!granted) return 'denied'
    return (await registerNativePushToken()) ? 'on' : 'off'
  }
  // Only quick checks before the question: iOS shows the permission prompt only while the tap is fresh, so nothing that
  // waits on the network may come first.
  const state = basicState()
  if (state) return state
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  // No service worker means no push, ever: say so instead of waiting forever on `ready`.
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 10_000))])
  if (!reg) return 'unsupported'
  const appKey = key(KEY!)
  let sub = await reg.pushManager.getSubscription()
  // Made with another key (the school's keys were generated or changed since): the push service would reject every send.
  const old = sub?.options.applicationServerKey
  if (sub && old && !sameBytes(new Uint8Array(old), appKey)) { await sub.unsubscribe(); sub = null }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey })
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_user_agent: navigator.userAgent })
  if (error) throw error
  return 'on'
}

/**
 * Stops notifications on this device (the database forgets it; other devices keep theirs). `chosen`: the person switched
 * them off, so they stay off. Signing out is not a choice: the next person on a shared device starts afresh.
 */
export async function turnOffPush(chosen = false): Promise<PushState> {
  chosenOff(chosen)
  if (isNativeAndroid()) {
    await unregisterNativePushToken()
    return 'off'
  }
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  return 'off'
}
