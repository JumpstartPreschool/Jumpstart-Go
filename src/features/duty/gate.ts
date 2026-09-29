import type { Trip } from '../trips/api'
import { cancelled, message, PICKUP_PERSON, type Phase } from '../../../supabase/functions/_shared/announce.ts'

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

/** Up to this long before the chosen time counts as "about five minutes"; up to TEN_MS as "about ten minutes". */
const FIVE_MS = 7 * 60_000
const TEN_MS = 12 * 60_000

/**
 * How far the trip has got: at the gate once the parent taps "I've arrived"; otherwise from the time they chose. A trip
 * past its time without an arrival is still on the way. Worked out afresh each time, so after a reconnect the gate
 * hears where the trip is now, never a backlog.
 */
export function phaseOf(trip: Trip, nowMs: number): Phase {
  if (trip.arrived_at) return 'arrived'
  const left = Date.parse(trip.arrive_at) - nowMs
  return left > 0 && left <= FIVE_MS ? 'five' : left > 0 && left <= TEN_MS ? 'ten' : 'onway'
}

/** Outside the usual time, arriving within five minutes, or at the gate: "Urgent new announcement.", red, played first. */
export function isUrgent(trip: Trip, nowMs: number): boolean {
  return trip.off_schedule || !!trip.arrived_at || Date.parse(trip.arrive_at) - nowMs <= SOON_MS
}

/**
 * What the iPad says (the templates in _shared/announce.ts): the child, who is coming and how soon, and for a pickup
 * "Please get … ready." The class, the time and any reason are on screen, not spoken, so every message is made ahead.
 */
export function spokenText(trip: Trip, child: GateChild, nowMs = Date.now()): string {
  const who = trip.traveller_kind === 'third_person' ? PICKUP_PERSON : trip.traveller_relation
  return message(trip.direction, phaseOf(trip, nowMs), child, who)
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
