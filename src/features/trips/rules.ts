import type { ProgrammeRow } from '../admin/api'
import { formatTime, indiaClock, toMinutes, type Minutes } from '../../domain/time'

/** Midnight: a trip is always for today. */
const LAST_MINUTE: Minutes = 24 * 60
import { windowFor, type Direction, type Programme, type TimeWindow } from '../../domain/programme'

/** How soon a parent can say they'll arrive (the "I'm on my way" choices, in minutes). */
export const MINUTE_CHOICES = [5, 10, 15] as const
export const REASONS = ["Doctor's visit", 'Family event', 'Not feeling well', 'Other'] as const

const hm = (t: string) => toMinutes(t.slice(0, 5))

/** A programme as stored (the database row) → the timing rules (domain/programme). */
export function programmeOf(p: Pick<ProgrammeRow, 'name' | 'flexible' | 'starts' | 'ends' | 'weekdays' | 'saturday_rule' | 'term_start' | 'term_end' | 'dropoff_from' | 'dropoff_to' | 'pickup_from' | 'pickup_to'>): Programme {
  return {
    name: p.name,
    weekdays: p.weekdays ?? [1, 2, 3, 4, 5],
    saturdayRule: p.saturday_rule ?? 'every',
    term: p.term_start && p.term_end ? { start: p.term_start, end: p.term_end } : null,
    hours: { from: hm(p.starts), to: hm(p.ends) },
    windows: p.flexible || !p.dropoff_from || !p.dropoff_to || !p.pickup_from || !p.pickup_to
      ? 'flexible'
      : { dropoff: { from: hm(p.dropoff_from), to: hm(p.dropoff_to) }, pickup: { from: hm(p.pickup_from), to: hm(p.pickup_to) } },
  }
}

export type Arrival = 'closed' | 'early' | 'inside' | 'late'

/** Where an arrival time falls: past midnight (not allowed: a trip is for today), or early, inside or late for the child's window (0026: any hour). */
export function checkArrival(p: Programme, direction: Direction, arrival: Minutes): Arrival {
  if (arrival >= LAST_MINUTE) return 'closed'
  const w = windowFor(p, direction)
  return arrival < w.from ? 'early' : arrival > w.to ? 'late' : 'inside'
}

/** "12:30–1:00 PM", or "9:00 AM–1:00 PM" when the window crosses noon. */
export function formatRange(w: TimeWindow): string {
  const [a, b] = [formatTime(w.from), formatTime(w.to)]
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`
}

export const clockTime = (iso: string) => formatTime(indiaClock(new Date(iso)).minutes)

/**
 * Times someone can be booked to arrive (the Screen Book's "Arriving about"): the child's window, plus 15 minutes either
 * side of a short one, every 5 minutes (every 15 for a long window), from 10 minutes from now. Once the window has
 * passed, the next times until midnight, marked late. Each says where it falls, so early or late can ask why.
 */
export function arrivalSlots(p: Programme, direction: Direction, nowMin: Minutes, count = 12): Array<{ at: Minutes; state: Arrival }> {
  const w = windowFor(p, direction)
  const wide = w.to - w.from > 60
  const step = wide ? 15 : 5
  const soonest = Math.ceil((nowMin + 10) / step) * step
  const around = (from: Minutes, to: Minutes) => {
    const out: Array<{ at: Minutes; state: Arrival }> = []
    for (let t = Math.max(0, soonest, from); t <= Math.min(LAST_MINUTE - step, to) && out.length < count; t += step) out.push({ at: t, state: checkArrival(p, direction, t) })
    return out
  }
  const inWindow = around(wide ? w.from : w.from - 15, wide ? w.to : w.to + 15)
  return inWindow.length ? inWindow : around(soonest, LAST_MINUTE)
}
