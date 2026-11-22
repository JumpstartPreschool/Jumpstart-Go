import type { PushState } from '../notifications/push'
import { formatTime, indiaClock } from '../../domain/time'

/**
 * Duty, connection and notifications are three separate facts (0061). Duty is the server's (app.gate_duty, changed only
 * by set_duty from an explicit tap); connection is whether this device can reach the school now; notifications are
 * whether alerts can reach this device when it is locked. None of them is ever inferred from another, and nothing about
 * the app being hidden, locked, reloaded or offline changes duty.
 */
export type DutyStatus = 'active' | 'paused'
export interface DutyState {
  status: DutyStatus
  started_at: string
  paused_at: string | null
  resumed_at: string | null
  changed_at: string
  change_reason: string | null
  version: number
}

/** The server's answer (my_duty, set_duty) as a duty, or null for off duty or anything malformed. */
export function parseDuty(v: unknown): DutyState | null {
  if (!v || typeof v !== 'object') return null
  const d = v as Record<string, unknown>
  if ((d.status !== 'active' && d.status !== 'paused') || typeof d.version !== 'number' || typeof d.started_at !== 'string') return null
  return {
    status: d.status, version: d.version, started_at: d.started_at, changed_at: String(d.changed_at ?? d.started_at),
    paused_at: typeof d.paused_at === 'string' ? d.paused_at : null,
    resumed_at: typeof d.resumed_at === 'string' ? d.resumed_at : null,
    change_reason: typeof d.change_reason === 'string' ? d.change_reason : null,
  }
}

/** A newer device changed the duty since this one last looked (set_duty refused with duty_conflict). */
export const isDutyConflict = (e: { message?: string } | null | undefined) => !!e?.message?.startsWith('duty_conflict')

// The last duty the server confirmed, per person, so a reopened app with no connection still shows it (as unconfirmed).
const cacheKey = (uid: string) => `jumpstart.duty.${uid}`
export function readCachedDuty(uid: string): { duty: DutyState | null; at: number } | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(uid))
    if (!raw) return undefined
    const v = JSON.parse(raw) as { duty: unknown; at: number }
    return typeof v.at === 'number' ? { duty: parseDuty(v.duty), at: v.at } : undefined
  } catch {
    return undefined
  }
}
export function writeCachedDuty(uid: string, duty: DutyState | null, at: number): void {
  try { localStorage.setItem(cacheKey(uid), JSON.stringify({ duty, at })) } catch { /* storage blocked: the server is asked again */ }
}

/** A duty time: "4:00 PM" today, else with its day ("yesterday, 4:00 PM", "Tue 20 Oct, 4:00 PM"): duty runs past midnight. */
export function dutyTime(ms: number, nowMs = Date.now()): string {
  const at = indiaClock(new Date(ms))
  const time = formatTime(at.minutes)
  if (at.date === indiaClock(new Date(nowMs)).date) return time
  if (at.date === indiaClock(new Date(nowMs - 86_400_000)).date) return `yesterday, ${time}`
  return `${new Date(`${at.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${time}`
}

/** Signing out forgets the cached duties: a stale one would otherwise hold back this device's updates for good. */
export function clearCachedDuties(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith('jumpstart.duty.')) localStorage.removeItem(k)
    }
  } catch { /* storage blocked */ }
}

/** True when this device last saw someone's duty Active or Paused: app updates then wait for a tap, never reload mid-duty. */
export function dutyOnThisDevice(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('jumpstart.duty.') && readCachedDuty(k.slice('jumpstart.duty.'.length))?.duty) return true
    }
  } catch { /* storage blocked */ }
  return false
}

export type Connectivity = 'online' | 'offline' | 'reconnecting' | 'unknown'
/**
 * Online only when the school actually answered recently: the browser saying it has a network is not enough (a
 * suspended page's WebSocket is gone, a captive Wi-Fi answers nothing).
 */
export function connectivityOf(o: { browserOnline: boolean; lastOkAt: number | null; lastFailAt: number | null; nowMs: number }): Connectivity {
  if (!o.browserOnline) return 'offline'
  if (o.lastFailAt !== null && (o.lastOkAt === null || o.lastFailAt > o.lastOkAt)) return 'reconnecting'
  if (o.lastOkAt === null) return 'unknown'
  return o.nowMs - o.lastOkAt < 90_000 ? 'online' : 'reconnecting'
}

export type NotificationReadiness = 'ready' | 'permission' | 'unavailable' | 'unsupported'
/** Whether alerts can reach this device when it's locked, from the push state alone. */
export function notificationReadiness(push: PushState | null | undefined): NotificationReadiness | null {
  switch (push) {
    case undefined: case null: return null
    case 'on': return 'ready'
    case 'off': case 'denied': case 'needs-install': return 'permission'
    case 'not-configured': return 'unavailable'
    case 'unsupported': return 'unsupported'
  }
}
