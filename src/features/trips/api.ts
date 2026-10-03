import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { onTableChange } from '../../lib/live'
import { now } from '../../lib/clock'
import { indiaClock } from '../../domain/time'
import type { Direction } from '../../domain/programme'

export type TripStatus = 'en_route' | 'handed_over' | 'checked_in' | 'cancelled'

/** One child, one direction, one day (0006). */
export interface Trip {
  id: string
  child_id: string
  direction: Direction
  day: string
  status: TripStatus
  arrive_at: string
  off_schedule: boolean
  reason: string | null
  created_by: string
  traveller_name: string
  traveller_relation: string | null
  created_at: string
  updated_at: string
  acknowledged_by: string | null
  acknowledged_at: string | null
  ready_at: string | null
  closed_at: string | null
  handed_to: string | null
  /** 0035: the parent tapped "I've arrived" (absent before that migration is applied). */
  arrived_at?: string | null
  /** 0043: the parent's latest Running late: when, the time it replaced, and an optional note (shown, never spoken). */
  late_at?: string | null
  late_from?: string | null
  late_note?: string | null
  // 0008: someone else collecting, and location sharing (absent before that migration is applied)
  traveller_kind?: 'guardian' | 'third_person'
  traveller_phone?: string | null
  sharing?: boolean
  handed_to_name?: string | null
  home_at?: string | null
  // 0011: booked by staff for a parent who phoned
  phoned_in_by?: string | null
}

export type GateStep = 'acknowledge' | 'ready' | 'close'

export const todayInIndia = () => indiaClock(new Date(now())).date

export async function startTrip(childId: string, direction: Direction, minutes: number, reason: string | null): Promise<Trip> {
  const { data, error } = await supabase.rpc('start_trip', { p_child: childId, p_direction: direction, p_minutes: minutes, p_reason: reason })
  if (error) throw error
  return data as Trip
}

export async function cancelTrip(tripId: string): Promise<Trip> {
  const { data, error } = await supabase.rpc('cancel_trip', { p_trip: tripId })
  if (error) throw error
  return data as Trip
}

/** "I've arrived": the gate announces it at once. Only the child's family (or the school); once per trip. */
/** Running late (0043): +5, +10, +15 minutes, or a later time today, with an optional note. The gate hears it at once. */
export async function runningLate(tripId: string, change: { minutes: 5 | 10 | 15 } | { at: Date }, note: string | null): Promise<Trip> {
  const { data, error } = await supabase.rpc('running_late', {
    p_trip: tripId, p_minutes: 'minutes' in change ? change.minutes : null, p_at: 'at' in change ? change.at.toISOString() : null, p_note: note?.trim() || null,
  })
  if (error) throw error
  return data as Trip
}

export async function arriveTrip(tripId: string): Promise<Trip> {
  const { data, error } = await supabase.rpc('arrive_trip', { p_trip: tripId })
  if (error) throw error
  return data as Trip
}

export async function gateStep(tripId: string, step: GateStep, handedTo?: string): Promise<Trip> {
  const { data, error } = await supabase.rpc('gate_step', { p_trip: tripId, p_step: step, p_handed_to: handedTo ?? null })
  if (error) throw error
  return data as Trip
}

/** The server's own sentence for a broken rule ("outside_hours: The school is open…" → "The school is open…"). */
export function explainTripError(e: { code?: string; message?: string } | null): string {
  if (e?.code === 'P0001' && e.message) return e.message.replace(/^[a-z_]+: /, '')
  if (e?.code === '42501') return "You don't have permission to do that."
  // A code means the server answered: blaming the connection would send people chasing the wrong problem.
  if (e?.code) return "The school's system couldn't do that. Try again, and call the school if it keeps happening."
  return "Couldn't reach the school. Check your connection and try again."
}

/** Today's trips the reader may see, kept live. A slow poll and a refresh on return cover a dropped connection. */
export function useTodayTrips() {
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('trips').select('*').eq('day', todayInIndia()).order('arrive_at')
    if (e) return setError(true)
    setError(false)
    setTrips((data ?? []) as Trip[])
  }, [])
  useEffect(() => {
    void load()
    const stop = onTableChange('trips', () => void load())
    const poll = setInterval(() => void load(), 20_000)
    // The database is the truth: coming back to the app in any way (unlocked, switched back, restored from memory by
    // iOS, back online) fetches today's trips again, whatever happened to the live connection meanwhile.
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      stop()
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [load])
  return { trips, error, reload: load }
}
