import { indiaClock, toMinutes, type Minutes } from '../../domain/time'
import { windowFor, type Direction, type Programme } from '../../domain/programme'
import type { Trip } from '../trips/api'
import type { Attendance, DayTime } from './api'

/**
 * Where a child's day stands, from today's trips, attendance and changed times (Screen Book: the board, the desk and
 * the gate's "coming up"). One place, so every screen tells the same story.
 */
export type DayState = 'away' | 'collected' | 'otw' | 'here' | 'expected'

export interface ChildDay {
  state: DayState
  /** The time that matters next, and what it is ("drop-off", "arriving", "collected"). */
  next: { at: Minutes | null; label: string }
  /** Expected times today: the changed time, else the regular time, else the start of the window. */
  expected: Record<Direction, Minutes | null>
  changed: Record<Direction, DayTime | null>
  trip: Trip | null
  away: Attendance | null
}

const mins = (hhmm: string) => toMinutes(hhmm.slice(0, 5))
const at = (iso: string) => indiaClock(new Date(iso)).minutes
export const AWAY_LABEL: Record<string, string> = { absent: 'Absent', on_leave: 'On leave', off: 'Off today' }

export function childDay(input: {
  programme: Programme | null
  regular: { dropoff: string; pickup: string } | null
  trips: Trip[]
  attendance: Attendance | null
  times: DayTime[]
}): ChildDay {
  const { programme, regular, trips, attendance, times } = input
  const changed = { dropoff: times.find((t) => t.direction === 'dropoff') ?? null, pickup: times.find((t) => t.direction === 'pickup') ?? null }
  const expect = (d: Direction): Minutes | null => {
    const c = changed[d]
    if (c) return mins(c.at)
    if (regular) return mins(d === 'pickup' ? regular.pickup : regular.dropoff)
    return programme ? windowFor(programme, d).from : null
  }
  const expected = { dropoff: expect('dropoff'), pickup: expect('pickup') }
  const open = trips.find((t) => t.status === 'en_route') ?? null
  const collected = trips.find((t) => t.direction === 'pickup' && t.status === 'handed_over')
  const checkedIn = trips.find((t) => t.direction === 'dropoff' && t.status === 'checked_in')
  const away = attendance && attendance.status !== 'present' ? attendance : null
  const base = { expected, changed, trip: open, away }
  if (away) return { ...base, state: 'away', next: { at: null, label: AWAY_LABEL[away.status] ?? 'Away' } }
  if (collected) return { ...base, state: 'collected', next: { at: at(collected.closed_at!), label: 'collected' } }
  if (open) return { ...base, state: 'otw', next: { at: at(open.arrive_at), label: open.direction === 'pickup' ? 'arriving' : 'coming in' } }
  if (checkedIn || attendance?.checked_in_at) return { ...base, state: 'here', next: { at: expected.pickup, label: 'pickup' } }
  return { ...base, state: 'expected', next: { at: expected.dropoff, label: 'drop-off' } }
}

/** How many other children are expected within 8 minutes of a time in one direction (D15: "Busy, 3 pickups"). */
export function busyAt(days: Array<{ id: string; day: ChildDay }>, except: string, direction: Direction, time: Minutes): number {
  return days.filter(({ id, day }) => id !== except && day.state !== 'away' && day.state !== 'collected'
    && !(direction === 'dropoff' && day.state === 'here') && day.expected[direction] !== null && Math.abs(day.expected[direction]! - time) < 8).length
}

/** Order for the board: on the way first by time, then at school by pickup, then expected, then collected, then away. */
export function boardOrder(d: ChildDay): number {
  const rank: Record<DayState, number> = { otw: 0, here: 1, expected: 2, collected: 3, away: 4 }
  return rank[d.state] * 10_000 + (d.next.at ?? 9_999)
}
