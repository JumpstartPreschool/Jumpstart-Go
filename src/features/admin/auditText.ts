import { clockTime } from '../trips/rules'

/**
 * The audit log in words (ADM-3). The database records every change to a sensitive table as the row before and after
 * (app.audit); this says what happened, the way the school would: "Marked Kabir absent today", not "update attendance".
 */
export interface AuditRow {
  id: number
  at: string
  actor: string | null
  action: 'insert' | 'update' | 'delete'
  table_name: string
  old_row: Record<string, unknown> | null
  new_row: Record<string, unknown> | null
}

export interface Names {
  person: (profileId: unknown) => string
  child: (childId: unknown) => string
  className: (classId: unknown) => string
  programme: (programmeId: unknown) => string
}

const ROLE_NAME: Record<string, string> = { admin: 'Admin', core: 'Core team', coordinator: 'Coordinator', pro: 'Front desk' }
const WORD: Record<string, string> = { pickup: 'pickup', dropoff: 'drop-off' }
const time = (iso: unknown) => clockTime(String(iso))
const changed = (r: AuditRow, k: string) => JSON.stringify(r.old_row?.[k]) !== JSON.stringify(r.new_row?.[k])

/** One line for the change, and an optional detail. Null for changes nobody needs to read (e.g. a sign-in link). */
export function describe(r: AuditRow, n: Names): { what: string; detail?: string } | null {
  const row = (r.new_row ?? r.old_row ?? {}) as Record<string, unknown>
  switch (r.table_name) {
    case 'trips': {
      const kid = n.child(row.child_id)
      const trip = `${kid}'s ${WORD[String(row.direction)] ?? 'trip'}`
      if (r.action === 'insert') {
        const who = row.traveller_kind === 'third_person' ? `${row.traveller_name} (${row.traveller_relation}, with a link)` : String(row.traveller_name)
        return { what: `${trip}: ${who} on the way`, detail: `About ${time(row.arrive_at)}${row.off_schedule ? `, outside the usual time: ${row.reason}` : ''}${row.phoned_in_by ? `. Phoned in, taken by ${n.person(row.phoned_in_by)}` : ''}` }
      }
      if (r.action === 'update') {
        if (changed(r, 'status')) {
          if (row.status === 'handed_over') return { what: `${kid} handed over to ${row.handed_to ? n.person(row.handed_to) : `${row.handed_to_name}, with the code`}` }
          if (row.status === 'checked_in') return { what: `${kid} checked in` }
          if (row.status === 'cancelled') return { what: `${trip} cancelled` }
        }
        if (changed(r, 'ready_at') && row.ready_at) return { what: `${kid} ready at the gate` }
        if (changed(r, 'arrive_at')) return { what: `New time for ${trip}`, detail: `About ${time(row.arrive_at)}${row.off_schedule ? `, outside the usual time: ${row.reason}` : ''}` }
        if (changed(r, 'acknowledged_at') && row.acknowledged_at) return { what: `Seen: ${trip}` }
        if (changed(r, 'home_at') && row.home_at) return { what: `${row.traveller_name} reached home with ${kid}`, detail: 'Location sharing stopped' }
        return null
      }
      return null
    }
    case 'attendance':
      if (row.status === 'absent' || row.status === 'on_leave') return { what: `Marked ${n.child(row.child_id)} ${row.status === 'absent' ? 'absent' : 'on leave'} on ${row.day}`, detail: row.note ? String(row.note) : undefined }
      if (r.action === 'delete') return { what: `${n.child(row.child_id)} expected again on ${row.day}` }
      return null
    case 'guardianships':
      if (r.action === 'insert') return { what: `Added ${n.person(row.guardian_id)} as ${n.child(row.child_id)}'s ${String(row.relation).toLowerCase()}` }
      if (r.action === 'delete') return { what: `Removed ${n.person(row.guardian_id)} from ${n.child(row.child_id)}'s record` }
      return { what: `Changed how ${n.person(row.guardian_id)} is related to ${n.child(row.child_id)}`, detail: String(row.relation) }
    case 'children':
      if (r.action === 'insert') return { what: `Added ${row.full_name}`, detail: n.programme(row.programme_id) }
      if (changed(r, 'active') && row.active === false) return { what: `${row.full_name} left the school` }
      if (changed(r, 'programme_id')) return { what: `Moved ${row.full_name} to ${n.programme(row.programme_id)}` }
      return { what: `Edited ${row.full_name}'s details` }
    case 'profiles':
      if (r.action === 'insert') return { what: `Added ${row.full_name}`, detail: row.app_access === false ? 'Contact only, without the app' : row.email ? `Invitation to ${row.email}` : undefined }
      if (changed(r, 'app_access')) return { what: `Turned ${row.app_access ? 'on' : 'off'} app access for ${row.full_name}`, detail: row.app_access ? undefined : 'Signed out everywhere' }
      if (changed(r, 'active')) return { what: `Turned ${row.active ? 'on' : 'off'} access for ${row.full_name}`, detail: row.active ? undefined : 'Signed out everywhere' }
      if (changed(r, 'consent_version')) return { what: `${row.full_name} agreed to the privacy notice` }
      if (changed(r, 'user_id')) return null // first sign-in links the account: not a change anyone made
      return { what: `Edited ${row.full_name}'s details` }
    case 'staff_roles':
      return { what: `${n.person(row.profile_id)} ${r.action === 'delete' ? 'is no longer' : 'is now'} ${ROLE_NAME[String(row.role)] ?? row.role}` }
    case 'coordinator_classes':
      return { what: `${n.person(row.profile_id)} ${r.action === 'delete' ? 'no longer covers' : 'covers'} ${n.className(row.class_id)}` }
    case 'programmes':
      return { what: `Changed the timings of ${row.name}` }
    case 'child_schedules':
      return { what: `${r.action === 'delete' ? 'Cleared' : 'Set'} ${n.child(row.child_id)}'s regular times` }
    case 'holidays':
      return { what: `${r.action === 'delete' ? 'Removed' : 'Added'} the holiday ${row.name} on ${row.day}` }
    case 'settings':
      return { what: 'Changed the settings', detail: ['get_ready_lead_min', 'late_threshold_min', 'school_phone', 'morning_reminder'].filter((k) => changed(r, k)).map((k) => `${k.replace(/_/g, ' ').replace(' min', '')}: ${r.new_row?.[k]}`).join(', ') || undefined }
    default:
      return { what: `${r.action === 'insert' ? 'Added' : r.action === 'delete' ? 'Removed' : 'Changed'} ${r.table_name.replace(/_/g, ' ')}` }
  }
}
