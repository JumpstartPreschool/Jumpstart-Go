/**
 * DEMO MODE — the in-browser stand-in for migrations 0011, 0012 and 0020 (classes as levels, family and app access, saving
 * a child with their family, the admin lock, Log a call, invitations), with the same rules. Sample data only.
 */
type Row = Record<string, unknown>
export interface AdminDb { profiles: Row[]; staff_roles: Row[]; children: Row[]; guardianships: Row[]; programmes: Row[]; classes: Row[]; trips: Row[]; settings: Row[] }
interface Helpers { json: (body: unknown, status?: number) => Response; fail: (message: string, code?: string) => Response; startTrip: (db: never, me: Row | undefined, args: Row) => Response }

/** The levels, in the school's order (D18). */
export const LEVELS = ['Playgroup', 'Nursery', 'Jr KG', 'Sr KG', 'Learning Center', 'Preschool Readiness', 'After School']
export const levelId = (name: string) => `demo-level-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`
/** A programme's level from its name, as 0011 maps them. */
export const levelOfProgramme = (name: string) => levelId(LEVELS.find((l) => name.startsWith(l)) ?? 'Learning Center')

const isAdmin = (db: AdminDb, me: Row | undefined) => !!me && db.staff_roles.some((r) => r.profile_id === me.id && r.role === 'admin')
const PARENTS = ['mother', 'father', 'parent', 'legal guardian', 'guardian']

function personFor(db: AdminDb, p: Row, h: Helpers): string | Response {
  if (p.id) return db.profiles.some((x) => x.id === p.id && x.active) ? String(p.id) : h.fail('person_missing: Someone you linked is no longer registered. Refresh and try again.')
  if (String(p.full_name ?? '').trim().length < 2) return h.fail("name_required: Enter each person's first and last name.")
  const email = p.email ? String(p.email).trim().toLowerCase() : null
  if ((p.app_access ?? true) && !email) return h.fail('email_required: An email is needed for app access (the sign-in code goes there).')
  if (email && db.profiles.some((x) => x.email === email)) return h.json({ code: '23505', message: 'duplicate key value violates unique constraint', details: null, hint: null }, 409)
  const id = crypto.randomUUID()
  db.profiles.push({ id, full_name: String(p.full_name).trim(), email, phone: p.phone ?? null, active: true, app_access: p.app_access ?? true, abroad: !!p.abroad, user_id: null })
  return id
}

/** Returns the reply for an admin or front-desk function, or null when `fn` isn't one of them. */
export function adminRpc(db: AdminDb, fn: string, args: Row, me: Row | undefined, h: Helpers): Response | null {
  switch (fn) {
    case 'invite_details': {
      if (!isAdmin(db, me)) return h.fail('Only the admin can send invitations.', '42501')
      const p = db.profiles.find((x) => x.id === args.p_profile)
      if (!p || !p.active) return h.fail('gone: This person is no longer on the list.')
      if (!p.app_access) return h.fail(`no_access: Turn on app access for ${p.full_name} first.`)
      if (p.user_id) return h.fail(`signed_in: ${p.full_name} has already signed in.`)
      const url = db.settings[0]?.app_url
      if (!url) return h.fail("no_app_url: Add the app's web address in Settings first.")
      const children = db.guardianships.filter((g) => g.guardian_id === p.id).map((g) => db.children.find((c) => c.id === g.child_id && c.active)).filter(Boolean)
        .map((c) => String(c!.preferred_name ?? String(c!.full_name).split(' ')[0])).sort()
      return h.json({ full_name: p.full_name, email: p.email, phone: p.phone, app_url: url, staff: db.staff_roles.some((r) => r.profile_id === p.id), children })
    }
    case 'mark_invited': {
      if (!isAdmin(db, me)) return h.fail('Only the admin can send invitations.', '42501')
      if (!['email', 'sms', 'whatsapp'].includes(String(args.p_via))) return h.fail('bad_channel: Invite by email, text message or WhatsApp.')
      const p = db.profiles.find((x) => x.id === args.p_profile && x.active && !x.user_id)
      if (p) Object.assign(p, { invited_at: new Date().toISOString(), invited_via: args.p_via })
      return h.json(null)
    }
    // 0022: the admin or the core team imports a child; people already on record (same email or mobile) are linked.
    case 'import_child': {
      if (!me || !db.staff_roles.some((r) => r.profile_id === me.id && (r.role === 'admin' || r.role === 'core'))) return h.fail('Only the admin or the core team can import children.', '42501')
      const child = args.p_child as Row
      const name = String(child.full_name ?? '').trim()
      if (name.length < 2) return h.fail("name_required: Enter the child's first and last name.")
      if (db.children.some((c) => c.active && String(c.full_name).toLowerCase() === name.toLowerCase() && c.date_of_birth === child.date_of_birth)) {
        return h.fail(`duplicate: ${name} (born ${child.date_of_birth}) is already registered.`)
      }
      const people: Row[] = []
      for (const p of (args.p_people as Row[] | undefined) ?? []) {
        const byEmail = p.email ? db.profiles.find((x) => x.active && x.email === String(p.email).toLowerCase()) : undefined
        const byPhone = p.phone ? db.profiles.find((x) => x.active && x.phone === p.phone) : undefined
        if (byEmail && byPhone && byEmail.id !== byPhone.id) return h.fail(`person_conflict: ${p.full_name}'s email and mobile belong to two different people on the school's records.`)
        const found = byEmail ?? byPhone
        people.push(found ? { id: found.id, relation: p.relation, kind: p.kind } : p)
      }
      return adminRpc(db, 'admin_save_child', { p_child: child, p_people: people }, db.profiles.find((x) => db.staff_roles.some((r) => r.profile_id === x.id && r.role === 'admin')), h)
    }
    case 'admin_save_child': {
      if (!isAdmin(db, me)) return h.fail('new row violates row-level security policy', '42501')
      const people = (args.p_people as Row[] | undefined) ?? []
      if (!people.length) return h.fail('people_required: Add at least one parent or relative.')
      if (!people.some((p) => p.id || !p.abroad)) return h.fail('collector_required: Add at least one parent or relative who lives in India, to collect from the gate.')
      const child = args.p_child as Row
      const programme = db.programmes.find((p) => p.id === child.programme_id)
      if (!programme) return h.fail('programme_required: Choose the class and programme.')
      // All or nothing: work on copies, keep them only if everyone was saved.
      const before = { profiles: [...db.profiles], guardianships: [...db.guardianships] }
      const id = crypto.randomUUID()
      for (const p of people) {
        const pid = personFor(db, p, h)
        if (typeof pid !== 'string') { Object.assign(db, before); return pid }
        db.guardianships.push({ child_id: id, guardian_id: pid, relation: String(p.relation), kind: p.kind ?? 'parent' })
      }
      db.children.push({ id, full_name: String(child.full_name).trim(), preferred_name: child.preferred_name || null, date_of_birth: child.date_of_birth, class_id: programme.class_id, programme_id: programme.id, active: true, gender: child.gender === 'boy' || child.gender === 'girl' ? child.gender : null })
      return h.json(id)
    }
    case 'admin_add_guardian': {
      if (!isAdmin(db, me)) return h.fail('new row violates row-level security policy', '42501')
      const p = args.p_person as Row
      const pid = personFor(db, p, h)
      if (typeof pid !== 'string') return pid
      db.guardianships.push({ child_id: args.p_child, guardian_id: pid, relation: String(p.relation), kind: p.kind ?? 'parent' })
      return h.json(pid)
    }
    case 'admin_child_left': {
      if (!isAdmin(db, me)) return h.fail('permission denied', '42501')
      const c = db.children.find((x) => x.id === args.p_child && x.active)
      if (!c) return h.fail("This child isn't on the list any more.")
      c.active = false
      for (const g of db.guardianships.filter((x) => x.child_id === c.id)) {
        const others = db.guardianships.some((x) => x.guardian_id === g.guardian_id && db.children.find((k) => k.id === x.child_id)?.active)
        const staff = db.staff_roles.some((r) => r.profile_id === g.guardian_id)
        if (!others && !staff) Object.assign(db.profiles.find((p) => p.id === g.guardian_id) ?? {}, { app_access: false })
      }
      return h.json(null)
    }
    case 'log_call_trip': {
      if (!me || !db.staff_roles.some((r) => r.profile_id === me.id && ['admin', 'core', 'coordinator', 'pro'].includes(String(r.role)))) return h.fail('Only school staff can log a call.', '42501')
      const guardian = db.profiles.find((p) => p.id === args.p_guardian && p.active)
      if (!guardian || !db.guardianships.some((g) => g.child_id === args.p_child && g.guardian_id === args.p_guardian)) return h.fail("guardian_required: Choose one of the child's parents or family.")
      // Book it as the parent who phoned (the same rules as their own tap), then mark who took the call.
      const res = h.startTrip(db as never, guardian, { p_child: args.p_child, p_direction: args.p_direction, p_minutes: args.p_minutes, p_reason: args.p_reason })
      if (!res.ok) return res
      const t = db.trips.find((x) => x.child_id === args.p_child && x.direction === args.p_direction && x.status === 'en_route')!
      t.phoned_in_by = me.id
      return h.json(t)
    }
    default:
      return null
  }
}

/** The database's own rules on plain writes (0011, 0012): classes follow programmes; admins and the last guardian are protected. */
export function checkWrite(db: AdminDb, method: string, table: string, rows: Row[], body: Row | null, me: Row | undefined, h: Helpers): Response | null {
  const byApp = !!me
  if (table === 'children' && method === 'PATCH' && body?.programme_id) {
    body.class_id = db.programmes.find((p) => p.id === body.programme_id)?.class_id
  }
  if (table === 'profiles' && method === 'PATCH' && byApp && (body?.active === false || body?.app_access === false)
      && rows.some((p) => db.staff_roles.some((r) => r.profile_id === p.id && r.role === 'admin'))) {
    return h.fail("admin_locked: An admin's access can't be switched off in the app.", '42501')
  }
  if (table === 'staff_roles' && byApp && ((method === 'POST' && (body as Row | null)?.role === 'admin') || (method === 'DELETE' && rows.some((r) => r.role === 'admin')))) {
    return h.fail("admin_locked: Only the school's owners are admins, and that can't be changed in the app.", '42501')
  }
  if (table === 'saved_people' && (method === 'POST' ? (body as Row | null)?.owner !== me?.id : rows.some((r) => r.owner !== me?.id))) {
    return h.fail('new row violates row-level security policy', '42501')
  }
  if (table === 'guardianships' && method === 'DELETE') {
    for (const g of rows) {
      if (!db.guardianships.some((x) => x.child_id === g.child_id && x.guardian_id !== g.guardian_id)) return h.fail("last_guardian: The last parent or relative can't be removed. Add another first.")
    }
  }
  return null
}

export const kindOfRelation = (relation: string) => (PARENTS.includes(relation.split(',')[0]!.trim().toLowerCase()) ? 'parent' : 'family')

/** Like app.audit(): every changed row of an audited table, before and after, with who did it. */
const AUDITED: Record<string, (r: Row) => string> = {
  profiles: (r) => String(r.id), staff_roles: (r) => `${r.profile_id}|${r.role}`, programmes: (r) => String(r.id), classes: (r) => String(r.id),
  children: (r) => String(r.id), guardianships: (r) => `${r.child_id}|${r.guardian_id}`, coordinator_classes: (r) => `${r.profile_id}|${r.class_id}`,
  child_schedules: (r) => `${r.child_id}|${r.weekday}`, attendance: (r) => `${r.child_id}|${r.day}`, settings: () => 'settings', trips: (r) => String(r.id),
}
export function auditChanges(before: Record<string, Row[]>, after: Record<string, Row[]>, actor: unknown, at: string, nextId: () => number): Row[] {
  const out: Row[] = []
  for (const [table, key] of Object.entries(AUDITED)) {
    const was = new Map((before[table] ?? []).map((r) => [key(r), r]))
    const now = new Map((after[table] ?? []).map((r) => [key(r), r]))
    const push = (action: string, old_row: Row | null, new_row: Row | null) => out.push({ id: nextId(), at, actor, action, table_name: table, old_row, new_row })
    for (const [k, r] of now) {
      const o = was.get(k)
      if (!o) push('insert', null, r)
      else if (JSON.stringify(o) !== JSON.stringify(r)) push('update', o, r)
    }
    for (const [k, r] of was) if (!now.has(k)) push('delete', r, null)
  }
  return out
}
