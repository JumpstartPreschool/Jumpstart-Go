import type { ProgrammeRow } from '../admin/api'
import { formatTime, indiaClock, toMinutes, type Minutes } from '../../domain/time'
import type { Programme, TimeWindow } from '../../domain/programme'

/** Midnight: a trip is always for today. */
const LAST_MINUTE: Minutes = 24 * 60

/** How soon a parent can say they'll arrive (the "I'm on my way" choices, in minutes). */
export const MINUTE_CHOICES = [5, 10, 15] as const

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

/** Past midnight: not allowed, since a trip is always for today. Any other time is fine (D56). */
export const pastMidnight = (arrival: Minutes) => arrival >= LAST_MINUTE

/** "12:30–1:00 PM", or "9:00 AM–1:00 PM" when the window crosses noon. */
export function formatRange(w: TimeWindow): string {
  const [a, b] = [formatTime(w.from), formatTime(w.to)]
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`
}

export const clockTime = (iso: string) => formatTime(indiaClock(new Date(iso)).minutes)

/**
 * Times someone can be booked to arrive (the Screen Book's "Arriving about"): every 15 minutes from 10 minutes from now,
 * between `from` and `to` (the limit of whatever is being booked), never past midnight. Any time is fine (D56): nothing
 * is checked against the child's programmes.
 */
export function arrivalSlots(nowMin: Minutes, { from = 0, to = LAST_MINUTE - 5 }: { from?: Minutes; to?: Minutes } = {}): Minutes[] {
  const step = 15
  const out: Minutes[] = []
  for (let t = Math.max(from, Math.ceil((nowMin + 10) / step) * step); t <= Math.min(to, LAST_MINUTE - 5); t += step) out.push(t)
  return out
}
