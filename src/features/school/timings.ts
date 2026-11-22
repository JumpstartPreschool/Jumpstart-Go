import type { Minutes } from '../../domain/time'

export const GATE_OPENS = 525 // 8:45 AM
export const GATE_CLOSES = 1155 // 7:15 PM
export type Range = [Minutes, Minutes]

/** Where new timings start (the school's rule, D24): drop-off the 15 minutes before, pickup the 15 after; an extended day until 7 PM. */
export function ruleWindows(starts: Minutes, ends: Minutes, extended: boolean): { dropoff: Range; pickup: Range } {
  return { dropoff: [extended && starts > 540 ? 540 : starts - 15, starts], pickup: [ends, extended ? Math.max(ends, 1140) : Math.min(ends + 15, GATE_CLOSES)] }
}

/** What's wrong with a set of timings, in the database's words (0019), or nothing. */
export function timingProblems(starts: Minutes, ends: Minutes, d: Range, p: Range): { hours?: string; dropoff?: string; pickup?: string } {
  const out: { hours?: string; dropoff?: string; pickup?: string } = {}
  if (ends < starts + 30) out.hours = 'At least 30 minutes after the start.'
  if (d[0] < GATE_OPENS) out.dropoff = 'The gate opens at 8:45 AM.'
  else if (d[0] >= d[1]) out.dropoff = 'Drop-off must end after it starts.'
  else if (d[1] > ends) out.dropoff = 'Drop-off must close by the time the class ends.'
  if (p[1] > GATE_CLOSES) out.pickup = 'The gate closes at 7:15 PM.'
  else if (p[0] >= p[1]) out.pickup = 'Pickup must end after it starts.'
  else if (p[0] < starts) out.pickup = "Pickup can't open before the class starts."
  return out
}
