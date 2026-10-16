import type { Trip } from '../trips/api'
import type { Announcer } from './announcer'
import { etaOf, messageFor, PICKUP_PERSON, type GateSettings } from '../../../supabase/functions/_shared/gateAnnounce.ts'

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

/**
 * Where a trip is, from the authoritative arrive_at and now, against the admin's timings (0042): further out than the
 * early announcement, then early, get ready, urgent, due (the time has come with no arrival) and arrived. Worked out
 * afresh every time, so after a change of time or a reconnect the gate hears where the trip is now, never a backlog.
 */
export type Stage = 'far' | 'early' | 'ready' | 'urgent' | 'due' | 'arrived'

export function stageOf(trip: Trip, nowMs: number, s: GateSettings): Stage {
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
export function isUrgent(trip: Trip, nowMs: number, s: GateSettings): boolean {
  const st = stageOf(trip, nowMs, s)
  return trip.off_schedule || st === 'arrived' || st === 'due' || st === 'urgent'
}

/**
 * The queue's order, fixed by the system whatever the admin's wording: arrived, then due or within the urgent time,
 * then outside the usual time, then everything else. Reminders come after new announcements (announcer.ts), and
 * within one priority the earliest arrival goes first.
 */
export const PRIORITY = { arrived: 50, urgent: 40, late: 35, offSchedule: 30, normal: 20, cancelled: 0 } as const
export function priorityOf(trip: Trip, nowMs: number, s: GateSettings): number {
  const st = stageOf(trip, nowMs, s)
  return st === 'arrived' ? PRIORITY.arrived : st === 'urgent' || st === 'due' ? PRIORITY.urgent
    : isLate(trip) ? PRIORITY.late : trip.off_schedule ? PRIORITY.offSchedule : PRIORITY.normal
}

/** The parent said they're running late (0043) and hasn't arrived: "Running late" on the gate, and its own update. */
export const isLate = (trip: Trip) => !!trip.late_at && !trip.arrived_at

const who = (trip: Trip) => (trip.traveller_kind === 'third_person' ? PICKUP_PERSON : trip.traveller_relation)
const announced = (child: GateChild) => ({ fullName: child.fullName, name: child.name, programme: child.programmeName })

/**
 * What the iPad says after the opening, from the admin's template: the child, who is coming, when (from arrive_at and
 * now, so a reminder always has the time left now), and for a pickup "Please get … ready." The class, any reason and
 * any phone number stay on screen.
 */
export function spokenText(trip: Trip, child: GateChild, nowMs: number, s: GateSettings): string {
  const arriveAt = Date.parse(trip.arrive_at)
  const event = trip.arrived_at
    ? { kind: trip.direction, state: 'arrived' } as const
    : { kind: trip.direction, state: 'eta', eta: etaOf(arriveAt, nowMs), arriveAt: new Date(arriveAt) } as const
  return messageFor(s, event, announced(child), who(trip))
}

/** The running-late update, said once when the parent taps Running late: "Pickup update. … is running late and will arrive …". */
export function lateText(trip: Trip, child: GateChild, nowMs: number, s: GateSettings): string {
  const arriveAt = Date.parse(trip.arrive_at)
  return messageFor(s, { kind: trip.direction, state: 'late', eta: etaOf(arriveAt, nowMs), arriveAt: new Date(arriveAt) }, announced(child), who(trip))
}

export function cancelledText(trip: Trip, child: GateChild, s: GateSettings): string {
  return messageFor(s, { kind: trip.direction, state: 'cancelled' }, announced(child), who(trip))
}

/** Handled: closed, cancelled, or acknowledged with no arrival since. Its lock-screen alerts are out of date. */
export const settled = (trip: Trip): boolean =>
  trip.status !== 'en_route' || (!!trip.acknowledged_at && !(trip.arrived_at && Date.parse(trip.arrived_at) > Date.parse(trip.acknowledged_at)))

/**
 * Should this iPad announce the trip now? Its own classes at once; a class nobody covers at once; anything else only
 * after the fallback time with no answer. Once acknowledged it stays quiet, until the parent taps "I've arrived".
 */
export function shouldAnnounce(trip: Trip, classId: string, myClasses: ReadonlySet<string>, covered: ReadonlySet<string>, nowMs: number): boolean {
  if (settled(trip)) return false
  return myClasses.has(classId) || !covered.has(classId) || nowMs - Date.parse(trip.updated_at) >= FALLBACK_MS
}

/**
 * What the gate queue remembers between passes: each trip's last announced version, cancellations already said, and
 * each trip's last running-late update already said (by the time it replaced, which changes with every update).
 */
export interface GateMemory {
  announced: Map<string, string>
  cancelHeard: Set<string>
  lateHeard: Map<string, string>
  /** When this iPad started listening. A running-late update from before then was announced (or missed) in an earlier session: a reload never repeats it. */
  since?: number
}

/**
 * One pass over today's trips (every few seconds and on every change): new trips are announced, each again as a new
 * announcement at the admin's stages (early, get ready, urgent, arrived), with reminders in between that say the time
 * left at that moment. A new time from the parent (running late, change time) is a new version, so it replaces what was
 * queued and nothing for the old time plays. A cancellation stops the trip's announcements and is said once.
 */
export function syncGate(
  trips: readonly Trip[],
  gate: { children: ReadonlyMap<string, GateChild>; myClasses: ReadonlySet<string>; covered: ReadonlySet<string> },
  nowMs: number,
  s: GateSettings,
  current: () => GateSettings,
  memory: GateMemory,
  announcer: Pick<Announcer, 'announce' | 'acknowledge' | 'warm'>,
): void {
  for (const t of trips) {
    const child = gate.children.get(t.child_id)
    if (!child) continue
    const id = `trip:${t.id}`
    if (t.status === 'en_route' && shouldAnnounce(t, child.classId, gate.myClasses, gate.covered, nowMs)) {
      const version = `${t.updated_at}|${t.arrive_at}|${announceStage(stageOf(t, nowMs, s))}`
      if (memory.announced.get(t.id) !== version) {
        memory.announced.set(t.id, version)
        const urgent = isUrgent(t, nowMs, s)
        // A new running-late update (said within the last 10 minutes, once): its own words the first time.
        const lateKey = isLate(t) && t.late_from ? `${t.late_from}|${t.arrive_at}` : null
        const freshLate = !!lateKey && memory.lateHeard.get(t.id) !== lateKey && nowMs - Date.parse(t.late_at!) < 10 * 60_000
          && (memory.since === undefined || Date.parse(t.late_at!) >= memory.since)
        if (lateKey) memory.lateHeard.set(t.id, lateKey)
        announcer.announce({
          id, childId: t.child_id, urgent, chime: urgent || freshLate ? 'flagged' : 'normal', priority: priorityOf(t, nowMs, s), order: Date.parse(t.arrive_at),
          // Made when spoken, from arrive_at and that moment, with the settings the iPad has then.
          text: () => spokenText(t, child, Date.now(), current()),
          ...(freshLate ? { first: () => lateText(t, child, Date.now(), current()) } : {}),
        })
      }
      // The next reminder's words, ready ahead: a time not recorded ahead (twenty minutes, say) is made now.
      if (!t.arrived_at) announcer.warm(spokenText(t, child, nowMs + s.reminder_min * 60_000, s), t.child_id)
    } else if (memory.announced.has(t.id)) {
      memory.announced.delete(t.id)
      announcer.acknowledge(id)
    }
    // A cancellation is said once, if it happened in the last 10 minutes, on the iPads that would announce the trip.
    const mine = gate.myClasses.has(child.classId) || !gate.covered.has(child.classId)
    if (t.status === 'cancelled' && mine && nowMs - Date.parse(t.updated_at) < 10 * 60_000 && !memory.cancelHeard.has(t.id)) {
      memory.cancelHeard.add(t.id)
      announcer.announce({ id: `${id}:cancel`, childId: t.child_id, text: cancelledText(t, child, current()), chime: 'normal', priority: PRIORITY.cancelled, once: true })
    }
  }
}
