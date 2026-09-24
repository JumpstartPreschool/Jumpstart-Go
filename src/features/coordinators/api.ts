import { supabase } from '../../lib/supabase'
import type { StaffRole } from '../auth/session'
import type { ClassRow, Profile } from '../admin/api'

export interface CoordinatorData {
  people: Profile[]
  roles: Map<string, StaffRole[]>
  classes: ClassRow[]
  /** profile id → class ids */
  assignments: Map<string, string[]>
  parentIds: Set<string>
}

export async function loadCoordinators(): Promise<CoordinatorData> {
  const [people, roles, classes, assignments, guardianships] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, active, user_id').order('full_name'),
    supabase.from('staff_roles').select('profile_id, role'),
    supabase.from('classes').select('id, name, active').eq('active', true).order('name'),
    supabase.from('coordinator_classes').select('profile_id, class_id'),
    supabase.from('guardianships').select('guardian_id'),
  ])
  const failed = [people, roles, classes, assignments, guardianships].find((r) => r.error)
  if (failed?.error) throw failed.error
  const roleMap = new Map<string, StaffRole[]>()
  for (const r of roles.data ?? []) roleMap.set(r.profile_id, [...(roleMap.get(r.profile_id) ?? []), r.role as StaffRole])
  const assigned = new Map<string, string[]>()
  for (const a of assignments.data ?? []) assigned.set(a.profile_id, [...(assigned.get(a.profile_id) ?? []), a.class_id])
  return {
    people: people.data ?? [],
    roles: roleMap,
    classes: classes.data ?? [],
    assignments: assigned,
    parentIds: new Set((guardianships.data ?? []).map((g) => g.guardian_id)),
  }
}

/** Gives the Coordinator role if needed and sets exactly these classes, in one step (0005). */
export async function setCoordinator(profileId: string, classIds: string[]) {
  const { error } = await supabase.rpc('set_coordinator', { p_profile: profileId, p_classes: classIds })
  if (error) throw error
}

/** Removes the Coordinator role; the database removes their classes with it. */
export async function removeCoordinator(profileId: string) {
  const { error } = await supabase.from('staff_roles').delete().eq('profile_id', profileId).eq('role', 'coordinator')
  if (error) throw error
}
