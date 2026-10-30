import type { Trip } from '../trips/api'
import type { Announcer } from './announcer'
import type { GateSettings } from '../../../supabase/functions/_shared/gateAnnounce.ts'
import { announceStage, cancelledText, isLate, isUrgent, lateText, LATE_NEWS_MS, PRIORITY, priorityOf, spokenText, stageOf } from '../../../supabase/functions/_shared/gateTrip.ts'

// The trip's words and stages live in _shared/gateTrip.ts, so push-send's background announcements say the same.
export { announceStage, cancelledText, isLate, isUrgent, lateText, PRIORITY, priorityOf, spokenText, stageOf, type Stage } from '../../../supabase/functions/_shared/gateTrip.ts'

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
        const freshLate = !!lateKey && memory.lateHeard.get(t.id) !== lateKey && nowMs - Date.parse(t.late_at!) < LATE_NEWS_MS
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
