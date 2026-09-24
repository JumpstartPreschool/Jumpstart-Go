import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { onTableChange } from '../../lib/live'
import type { Direction } from '../../domain/programme'
import { todayInIndia } from '../trips/api'

/** Calls for the school's day (migration 0013). Each throws the database's error; explainDbError says it in words. */
async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

export type AttendanceStatus = 'present' | 'absent' | 'on_leave' | 'off'
export interface Attendance { child_id: string; day: string; status: AttendanceStatus; note: string | null; reported_by: string | null; checked_in_at: string | null; checked_out_at: string | null }
export interface DayTime { child_id: string; day: string; direction: Direction; at: string; reason: string | null; set_by: string }
export interface Message { id: number; child_id: string; sender: string; sender_name: string; sender_role: 'parent' | 'family' | 'admin' | 'core' | 'pro'; body: string; created_at: string }
export interface Announcement { id: string; title: string; body: string; class_id: string | null; sender_name: string; sender_role: string; created_at: string }
export interface Call { id: number; child_id: string; guardian_id: string; what: 'otw' | 'time' | 'absent' | 'note'; summary: string; logged_by: string; created_at: string }
export interface SavedPerson { id: string; full_name: string; phone: string; relation: string }

export const setAttendance = (child: string, day: string, status: AttendanceStatus, note: string | null) => call<null>('set_attendance', { p_child: child, p_day: day, p_status: status, p_note: note })
export const reportAbsence = (child: string, day: string, reason: string) => call<null>('report_absence', { p_child: child, p_day: day, p_reason: reason })
export const undoAbsence = (child: string, day: string) => call<null>('undo_absence', { p_child: child, p_day: day })
export const changeDayTime = (child: string, direction: Direction, at: string, reason: string | null) => call<DayTime>('change_day_time', { p_child: child, p_direction: direction, p_at: at, p_reason: reason })
export const setProgrammeHours = (programme: string, starts: string, ends: string, extended: boolean) => call<unknown>('set_programme_hours', { p_programme: programme, p_starts: starts, p_ends: ends, p_extended: extended })
export const setRegularTimes = (child: string, dropoff: string | null, pickup: string | null) => call<null>('set_regular_times', { p_child: child, p_dropoff: dropoff, p_pickup: pickup })
export const sendMessage = (child: string, body: string) => call<Message>('send_message', { p_child: child, p_body: body })
export const markRead = (child: string) => call<null>('mark_read', { p_child: child })
export const sendAnnouncement = (title: string, body: string, classId: string | null) => call<Announcement>('send_announcement', { p_title: title, p_body: body, p_class: classId })
export const markAnnouncementRead = (id: string) => call<null>('mark_announcement_read', { p_announcement: id })
export const announcementStats = () => call<Array<{ announcement_id: string; recipients: number; reads: number }>>('announcement_stats', {})
export const recipientCount = (classId: string | null) => call<number>('recipient_count', { p_class: classId })
export const setMyNotifications = (morning: boolean, family: boolean) => call<null>('set_my_notifications', { p_morning: morning, p_family: family })

export type CallWhat =
  | { what: 'otw'; direction: Direction; minutes: number; reason: string | null }
  | { what: 'time'; direction: Direction; at: string; reason: string | null }
  | { what: 'absent'; reason: string }
  | { what: 'note'; note: string }
export function logCall(child: string, guardian: string, c: CallWhat) {
  return call<number>('log_call', {
    p_child: child, p_guardian: guardian, p_what: c.what,
    p_direction: 'direction' in c ? c.direction : null, p_minutes: c.what === 'otw' ? c.minutes : null, p_at: c.what === 'time' ? c.at : null,
    p_reason: 'reason' in c ? c.reason : null, p_note: c.what === 'note' ? c.note : null,
  })
}

export async function savePerson(owner: string, p: Omit<SavedPerson, 'id'>): Promise<void> {
  const { error } = await supabase.from('saved_people').insert({ owner, ...p })
  if (error) throw error
}
export async function removeSavedPerson(id: string): Promise<void> {
  const { error } = await supabase.from('saved_people').delete().eq('id', id)
  if (error) throw error
}

/**
 * Rows of a table, reloaded live (Realtime, a 30 s poll, and on return to the app). `query` builds the request;
 * `deps` says when it changes. The same pattern as today's trips (trips/api.ts).
 */
export function useLive<T>(table: string | string[], query: () => PromiseLike<{ data: unknown; error: unknown }>, deps: unknown[]) {
  const [rows, setRows] = useState<T[] | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    const { data, error: e } = await query()
    if (e) return setError(true)
    setError(false)
    setRows((data ?? []) as T[])
  }, deps)
  useEffect(() => {
    void load()
    const stops = (Array.isArray(table) ? table : [table]).map((t) => onTableChange(t, () => void load()))
    const poll = setInterval(() => void load(), 30_000)
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => { stops.forEach((s) => s()); clearInterval(poll); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])
  return { rows, error, reload: load }
}

/** Today's attendance and changed times for every child the reader may see. */
export function useToday() {
  const day = todayInIndia()
  const attendance = useLive<Attendance>('attendance', () => supabase.from('attendance').select('*').eq('day', day), [day])
  const times = useLive<DayTime>('day_times', () => supabase.from('day_times').select('*').eq('day', day), [day])
  return { day, attendance, times }
}
