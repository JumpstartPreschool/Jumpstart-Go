import type { Trip } from '../trips/api'
import { clockTime } from '../trips/rules'
import { ARRIVING_NOW, arrivingAbout, cancelled, getReady, kindFor, onTheWay, TIME_CHANGED } from '../../../supabase/functions/_shared/announce.ts'

/** Nobody answered on the class's iPads in this time: every coordinator on duty hears it (PRD D11). */
export const FALLBACK_MS = 120_000

export interface GateChild {
  id: string
  name: string
  gender?: string | null
  fullName: string
  classId: string
  className: string
  programmeName: string
}

/** Arriving within this long counts as now: the child should be at the gate already. */
export const SOON_MS = 5 * 60_000

/** Outside the usual time, or arriving within five minutes: said with "Urgent." first, shown in red, played first. */
export function isUrgent(trip: Trip, nowMs: number): boolean {
  return trip.off_schedule || Date.parse(trip.arrive_at) - nowMs <= SOON_MS
}

/**
 * What the iPad says, most important first: pickup or drop-off and the child, who is coming, when, then any reason.
 * It names the arrival time rather than "in 20 minutes", so a repeat two minutes later is still true.
 * Short sentences on purpose: each is one voice clip, and the child's, the collector's and the time's sentences repeat
 * day after day, so they're made ahead of time (supabase/functions/_shared/announce.ts) and play at once.
 */
export function spokenText(trip: Trip, child: GateChild, nowMs = Date.now()): string {
  const changed = Date.parse(trip.updated_at) - Date.parse(trip.created_at) > 5_000 ? TIME_CHANGED : ''
  // Said to the nearest 5 minutes ("about"): those sentences are made ahead in the school's voice, an exact 3:17 isn't.
  const at = new Date(Math.round(Date.parse(trip.arrive_at) / 300_000) * 300_000).toISOString()
  const when = Date.parse(trip.arrive_at) - nowMs <= SOON_MS ? ARRIVING_NOW : arrivingAbout(clockTime(at))
  const reason = trip.off_schedule && trip.reason ? ` Reason: ${trip.reason}.` : ''
  const ready = trip.direction === 'pickup' ? ` ${getReady(child.name)}` : ''
  return `${changed}${kindFor(trip.direction, child.fullName, child.className)} ${onTheWay(child.name, trip.traveller_relation, trip.traveller_name)} ${when}${reason}${ready}`
}

export function cancelledText(trip: Trip, child: GateChild): string {
  return cancelled(trip.direction, child.fullName)
}

/**
 * Should this iPad announce the trip now? Its own classes at once; a class nobody covers at once;
 * anything else only after the fallback time with no answer.
 */
export function shouldAnnounce(trip: Trip, classId: string, myClasses: ReadonlySet<string>, covered: ReadonlySet<string>, nowMs: number): boolean {
  if (trip.status !== 'en_route' || trip.acknowledged_at) return false
  return myClasses.has(classId) || !covered.has(classId) || nowMs - Date.parse(trip.updated_at) >= FALLBACK_MS
}
