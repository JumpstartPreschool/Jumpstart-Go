import type { Trip } from '../trips/api'
import { clockTime } from '../trips/rules'

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

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name

/** Who is coming, as said aloud: "Aarav's mother, Sneha", or just "Sneha" when there's no relation. */
function who(trip: Trip, child: GateChild): string {
  return trip.traveller_relation ? `${child.name}'s ${trip.traveller_relation.toLowerCase()}, ${first(trip.traveller_name)},` : first(trip.traveller_name)
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
 * Short sentences on purpose: the studio voice makes each sentence once, and the child's, the person's and the time's
 * sentences repeat day after day, so almost every announcement is already made (see sound.ts).
 */
export function spokenText(trip: Trip, child: GateChild, nowMs = Date.now()): string {
  const kind = trip.direction === 'pickup' ? 'Pickup' : 'Drop-off'
  const changed = Date.parse(trip.updated_at) - Date.parse(trip.created_at) > 5_000 ? 'Time changed. ' : ''
  const when = Date.parse(trip.arrive_at) - nowMs <= SOON_MS ? 'Arriving now.' : `Arriving about ${clockTime(trip.arrive_at)}.`
  const reason = trip.off_schedule && trip.reason ? ` Reason: ${trip.reason}.` : ''
  const ready = trip.direction === 'pickup' ? ` Please get ${child.name} ready.` : ''
  return `${changed}${kind} for ${child.fullName}, ${child.className}. ${who(trip, child)} is on the way. ${when}${reason}${ready}`
}

export function cancelledText(trip: Trip, child: GateChild): string {
  return `${trip.direction === 'pickup' ? 'Pickup' : 'Drop-off'} for ${child.fullName} is cancelled.`
}

/**
 * Should this iPad announce the trip now? Its own classes at once; a class nobody covers at once;
 * anything else only after the fallback time with no answer.
 */
export function shouldAnnounce(trip: Trip, classId: string, myClasses: ReadonlySet<string>, covered: ReadonlySet<string>, nowMs: number): boolean {
  if (trip.status !== 'en_route' || trip.acknowledged_at) return false
  return myClasses.has(classId) || !covered.has(classId) || nowMs - Date.parse(trip.updated_at) >= FALLBACK_MS
}
