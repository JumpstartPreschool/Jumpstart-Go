/**
 * Where a gate request is and what the gate says about it, from the trip alone. Shared by the duty screen
 * (src/features/duty/gate.ts) and push-send, so a phone announcing in the background says the very words, and so plays the
 * very recording, the duty screen would play at that moment.
 */
import { etaOf, messageFor, PICKUP_PERSON, type GateSettings, type Kind } from './gateAnnounce.ts'

/** The trip fields the gate's words depend on (public.trips). */
export interface GateTrip {
  direction: Kind
  arrive_at: string
  off_schedule: boolean
  traveller_relation: string | null
  traveller_kind?: 'guardian' | 'third_person'
  arrived_at?: string | null
  late_at?: string | null
}

/** The child as the words need them: the registered name, the name used day to day, and the programme. */
export interface SpokenChild { fullName: string; name: string; programmeName: string }

/**
 * Where a trip is, from the authoritative arrive_at and now, against the admin's timings (0042): further out than the
 * early announcement, then early, get ready, urgent, due (the time has come with no arrival) and arrived. Worked out
 * afresh every time, so after a change of time or a reconnect the gate hears where the trip is now, never a backlog.
 */
export type Stage = 'far' | 'early' | 'ready' | 'urgent' | 'due' | 'arrived'

export function stageOf(trip: GateTrip, nowMs: number, s: GateSettings): Stage {
  if (trip.arrived_at) return 'arrived'
  const left = (Date.parse(trip.arrive_at) - nowMs) / 60_000
  if (left <= 1) return 'due'
  if (left <= s.urgent_min) return 'urgent'
  if (left <= s.ready_min) return 'ready'
  if (left <= s.early_min) return 'early'
  return 'far'
}

/**
 * The stages the gate hears as a new announcement. Due follows urgent without one: its reminders say "any moment now".
 */
export const announceStage = (st: Stage): Exclude<Stage, 'due'> => (st === 'due' ? 'urgent' : st)

/** At the gate, due or within the urgent time, or outside the usual time: "Urgent new announcement.", red. */
export function isUrgent(trip: GateTrip, nowMs: number, s: GateSettings): boolean {
  const st = stageOf(trip, nowMs, s)
  return trip.off_schedule || st === 'arrived' || st === 'due' || st === 'urgent'
}

/**
 * The queue's order, fixed by the system whatever the admin's wording: arrived, then due or within the urgent time,
 * then outside the usual time, then everything else. Reminders come after new announcements (announcer.ts), and
 * within one priority the earliest arrival goes first.
 */
export const PRIORITY = { arrived: 50, urgent: 40, late: 35, offSchedule: 30, normal: 20, cancelled: 0 } as const
/** Before it is said again, a reminder sorts after every new announcement (announcer.ts and the Android app). */
export const REMINDER_PENALTY = 1000
export function priorityOf(trip: GateTrip, nowMs: number, s: GateSettings): number {
  const st = stageOf(trip, nowMs, s)
  return st === 'arrived' ? PRIORITY.arrived : st === 'urgent' || st === 'due' ? PRIORITY.urgent
    : isLate(trip) ? PRIORITY.late : trip.off_schedule ? PRIORITY.offSchedule : PRIORITY.normal
}

/** The parent said they're running late (0043) and hasn't arrived: "Running late" on the gate, and its own update. */
export const isLate = (trip: GateTrip) => !!trip.late_at && !trip.arrived_at

const who = (trip: GateTrip) => (trip.traveller_kind === 'third_person' ? PICKUP_PERSON : trip.traveller_relation)
const announced = (child: SpokenChild) => ({ fullName: child.fullName, name: child.name, programme: child.programmeName })

/**
 * What the gate says after the opening, from the admin's template: the child, who is coming, when (from arrive_at and
 * now, so a reminder always has the time left now), and for a pickup "Please get … ready." The class, any reason and
 * any phone number stay on screen.
 */
export function spokenText(trip: GateTrip, child: SpokenChild, nowMs: number, s: GateSettings): string {
  const arriveAt = Date.parse(trip.arrive_at)
  const event = trip.arrived_at
    ? { kind: trip.direction, state: 'arrived' } as const
    : { kind: trip.direction, state: 'eta', eta: etaOf(arriveAt, nowMs), arriveAt: new Date(arriveAt) } as const
  return messageFor(s, event, announced(child), who(trip))
}

/** The running-late update, said once when the parent taps Running late: "Pickup update. … is running late and will arrive …". */
export function lateText(trip: GateTrip, child: SpokenChild, nowMs: number, s: GateSettings): string {
  const arriveAt = Date.parse(trip.arrive_at)
  return messageFor(s, { kind: trip.direction, state: 'late', eta: etaOf(arriveAt, nowMs), arriveAt: new Date(arriveAt) }, announced(child), who(trip))
}

export function cancelledText(trip: GateTrip, child: SpokenChild, s: GateSettings): string {
  return messageFor(s, { kind: trip.direction, state: 'cancelled' }, announced(child), who(trip))
}

/** A running-late update stays news for this long (syncGate says it once within it). */
export const LATE_NEWS_MS = 10 * 60_000

/** One gate alert as a phone announces it in the background: the duty screen's words, chime and place in the queue. */
export interface PhoneAnnouncement { text: string; chime: 'normal' | 'flagged'; priority: number; order: number }

/**
 * The phone's announcement for a gate alert about this trip, as the duty screen would make it now (syncGate): a running
 * late update in its own words the first time, the reminder's words with the time left now, the urgent chime when it is
 * urgent, and a reminder queued after every new announcement.
 */
export function phoneAnnouncement(trip: GateTrip, child: SpokenChild, nowMs: number, s: GateSettings, reminder: boolean): PhoneAnnouncement {
  const freshLate = !reminder && isLate(trip) && nowMs - Date.parse(trip.late_at!) < LATE_NEWS_MS
  return {
    text: freshLate ? lateText(trip, child, nowMs, s) : spokenText(trip, child, nowMs, s),
    chime: freshLate || isUrgent(trip, nowMs, s) ? 'flagged' : 'normal',
    priority: priorityOf(trip, nowMs, s) - (reminder ? REMINDER_PENALTY : 0),
    order: Date.parse(trip.arrive_at),
  }
}
