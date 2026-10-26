import type { PushState } from './push'

/** This device's own evidence (0059): when it last displayed a test alert, and when someone said they heard one. */
export interface DeviceEvidence { lastTestAt: string | null; testHeardAt: string | null }

export type ReadinessStatus = 'ready' | 'setup' | 'blocked' | 'unsupported' | 'attention'
export interface Readiness { status: ReadinessStatus; label: string; detail: string }

const FRESH_MS = 7 * 24 * 60 * 60_000
const LABEL: Record<ReadinessStatus, string> = { ready: 'Ready', setup: 'Setup required', blocked: 'Notifications blocked', unsupported: 'Unsupported', attention: 'Needs attention' }
const said = (status: ReadinessStatus, detail: string): Readiness => ({ status, label: LABEL[status], detail })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

/**
 * Whether alerts can reach this device while it is locked, said only from evidence. Permission and a saved subscription
 * are not enough for Ready: this device must have displayed a test alert, and a person must have heard it, both in the
 * last 7 days. Even then the device's Silent mode, Focus or volume can mute the next one, and the detail says so.
 */
export function readinessOf(push: PushState, device: DeviceEvidence | null, nowMs: number, nativeApp = false): Readiness {
  switch (push) {
    case 'unsupported': return said('unsupported', "This browser can't receive alerts while locked. Keep Jumpstart Go open with the screen on, or use Chrome on Android or the Home Screen app on iPhone and iPad.")
    case 'not-configured': return said('attention', "Notifications aren't set up for the school yet. Ask the admin. Until then, keep Jumpstart Go open with the screen on.")
    case 'needs-install': return said('setup', 'On iPhone and iPad, alerts only reach the Home Screen app. Tap Share, then Add to Home Screen, then open Jumpstart Go from there and sign in.')
    case 'denied': return said('blocked', "Notifications are blocked for Jumpstart Go. Open the device's Settings, find Jumpstart Go (or the browser), choose Notifications, allow them and turn Sounds on.")
    case 'off': return said('setup', 'Turn on notifications so a locked or sleeping screen still tells you when a parent is on the way.')
    case 'on': break
  }
  if (nativeApp) return said('attention', "Notifications are on in the Android app. Send a test alert and lock the screen: within a few seconds you should hear the chime and the sound check in the school's voice.")
  const tested = device?.lastTestAt && nowMs - Date.parse(device.lastTestAt) < FRESH_MS ? device.lastTestAt : null
  const heard = device?.testHeardAt && nowMs - Date.parse(device.testHeardAt) < FRESH_MS ? device.testHeardAt : null
  if (!tested) return said('attention', 'Notifications are on, but no test alert has reached this device this week. Send one and lock the screen.')
  if (!heard) return said('attention', `A test alert reached this device on ${day(tested)}. Send another and confirm you can hear it.`)
  return said('ready', `A test alert reached this device on ${day(tested)} and was heard. Silent mode, Focus or a low volume can still mute alerts: keep the volume up.`)
}
