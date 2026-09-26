import { supabase } from '../../lib/supabase'
import type { InviteDetails } from '../../../supabase/functions/_shared/invite.ts'
import type { StaffRole } from '../auth/session'

/** A person on the school's records. `active`: on the record; `app_access`: can sign in (0012). */
export interface Profile { id: string; full_name: string; email: string | null; phone: string | null; active: boolean; app_access: boolean; abroad: boolean; user_id: string | null; invited_at?: string | null; invited_via?: 'email' | 'sms' | 'whatsapp' | null }
export interface Child { id: string; full_name: string; preferred_name: string | null; date_of_birth: string | null; class_id: string; programme_id: string; active: boolean; gender?: 'boy' | 'girl' | null }
export type GuardianKind = 'parent' | 'family'
export interface Guardianship { child_id: string; guardian_id: string; relation: string; kind: GuardianKind }
/** The classes are the levels (D18), fixed and in the school's order. */
export interface ClassRow { id: string; name: string; active: boolean; sort: number }
export interface ProgrammeRow {
  id: string
  name: string
  class_id?: string
  extended?: boolean
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
  coordinatorClasses: Array<{ profile_id: string; class_id: string }>
  schedules: Array<{ child_id: string; weekday: number; dropoff: string; pickup: string }>
}

/** Friendly text for the errors people can actually cause; everything else is a connection problem. */
export function explainDbError(e: { code?: string; message?: string } | null): string {
  if (!e) return ''
  if (e.code === '23505') return 'Someone with this email or phone number is already registered. Use Link someone already here.'
  if (e.code === '42501' && e.message?.startsWith('admin_locked')) return e.message.replace(/^[a-z_]+: /, '')
  if (e.code === '42501') return "You don't have permission to do that."
  if (e.code === '23514' || e.code === 'P0001') return e.message?.replace(/^[a-z_]+: /, '') ?? 'Please check the details.'
  if (e.code === '23503') return 'Something it refers to no longer exists. Refresh and try again.'
  return "Couldn't save. Check your connection and try again."
}

export async function loadDirectory(): Promise<Directory> {
  const [profiles, roles, children, guardianships, classes, programmes, coordinatorClasses, schedules] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, active, app_access, abroad, user_id, invited_at, invited_via').order('full_name'),
    supabase.from('staff_roles').select('profile_id, role'),
    supabase.from('children').select('id, full_name, preferred_name, date_of_birth, class_id, programme_id, active, gender').order('full_name'),
    supabase.from('guardianships').select('child_id, guardian_id, relation, kind'),
    supabase.from('classes').select('id, name, active, sort').order('sort'),
    supabase.from('programmes').select('id, name, class_id, extended, flexible, starts, ends, weekdays, saturday_rule, term_start, term_end, dropoff_from, dropoff_to, pickup_from, pickup_to').eq('active', true).order('name'),
    supabase.from('coordinator_classes').select('profile_id, class_id'),
    supabase.from('child_schedules').select('child_id, weekday, dropoff, pickup'),
  ])
  const failed = [profiles, roles, children, guardianships, classes, programmes, coordinatorClasses, schedules].find((r) => r.error)
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
    coordinatorClasses: coordinatorClasses.data ?? [],
    schedules: schedules.data ?? [],
  }
}

/** A staff member with their roles (never Admin: D27). Returns their profile id. */
export async function addPerson(input: { fullName: string; email: string | null; phone: string | null; roles: StaffRole[] }): Promise<string> {
  const { data, error } = await supabase.rpc('admin_add_person', { p_full_name: input.fullName, p_email: input.email, p_phone: input.phone, p_roles: input.roles })
  if (error) throw error
  return data as string
}

/** Someone new on a child's record, or someone already here ({ id }). */
export type PersonInput =
  | { id: string; relation: string; kind: GuardianKind }
  | { full_name: string; email: string | null; phone: string | null; abroad: boolean; app_access: boolean; relation: string; kind: GuardianKind }

/** A child with everyone on their record, saved together or not at all (0012). Returns the child's id. */
export async function saveChild(child: { full_name: string; preferred_name: string; date_of_birth: string; programme_id: string; gender?: 'boy' | 'girl' | null }, people: PersonInput[]): Promise<string> {
  const { data, error } = await supabase.rpc('admin_save_child', { p_child: child, p_people: people })
  if (error) throw error
  return data as string
}

export async function addGuardian(childId: string, person: PersonInput): Promise<void> {
  const { error } = await supabase.rpc('admin_add_guardian', { p_child: childId, p_person: person })
  if (error) throw error
}

/** The last parent or relative can't be removed (the database refuses). */
/** The admin changes someone's details (0029); with a child, also how they're related. A new email moves their sign-in. */
export async function updatePerson(profileId: string, childId: string | null, person: { full_name: string; email: string | null; phone: string | null; abroad?: boolean; app_access: boolean; relation?: string; kind?: 'parent' | 'family' }): Promise<void> {
  const { error } = await supabase.rpc('admin_update_person', { p_profile: profileId, p_child: childId, p_person: person })
  if (error) throw error
}

export async function removeGuardian(childId: string, guardianId: string): Promise<void> {
  const { error } = await supabase.from('guardianships').delete().eq('child_id', childId).eq('guardian_id', guardianId)
  if (error) throw error
}

export async function updateChild(childId: string, patch: Partial<Pick<Child, 'full_name' | 'preferred_name' | 'date_of_birth' | 'programme_id' | 'gender'>>): Promise<void> {
  const { error } = await supabase.from('children').update(patch).eq('id', childId)
  if (error) throw error
}

export async function childLeft(childId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_child_left', { p_child: childId })
  if (error) throw error
}

/** App access on or off: off signs them out everywhere but keeps them on the child's list for the gate (0012). */
export async function setAppAccess(profileId: string, on: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ app_access: on }).eq('id', profileId)
  if (error) throw error
}
/** Turning someone off ends their access and signs them out everywhere (AUTH-3, via the database). */
export async function setPersonActive(profileId: string, active: boolean) {
  const { error } = await supabase.from('profiles').update({ active }).eq('id', profileId)
  if (error) throw error
}

/** Invitations (0020, D36): what to say, the email (invite-send), and a record of a text or WhatsApp sent from the admin's phone. */
export async function inviteDetails(profile: string): Promise<InviteDetails> {
  const { data, error } = await supabase.rpc('invite_details', { p_profile: profile })
  if (error) throw error
  return data as InviteDetails
}
export async function sendInviteEmail(profile: string): Promise<void> {
  const { error } = await supabase.functions.invoke('invite-send', { body: { profile } })
  if (!error) return
  // The function answers with a sentence for the admin; a network failure has none.
  const res = (error as { context?: Response }).context
  const body = await res?.json?.().catch(() => null)
  const fallback = res?.status === 404 ? "Email invitations aren't set up yet. Send it by WhatsApp or SMS for now." : "The email couldn't be sent. Check your connection and try again."
  throw { code: 'P0001', message: body?.error ?? fallback }
}
/** Settings → Check email setup: whether Brevo accepts the key and the sender, without sending anything. */
export interface EmailSetup { key?: 'ok' | 'missing' | 'refused'; sender?: 'verified' | 'not_verified' | 'missing'; emailsLeft?: number | null; message?: string; error?: string }
export async function checkEmailSetup(): Promise<EmailSetup> {
  const { data, error } = await supabase.functions.invoke('invite-send', { body: { check: true } })
  if (!error) return data as EmailSetup
  const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
  return { error: (body as EmailSetup | null)?.error ?? "Couldn't reach the email service. Check your connection and try again." }
}
export async function markInvited(profile: string, via: 'sms' | 'whatsapp'): Promise<void> {
  const { error } = await supabase.rpc('mark_invited', { p_profile: profile, p_via: via })
  if (error) throw error
}

/** Bulk upload (0022): one child and their family; people already on record are matched by email or mobile. */
export async function importChild(child: { full_name: string; preferred_name: string | null; date_of_birth: string | null; programme_id: string; gender: 'boy' | 'girl' | null }, people: unknown[]): Promise<string> {
  const { data, error } = await supabase.rpc('import_child', { p_child: child, p_people: people })
  if (error) throw error
  return data as string
}

/** How the gate says names that come out wrong (0027, D43): one written word → how to say it. Staff read; admin edits. */
export interface Pronunciation { written: string; spoken: string }
export async function listPronunciations(): Promise<Pronunciation[]> {
  const { data, error } = await supabase.from('pronunciations').select('written, spoken').order('written')
  if (error) throw error
  return data as Pronunciation[]
}
/** An empty spoken form removes the word from the list. */
export async function setPronunciation(written: string, spoken: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_pronunciation', { p_written: written, p_spoken: spoken })
  if (error) throw error
}
