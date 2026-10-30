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
    supabase.from('profiles').select('id, full_name, email, phone, active, app_access, abroad, user_id').order('full_name'),
    supabase.from('staff_roles').select('profile_id, role'),
    supabase.from('classes').select('id, name, active, sort').eq('active', true).order('sort'),
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

/** The two gate roles (0038): Center Coordinator runs the gate; Center Leader hears, acknowledges and marks Ready. */
export type GateRole = Extract<StaffRole, 'coordinator' | 'leader'>
export const GATE_ROLES: readonly GateRole[] = ['coordinator', 'leader']
export const gateRolesOf = (roles: readonly StaffRole[] | undefined): GateRole[] => GATE_ROLES.filter((r) => roles?.includes(r))

/** Gives a gate role if needed and sets exactly these classes, in one step (0005, 0038). Classes are per person. */
export async function setCoordinator(profileId: string, classIds: string[], role: GateRole = 'coordinator') {
  const { error } = await supabase.rpc('set_coordinator', { p_profile: profileId, p_classes: classIds, p_role: role })
  if (error) throw error
}

/** Removes one gate role, or both; the database removes their classes once neither is left. */
export async function removeCoordinator(profileId: string, roles: readonly GateRole[] = GATE_ROLES) {
  const { error } = await supabase.from('staff_roles').delete().eq('profile_id', profileId).in('role', [...roles])
  if (error) throw error
}
