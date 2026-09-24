import type { Trip } from '../trips/api'
import { clockTime } from '../trips/rules'

/** Nobody answered on the class's iPads in this time: every coordinator on duty hears it (PRD D11). */
export const FALLBACK_MS = 120_000

export interface GateChild {
  id: string
  name: string
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

/**
 * What the iPad says. It names the arrival time rather than "in 20 minutes", so a repeat two minutes later is still true.
 */
export function spokenText(trip: Trip, child: GateChild): string {
  const at = clockTime(trip.arrive_at)
  const update = Date.parse(trip.updated_at) - Date.parse(trip.created_at) > 5_000 ? 'New time. ' : ''
  const flag = trip.off_schedule && trip.reason ? `Outside the usual time: ${trip.reason}. ` : ''
  return trip.direction === 'pickup'
    ? `${update}${flag}Please get ${child.fullName} ready for pickup. ${who(trip, child)} arrives at about ${at}.`
    : `${update}${flag}${child.fullName} is coming for drop-off. ${who(trip, child)} arrives at about ${at}.`
}

export function cancelledText(trip: Trip, child: GateChild): string {
  return `${child.fullName}'s ${trip.direction === 'pickup' ? 'pickup' : 'drop-off'} is cancelled.`
}

/**
 * Should this iPad announce the trip now? Its own classes at once; a class nobody covers at once;
 * anything else only after the fallback time with no answer.
 */
export function shouldAnnounce(trip: Trip, classId: string, myClasses: ReadonlySet<string>, covered: ReadonlySet<string>, nowMs: number): boolean {
  if (trip.status !== 'en_route' || trip.acknowledged_at) return false
  return myClasses.has(classId) || !covered.has(classId) || nowMs - Date.parse(trip.updated_at) >= FALLBACK_MS
}
