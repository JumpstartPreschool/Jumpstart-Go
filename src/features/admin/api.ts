import { supabase } from '../../lib/supabase'
import type { StaffRole } from '../auth/session'

export interface Profile { id: string; full_name: string; email: string | null; phone: string | null; active: boolean; user_id: string | null }
export interface Child { id: string; full_name: string; preferred_name: string | null; date_of_birth: string; class_id: string; programme_id: string; active: boolean }
export interface Guardianship { child_id: string; guardian_id: string; relation: string }
export interface ClassRow { id: string; name: string; active: boolean }
export interface ProgrammeRow {
  id: string
  name: string
  flexible: boolean
  starts: string
  ends: string
  weekdays?: number[]
  saturday_rule?: 'every' | 'except_2nd_and_last'
  term_start?: string | null
  term_end?: string | null
  dropoff_from?: string | null
  dropoff_to?: string | null
  pickup_from?: string | null
  pickup_to?: string | null
}

export interface Directory {
  profiles: Profile[]
  roles: Map<string, StaffRole[]>
  children: Child[]
  guardianships: Guardianship[]
  classes: ClassRow[]
  programmes: ProgrammeRow[]
}

/** Friendly text for the errors people can actually cause; everything else is a connection problem. */
export function explainDbError(e: { code?: string; message?: string } | null): string {
  if (!e) return ''
  if (e.code === '23505') return 'Someone with this email or phone number is already registered.'
  if (e.code === '42501') return "You don't have permission to do that."
  if (e.code === '23514' || e.code === 'P0001') return e.message ?? 'Please check the details.'
  if (e.code === '23503') return 'Something it refers to no longer exists. Refresh and try again.'
  return "Couldn't save. Check your connection and try again."
}

export async function loadDirectory(): Promise<Directory> {
  const [profiles, roles, children, guardianships, classes, programmes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, active, user_id').order('full_name'),
    supabase.from('staff_roles').select('profile_id, role'),
    supabase.from('children').select('id, full_name, preferred_name, date_of_birth, class_id, programme_id, active').order('full_name'),
    supabase.from('guardianships').select('child_id, guardian_id, relation'),
    supabase.from('classes').select('id, name, active').order('name'),
    supabase.from('programmes').select('id, name, flexible, starts, ends, weekdays, saturday_rule, term_start, term_end, dropoff_from, dropoff_to, pickup_from, pickup_to').eq('active', true).order('name'),
  ])
  const failed = [profiles, roles, children, guardianships, classes, programmes].find((r) => r.error)
  if (failed?.error) throw failed.error
  const roleMap = new Map<string, StaffRole[]>()
  for (const r of roles.data ?? []) roleMap.set(r.profile_id, [...(roleMap.get(r.profile_id) ?? []), r.role as StaffRole])
  return {
    profiles: profiles.data ?? [],
    roles: roleMap,
    children: children.data ?? [],
    guardianships: guardianships.data ?? [],
    classes: classes.data ?? [],
    programmes: programmes.data ?? [],
  }
}

export async function addPerson(input: { fullName: string; email: string | null; phone: string | null; roles: StaffRole[] }) {
  const { error } = await supabase.rpc('admin_add_person', { p_full_name: input.fullName, p_email: input.email, p_phone: input.phone, p_roles: input.roles })
  if (error) throw error
}

export async function addChild(input: {
  fullName: string
  preferredName: string
  dateOfBirth: string
  classId: string
  programmeId: string
  guardians: Array<{ guardian_id: string; relation: string }>
}) {
  const { error } = await supabase.rpc('admin_add_child', {
    p_full_name: input.fullName,
    p_preferred_name: input.preferredName,
    p_date_of_birth: input.dateOfBirth,
    p_class_id: input.classId,
    p_programme_id: input.programmeId,
    p_guardians: input.guardians,
  })
  if (error) throw error
}

export async function addClass(name: string): Promise<ClassRow> {
  const { data, error } = await supabase.from('classes').insert({ name: name.trim() }).select('id, name, active').single()
  if (error) throw error
  return data
}

/** Turning someone off ends their access and signs them out everywhere (AUTH-3, via the database). */
export async function setPersonActive(profileId: string, active: boolean) {
  const { error } = await supabase.from('profiles').update({ active }).eq('id', profileId)
  if (error) throw error
}
