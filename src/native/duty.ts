import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { supabase } from '../lib/supabase'

/** The Android app's own plugin (android/.../DutyPlugin.java). Every function here does nothing on the web. */
interface DutyNative {
  start(): Promise<void>
  stop(): Promise<void>
  alive(): Promise<void>
  status(): Promise<NativeStatus>
  openBatterySettings(): Promise<void>
  openNotificationSettings(): Promise<void>
  requestNotificationPermission(): Promise<{ granted: boolean }>
  setSpeakAloud(o: { on: boolean }): Promise<void>
  getPushToken(): Promise<{ token: string | null }>
  addListener(event: 'pushToken', cb: (e: { token: string }) => void): Promise<PluginListenerHandle>
}

export interface NativeStatus {
  running: boolean
  ignoringBatteryOptimizations: boolean
  notificationsAllowed: boolean
  alarmVolume: number
  alarmMax: number
  mediaVolume: number
  mediaMax: number
  manufacturer: string
  firebase: boolean
  /** The phone says gate alerts aloud itself when this page can't (GateVoice). Absent in apps built before it. */
  speakAloud?: boolean
  /** When the phone last said an alert in full (ms, 0 never), and in which voice: the school's recording or its own. */
  lastSpokenAt?: number
  lastVoice?: '' | 'school' | 'device'
}

const Duty = registerPlugin<DutyNative>('Duty')

export const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

// A failed native call must never break duty: the web announcer carries on either way.
async function native<T>(run: () => Promise<T>): Promise<T | undefined> {
  if (!isNativeAndroid()) return undefined
  try {
    return await run()
  } catch {
    return undefined
  }
}

export const nativeDutyStart = () => native(() => Duty.start())
export const nativeDutyStop = () => native(() => Duty.stop())
export const nativeAlive = () => native(() => Duty.alive())
export const nativeStatus = () => native(() => Duty.status())
export const setSpeakAloud = (on: boolean) => native(() => Duty.setSpeakAloud({ on }))
export const openBatterySettings = () => native(() => Duty.openBatterySettings())
export const openNotificationSettings = () => native(() => Duty.openNotificationSettings())
export const requestNativeNotifications = async () => (await native(() => Duty.requestNotificationPermission()))?.granted ?? false

let listening: Promise<PluginListenerHandle> | null = null
const APP_VERSION = '1.0'

const save = (token: string) =>
  supabase.rpc('save_device_token', { p_platform: 'android', p_token: token, p_app_version: APP_VERSION })

/** Saves this device's push token for the signed-in person and keeps it saved when Firebase renews it. True when a token is saved. */
export async function registerNativePushToken(): Promise<boolean> {
  const got = await native(() => Duty.getPushToken())
  if (!got?.token) return false
  // The RPC may be missing on an older database; a renewal that fails to save is retried on the next app start.
  listening ??= Duty.addListener('pushToken', (e) => void save(e.token).then(() => undefined, () => undefined))
  const { error } = await save(got.token)
  return !error
}

/** Forgets this device's token on the server (the person turned notifications off). */
export async function unregisterNativePushToken(): Promise<void> {
  const got = await native(() => Duty.getPushToken())
  if (got?.token) await supabase.rpc('delete_device_token', { p_token: got.token }).then(() => undefined, () => undefined)
}
