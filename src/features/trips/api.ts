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
  // 0008: someone else collecting, and location sharing (absent before that migration is applied)
  traveller_kind?: 'guardian' | 'third_person'
  traveller_phone?: string | null
  sharing?: boolean
  handed_to_name?: string | null
  home_at?: string | null
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

export async function gateStep(tripId: string, step: GateStep, handedTo?: string): Promise<Trip> {
  const { data, error } = await supabase.rpc('gate_step', { p_trip: tripId, p_step: step, p_handed_to: handedTo ?? null })
  if (error) throw error
  return data as Trip
}

/** The server's own sentence for a broken rule ("outside_hours: The school is open…" → "The school is open…"). */
export function explainTripError(e: { code?: string; message?: string } | null): string {
  if (e?.code === 'P0001' && e.message) return e.message.replace(/^[a-z_]+: /, '')
  if (e?.code === '42501') return "You don't have permission to do that."
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
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop()
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])
  return { trips, error, reload: load }
}
