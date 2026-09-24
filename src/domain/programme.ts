import { GATE_CLOSES, GATE_OPENS, SCHOOL_CLOSES, SCHOOL_OPENS, weekdayOf, type Minutes } from './time'

export type Direction = 'dropoff' | 'pickup'
export type SaturdayRule = 'every' | 'except_2nd_and_last'

export interface TimeWindow {
  from: Minutes
  to: Minutes
}

/** A timing plan (PRD D19), e.g. "Jr KG · Half day" or "Learning Center". */
export interface Programme {
  name: string
  /** 1 = Monday … 6 = Saturday. The school never runs on Sunday. */
  weekdays: readonly number[]
  saturdayRule: SaturdayRule
  /** Inclusive YYYY-MM-DD dates; null means all year. */
  term: { start: string; end: string } | null
  hours: TimeWindow
  /** Fixed windows, or 'flexible': any time within the hours (Learning Center, 360°+). */
  windows: { dropoff: TimeWindow; pickup: TimeWindow } | 'flexible'
}

/** Short notice: a change less than this many minutes before the time (PRD D2). */
export const SHORT_NOTICE_MIN = 15

const inside = (t: Minutes, w: TimeWindow) => t >= w.from && t <= w.to

/** Everything wrong with a programme, as sentences for the form. Empty when valid. */
export function programmeErrors(p: Programme): string[] {
  const errors: string[] = []
  if (!p.name.trim()) errors.push('Give the programme a name.')
  if (p.weekdays.length === 0) errors.push('Choose at least one day.')
  if (p.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 6)) errors.push('Days must be Monday to Saturday.')
  if (p.hours.from < SCHOOL_OPENS || p.hours.to > SCHOOL_CLOSES) errors.push('Hours must be within school hours, 9:00 AM to 7:00 PM.')
  if (p.hours.from >= p.hours.to) errors.push('The programme must end after it starts.')
  if (p.term && p.term.start > p.term.end) errors.push('The term must end after it starts.')
  if (p.windows !== 'flexible') {
    for (const [label, w] of [['drop-off', p.windows.dropoff], ['pickup', p.windows.pickup]] as const) {
      if (w.from > w.to) errors.push(`The ${label} window must end after it starts.`)
      // Windows sit around the class (D24): drop-off before it starts, pickup after it ends, inside the gate day.
      else if (w.from < GATE_OPENS || w.to > GATE_CLOSES) errors.push(`The ${label} window must be within 8:45 AM to 7:15 PM.`)
    }
  }
  return errors
}

/** Does the programme run on this date? Holidays are YYYY-MM-DD dates. */
export function runsOn(p: Programme, isoDate: string, holidays: ReadonlySet<string>): boolean {
  const weekday = weekdayOf(isoDate)
  if (weekday === 7 || !p.weekdays.includes(weekday) || holidays.has(isoDate)) return false
  if (p.term && (isoDate < p.term.start || isoDate > p.term.end)) return false
  if (weekday === 6 && p.saturdayRule === 'except_2nd_and_last') {
    const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const isSecond = Math.ceil(d / 7) === 2
    const isLast = d + 7 > daysInMonth
    if (isSecond || isLast) return false
  }
  return true
}

/** The window a time is normally chosen from: the fixed window, or the whole programme for flexible ones. */
export function windowFor(p: Programme, direction: Direction): TimeWindow {
  return p.windows === 'flexible' ? p.hours : p.windows[direction]
}

export type TimeCheck =
  | { ok: false; reason: 'outside_school_hours' | 'in_the_past' }
  | { ok: true; offSchedule: boolean; shortNotice: boolean }

/**
 * Checks a requested time for a trip (SCH-3, SCH-4, TRIP-2).
 * `now` is the current India time in minutes when the trip is today, or null for a future day.
 * Off-schedule and short-notice times are allowed but flagged; the server asks for a reason when off-schedule.
 */
export function checkTime(p: Programme, direction: Direction, requested: Minutes, now: Minutes | null): TimeCheck {
  if (requested < GATE_OPENS || requested > GATE_CLOSES) return { ok: false, reason: 'outside_school_hours' }
  if (now !== null && requested < now) return { ok: false, reason: 'in_the_past' }
  return {
    ok: true,
    offSchedule: !inside(requested, windowFor(p, direction)),
    shortNotice: now !== null && requested - now < SHORT_NOTICE_MIN,
  }
}
