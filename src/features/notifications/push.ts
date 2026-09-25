import { supabase } from '../../lib/supabase'

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
export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return apple() && !standalone() ? 'needs-install' : 'unsupported'
  if (apple() && !standalone()) return 'needs-install'
  if (!KEY) return 'not-configured'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

const key = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0))

/** Asks the browser (call from a tap), subscribes this device and saves it for the signed-in person. */
export async function turnOnPush(): Promise<PushState> {
  const state = await pushState()
  if (state !== 'off' && state !== 'on') return state
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(KEY!) }))
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_user_agent: navigator.userAgent })
  if (error) throw error
  return 'on'
}

/** Stops notifications on this device (the database forgets it; other devices keep theirs). */
export async function turnOffPush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  return 'off'
}
