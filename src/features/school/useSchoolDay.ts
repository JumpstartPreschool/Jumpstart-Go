import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { onTableChange } from '../../lib/live'
import { now } from '../../lib/clock'
import { indiaClock } from '../../domain/time'
import type { Programme } from '../../domain/programme'
import type { ProgrammeRow } from '../admin/api'
import { useTodayTrips, type Trip } from '../trips/api'
import { programmeOf } from '../trips/rules'
import { useToday } from './api'
import { childDay, type ChildDay } from './dayModel'

export interface Guardian { id: string; full_name: string; phone: string | null; email: string | null; relation: string; kind: 'parent' | 'family'; abroad: boolean; app_access: boolean }
export interface SchoolChild {
  id: string
  fullName: string
  first: string
  gender?: string | null
  classId: string
  className: string
  programmeRow: ProgrammeRow | null
  programme: Programme | null
  regular: { dropoff: string; pickup: string } | null
  guardians: Guardian[]
  day: ChildDay
  trips: Trip[]
}

type Row = {
  id: string; full_name: string; preferred_name: string | null; gender: string | null; class_id: string; classes: { name: string } | null; programmes: ProgrammeRow | null
  child_schedules: Array<{ weekday: number; dropoff: string; pickup: string }>; guardianships: Array<{ guardian_id: string; relation: string; kind: 'parent' | 'family' }>
}
const FIELDS = 'id, full_name, preferred_name, gender, class_id, classes(name), programmes(id, name, class_id, flexible, extended, starts, ends, weekdays, saturday_rule, term_start, term_end, dropoff_from, dropoff_to, pickup_from, pickup_to), child_schedules(weekday, dropoff, pickup), guardianships(guardian_id, relation, kind)'

/**
 * Every child's day for the office (the board, the front desk): children with their programme, regular times and
 * parents and family, plus today's trips, attendance and changed times, all kept live.
 */
export function useSchoolDay() {
  const trips = useTodayTrips()
  const { attendance, times } = useToday()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [people, setPeople] = useState<Map<string, Omit<Guardian, 'relation' | 'kind'>> | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    const [kids, profiles] = await Promise.all([
      supabase.from('children').select(FIELDS).eq('active', true).order('full_name'),
      supabase.from('profiles').select('id, full_name, phone, email, abroad, app_access').eq('active', true),
    ])
    if (kids.error || profiles.error) return setError(true)
    setError(false)
    setRows((kids.data ?? []) as unknown as Row[])
    setPeople(new Map(((profiles.data ?? []) as Array<Omit<Guardian, 'relation' | 'kind'>>).map((p) => [p.id, p])))
  }, [])
  useEffect(() => {
    void load()
    const stops = ['children', 'guardianships', 'child_schedules', 'programmes', 'profiles'].map((t) => onTableChange(t, () => void load()))
    return () => stops.forEach((s) => s())
  }, [load])

  const weekday = indiaClock(new Date(now())).weekday
  const ready = rows && people && trips.trips && attendance.rows && times.rows
  const children: SchoolChild[] | null = ready ? rows!.map((c) => {
    const programme = c.programmes ? programmeOf(c.programmes) : null
    const regular = c.child_schedules.find((s) => s.weekday === weekday) ?? null
    const mine = trips.trips!.filter((t) => t.child_id === c.id)
    return {
      id: c.id, fullName: c.full_name, first: c.preferred_name ?? c.full_name.split(' ')[0]!, gender: c.gender, classId: c.class_id, className: c.classes?.name ?? '',
      programmeRow: c.programmes, programme, regular, trips: mine,
      guardians: c.guardianships.map((g) => ({ ...(people!.get(g.guardian_id) ?? { id: g.guardian_id, full_name: 'Someone no longer listed', phone: null, email: null, abroad: false, app_access: false }), relation: g.relation, kind: g.kind ?? 'parent' })),
      day: childDay({ programme, regular, trips: mine, attendance: attendance.rows!.find((a) => a.child_id === c.id) ?? null, times: times.rows!.filter((t) => t.child_id === c.id) }),
    }
  }) : null
  return {
    children,
    error: error || trips.error || attendance.error || times.error,
    reload: () => { void load(); void trips.reload(); void attendance.reload(); void times.reload() },
  }
}
