/**
 * DEMO MODE — the in-browser stand-in for migrations 0013 and 0019 (attendance, today's times, classes and programme timings, regular times,
 * messages, announcements, logged calls, saved people), with the same rules. Sample data only.
 */
import { indiaClock } from '../domain/time'
import { demoClockOffset } from './demo'

type Row = Record<string, unknown>
export interface SchoolDb {
  profiles: Row[]; staff_roles: Row[]; children: Row[]; guardianships: Row[]; programmes: Row[]; classes: Row[]; trips: Row[]; attendance: Row[]
  child_schedules: Row[]; day_times: Row[]; messages: Row[]; message_reads: Row[]; announcements: Row[]; announcement_reads: Row[]; calls: Row[]; saved_people: Row[]; pronunciations: Row[]
}
interface Helpers { json: (body: unknown, status?: number) => Response; fail: (message: string, code?: string) => Response; startTrip: (db: never, me: Row | undefined, args: Row) => Response }

const demoNow = () => Date.now() + demoClockOffset()
const iso = () => new Date(demoNow()).toISOString()
const today = () => indiaClock(new Date(demoNow())).date
const hm = (v: unknown) => { const [a, b] = String(v).split(':').map(Number); return a! * 60 + b! }
const t = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`
const has = (db: SchoolDb, me: Row | undefined, ...roles: string[]) => !!me && db.staff_roles.some((r) => r.profile_id === me.id && roles.includes(String(r.role)))
const isGuardian = (db: SchoolDb, me: Row | undefined, child: unknown) => !!me && db.guardianships.some((g) => g.child_id === child && g.guardian_id === me.id)
const programmeOf = (db: SchoolDb, child: unknown) => { const c = db.children.find((x) => x.id === child && x.active); return c ? db.programmes.find((p) => p.id === c.programme_id) : undefined }
const WORD = (d: unknown) => (d === 'pickup' ? 'pickup' : 'drop-off')
const clock12 = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${m >= 720 ? 'PM' : 'AM'}`

function cancelDay(db: SchoolDb, me: Row | undefined, child: unknown, day: unknown) {
  for (const x of db.trips) if (x.child_id === child && x.day === day && x.status === 'en_route') Object.assign(x, { status: 'cancelled', closed_by: me?.id ?? null, closed_at: iso(), updated_at: iso() })
}

function setDayTime(db: SchoolDb, child: unknown, direction: unknown, at: unknown, reason: unknown, by: unknown, h: Helpers): Response | Row {
  const p = programmeOf(db, child)
  if (!p) return h.fail('This child is not registered with the school.')
  const d = today()
  const now = indiaClock(new Date(demoNow()))
  const m = hm(at)
  if (m < now.minutes + 5) return h.fail('too_soon: Choose a time at least 5 minutes from now.')
  if (db.attendance.some((a) => a.child_id === child && a.day === d && a.status !== 'present')) return h.fail('not_coming: This child is marked as not coming today.')
  if (db.trips.some((x) => x.child_id === child && x.direction === direction && x.day === d && (x.status === 'handed_over' || x.status === 'checked_in'))) return h.fail('already_done: That has already happened today.')
  const [from, to] = p.flexible ? [p.starts, p.ends] : direction === 'pickup' ? [p.pickup_from, p.pickup_to] : [p.dropoff_from, p.dropoff_to]
  const flagged = m < hm(from) || m > hm(to)
  const why = typeof reason === 'string' && reason.trim() ? reason.trim() : null
  if (flagged && !why) return h.fail("reason_required: This time is outside the child's window. Tell the school why.")
  const row = { child_id: child, day: d, direction, at: t(m), reason: flagged ? why : null, set_by: by, set_at: iso() }
  const i = db.day_times.findIndex((x) => x.child_id === child && x.day === d && x.direction === direction)
  if (i >= 0) db.day_times[i] = row
  else db.day_times.push(row)
  const open = db.trips.find((x) => x.child_id === child && x.direction === direction && x.day === d && x.status === 'en_route')
  if (open) Object.assign(open, { arrive_at: new Date(`${d}T${t(m).slice(0, 5)}:00+05:30`).toISOString(), off_schedule: flagged, reason: flagged ? why : null, updated_at: iso(), acknowledged_by: null, acknowledged_at: null })
  return row
}

const recipients = (db: SchoolDb, classId: unknown) => new Set(db.guardianships.filter((g) => {
  const c = db.children.find((x) => x.id === g.child_id && x.active)
  const p = db.profiles.find((x) => x.id === g.guardian_id && x.active && x.app_access !== false)
  return c && p && (!classId || c.class_id === classId)
}).map((g) => String(g.guardian_id)))

/** Returns the reply for a 0013 function, or null when `fn` isn't one of them. */
export function schoolRpc(db: SchoolDb, fn: string, a: Row, me: Row | undefined, h: Helpers): Response | null {
  const planner = has(db, me, 'admin', 'core')
  const office = has(db, me, 'admin', 'core', 'pro')
  switch (fn) {
    case 'set_attendance': {
      if (!planner) return h.fail('Only the core team or the admin can mark attendance.', '42501')
      const row = db.attendance.find((x) => x.child_id === a.p_child && x.day === a.p_day)
      const patch = { status: a.p_status, note: a.p_note || null, reported_by: me!.id }
      if (row) Object.assign(row, patch)
      else db.attendance.push({ child_id: a.p_child, day: a.p_day, checked_in_at: null, checked_out_at: null, ...patch })
      if (a.p_status !== 'present') cancelDay(db, me, a.p_child, a.p_day)
      return h.json(null)
    }
    case 'report_absence': {
      if (!isGuardian(db, me, a.p_child)) return h.fail("Only this child's parents can do this.", '42501')
      const d = String(a.p_day), t0 = today()
      if (d < t0 || Date.parse(d) > Date.parse(t0) + 14 * 86_400_000) return h.fail('bad_day: Choose today or a day in the next two weeks.')
      if (!String(a.p_reason ?? '').trim()) return h.fail('reason_required: Say why, in a few words.')
      const row = db.attendance.find((x) => x.child_id === a.p_child && x.day === d)
      if (row?.checked_in_at) return h.fail('already_here: This child is already checked in today. Call the school.')
      if (row) Object.assign(row, { status: 'absent', note: String(a.p_reason).trim(), reported_by: me!.id })
      else db.attendance.push({ child_id: a.p_child, day: d, status: 'absent', note: String(a.p_reason).trim(), reported_by: me!.id, checked_in_at: null, checked_out_at: null })
      cancelDay(db, me, a.p_child, d)
      return h.json(null)
    }
    case 'undo_absence': {
      if (!isGuardian(db, me, a.p_child)) return h.fail("Only this child's parents can do this.", '42501')
      const i = db.attendance.findIndex((x) => x.child_id === a.p_child && x.day === a.p_day && x.status === 'absent' && !x.checked_in_at
        && db.guardianships.some((g) => g.child_id === a.p_child && g.guardian_id === x.reported_by))
      if (i < 0) return h.fail('not_yours: The school marked this. Please call the school to change it.')
      db.attendance.splice(i, 1)
      return h.json(null)
    }
    case 'change_day_time': {
      if (!(isGuardian(db, me, a.p_child) || planner)) return h.fail("Only this child's parents or the school can do this.", '42501')
      const r = setDayTime(db, a.p_child, a.p_direction, a.p_at, a.p_reason, me!.id, h)
      return r instanceof Response ? r : h.json(r)
    }
    // 0027: how the gate says a name (the admin's list); an empty spoken form removes it.
    case 'admin_set_pronunciation': {
      if (!has(db, me, 'admin')) return h.fail('Only the admin can change pronunciations.', '42501')
      const w = String(a.p_written ?? '').trim().toLowerCase()
      const sp = String(a.p_spoken ?? '').trim()
      if (!w || /\s/.test(w) || w.length > 60) return h.fail('bad_word: Enter one name, like Shreyas.')
      db.pronunciations = db.pronunciations.filter((r) => r.written !== w)
      if (sp) {
        if (sp.length > 80) return h.fail("bad_spoken: Keep how it's said under 80 letters.")
        db.pronunciations.push({ written: w, spoken: sp, set_by: me!.id, set_at: new Date().toISOString() })
      }
      return h.json(null)
    }
    // 0019: the admin adds classes and programmes; drop-off and pickup are set by hand.
    case 'admin_add_class': {
      if (!has(db, me, 'admin')) return h.fail('Only the admin can add classes.', '42501')
      const n = String(a.p_name ?? '').trim()
      if (!n || n.length > 60 || n.includes('·')) return h.fail('bad_name: Give the class a name of up to 60 letters, without "·".')
      if (db.classes.some((c) => String(c.name).toLowerCase() === n.toLowerCase())) return h.fail(`taken: There is already a class called ${n}.`)
      const c = { id: crypto.randomUUID(), name: n, active: true, sort: Math.max(0, ...db.classes.map((x) => Number(x.sort))) + 1 }
      db.classes.push(c)
      return h.json(c)
    }
    case 'save_programme': {
      const admin = has(db, me, 'admin')
      if (!planner) return h.fail('Only the core team or the admin can change timings.', '42501')
      if (!admin && (a.p_programme == null || a.p_plan != null || a.p_weekdays != null || a.p_saturday_rule != null)) return h.fail('Only the admin can add a programme or change its name or days.', '42501')
      const p = a.p_programme == null ? null : db.programmes.find((x) => x.id === a.p_programme)
      if (a.p_programme != null && !p) return h.fail('gone: This programme no longer exists.')
      if (p && String(p.name).startsWith('Learning Center') && !admin) return h.fail("school_rule: The Learning Center's times are the school's rule. Ask the admin to change them.")
      const cls = db.classes.find((c) => c.id === (p ? p.class_id : a.p_class) && c.active)
      if (!cls) return h.fail('gone: This class no longer exists.')
      const plan = String(a.p_plan ?? '').trim()
      if (plan.length > 40 || plan.includes('·')) return h.fail('bad_name: Give the programme a name of up to 40 letters, without "·".')
      const name = !p || a.p_plan != null ? `${cls.name}${plan ? ` · ${plan}` : ''}` : String(p.name)
      if (db.programmes.some((x) => String(x.name).toLowerCase() === name.toLowerCase() && x.id !== p?.id)) return h.fail(`taken: ${cls.name} already has a programme called that.`)
      const wd = a.p_weekdays as number[] | null
      if ((!p && !wd) || (wd && (wd.length < 1 || wd.length > 6 || wd.some((d) => d < 1 || d > 6)))) return h.fail('bad_days: Choose the days, Monday to Saturday.')
      const [s, e, df, dt, pf, pt] = [a.p_starts, a.p_ends, a.p_dropoff_from, a.p_dropoff_to, a.p_pickup_from, a.p_pickup_to].map(hm) as [number, number, number, number, number, number]
      if (s < 540 || e > 1140) return h.fail('outside_hours: Classes run inside 9:00 AM to 7:00 PM.')
      if (e < s + 30) return h.fail('too_short: A class needs at least 30 minutes between start and end.')
      if (df < 525 || pt > 1155) return h.fail('outside_gate: The gate is open from 8:45 AM to 7:15 PM.')
      if (df >= dt) return h.fail('bad_dropoff: Drop-off must end after it starts.')
      if (pf >= pt) return h.fail('bad_pickup: Pickup must end after it starts.')
      if (dt > e) return h.fail('bad_dropoff: Drop-off must close by the time the class ends.')
      if (pf < s) return h.fail("bad_pickup: Pickup can't open before the class starts.")
      const times = { starts: t(s), ends: t(e), flexible: false, dropoff_from: t(df), dropoff_to: t(dt), pickup_from: t(pf), pickup_to: t(pt) }
      if (!p) {
        const row = { id: crypto.randomUUID(), name, class_id: cls.id, weekdays: wd, saturday_rule: a.p_saturday_rule ?? 'every', term_start: null, term_end: null, extended: !!a.p_extended, active: true, ...times }
        db.programmes.push(row)
        return h.json(row)
      }
      Object.assign(p, times, { name, extended: a.p_extended ?? p.extended }, wd ? { weekdays: wd } : {}, a.p_saturday_rule ? { saturday_rule: a.p_saturday_rule } : {})
      return h.json(p)
    }
    case 'set_regular_times': {
      if (!planner) return h.fail('Only the core team or the admin can set regular times.', '42501')
      const p = programmeOf(db, a.p_child)
      if (!p) return h.fail('This child is not registered with the school.')
      if (a.p_dropoff && a.p_pickup) {
        const d = hm(a.p_dropoff), k = hm(a.p_pickup)
        const [df, dt, pf, pt] = p.flexible ? [p.starts, p.ends, p.starts, p.ends] : [p.dropoff_from, p.dropoff_to, p.pickup_from, p.pickup_to]
        if (d < hm(df) || d > hm(dt)) return h.fail(`Drop-off must be within the ${p.name} drop-off window`, '23514')
        if (k < hm(pf) || k > hm(pt)) return h.fail(`Pickup must be within the ${p.name} pickup window`, '23514')
      }
      db.child_schedules = db.child_schedules.filter((x) => x.child_id !== a.p_child)
      if (a.p_dropoff && a.p_pickup) for (const w of p.weekdays as number[]) db.child_schedules.push({ child_id: a.p_child, weekday: w, dropoff: t(hm(a.p_dropoff)), pickup: t(hm(a.p_pickup)) })
      return h.json(null)
    }
    case 'send_message': {
      const guardian = db.guardianships.find((g) => g.child_id === a.p_child && g.guardian_id === me?.id)
      if (!me || !(guardian || office)) return h.fail('Only this child\'s family or the school office can write here.', '42501')
      const body = String(a.p_body ?? '').trim()
      if (!body || body.length > 1000) return h.fail('Write a message first.', '23514')
      const role = guardian ? guardian.kind ?? 'parent' : has(db, me, 'core') ? 'core' : has(db, me, 'pro') ? 'pro' : 'admin'
      const m = { id: db.messages.length + 1, child_id: a.p_child, sender: me.id, sender_name: me.full_name, sender_role: role, body, created_at: iso() }
      db.messages.push(m)
      db.message_reads = [...db.message_reads.filter((r) => !(r.profile_id === me.id && r.child_id === a.p_child)), { profile_id: me.id, child_id: a.p_child, read_at: iso() }]
      return h.json(m)
    }
    case 'mark_read': {
      if (me && (isGuardian(db, me, a.p_child) || office)) db.message_reads = [...db.message_reads.filter((r) => !(r.profile_id === me.id && r.child_id === a.p_child)), { profile_id: me.id, child_id: a.p_child, read_at: iso() }]
      return h.json(null)
    }
    case 'send_announcement': {
      if (!office) return h.fail('Only the admin, the core team or the front desk can send announcements.', '42501')
      const title = String(a.p_title ?? '').trim(), body = String(a.p_body ?? '').trim()
      if (title.length < 3 || title.length > 60 || body.length < 5 || body.length > 300) return h.fail('Check the title and message.', '23514')
      const n = { id: crypto.randomUUID(), title, body, class_id: a.p_class ?? null, sent_by: me!.id, sender_name: me!.full_name, sender_role: has(db, me, 'core') ? 'core team' : has(db, me, 'pro') ? 'front desk' : 'admin', created_at: iso() }
      db.announcements.push(n)
      return h.json(n)
    }
    case 'mark_announcement_read': {
      const n = db.announcements.find((x) => x.id === a.p_announcement)
      if (n && me && recipients(db, n.class_id).has(String(me.id)) && !db.announcement_reads.some((r) => r.announcement_id === n.id && r.profile_id === me.id)) db.announcement_reads.push({ announcement_id: n.id, profile_id: me.id, read_at: iso() })
      return h.json(null)
    }
    case 'announcement_stats':
      return h.json(office ? db.announcements.map((n) => ({ announcement_id: n.id, recipients: recipients(db, n.class_id).size, reads: db.announcement_reads.filter((r) => r.announcement_id === n.id).length })) : [])
    case 'recipient_count':
      return h.json(office ? recipients(db, a.p_class ?? null).size : null)
    case 'log_call': {
      if (!has(db, me, 'admin', 'core', 'coordinator', 'pro')) return h.fail('Only school staff can log a call.', '42501')
      const g = db.guardianships.find((x) => x.child_id === a.p_child && x.guardian_id === a.p_guardian)
      const guardian = db.profiles.find((p) => p.id === a.p_guardian && p.active)
      if (!g || !guardian) return h.fail("guardian_required: Choose one of the child's parents or family.")
      let summary: string
      if (a.p_what === 'otw') {
        const r = h.startTrip(db as never, guardian, { p_child: a.p_child, p_direction: a.p_direction, p_minutes: a.p_minutes, p_reason: a.p_reason })
        if (!r.ok) return r
        const trip = db.trips.find((x) => x.child_id === a.p_child && x.direction === a.p_direction && x.status === 'en_route')!
        trip.phoned_in_by = me!.id
        summary = `On the way for the ${WORD(a.p_direction)}, about ${clock12(indiaClock(new Date(String(trip.arrive_at))).minutes)}`
      } else if (a.p_what === 'time') {
        const r = setDayTime(db, a.p_child, a.p_direction, a.p_at, a.p_reason, a.p_guardian, h)
        if (r instanceof Response) return r
        summary = `New ${WORD(a.p_direction)} time today, ${clock12(hm(a.p_at))}`
      } else if (a.p_what === 'absent') {
        const why = String(a.p_reason ?? '').trim()
        if (!why) return h.fail('reason_required: Say why, in a few words.')
        const d = today(), row = db.attendance.find((x) => x.child_id === a.p_child && x.day === d)
        if (row) Object.assign(row, { status: 'absent', note: why, reported_by: a.p_guardian })
        else db.attendance.push({ child_id: a.p_child, day: d, status: 'absent', note: why, reported_by: a.p_guardian, checked_in_at: null, checked_out_at: null })
        cancelDay(db, me, a.p_child, d)
        summary = `Absent today: ${why}`
      } else {
        const note = String(a.p_note ?? '').trim()
        if (!note || note.length > 280) return h.fail('note_required: Write what they said (up to 280 characters).')
        summary = note
      }
      const id = db.calls.length + 1
      db.calls.push({ id, child_id: a.p_child, guardian_id: a.p_guardian, what: a.p_what, summary, logged_by: me!.id, created_at: iso() })
      return h.json(id)
    }
    case 'save_push_subscription':
      // The demo keeps the device; nothing is sent (there is no push service behind sample data).
      return me ? h.json(null) : h.fail('Sign in first.', '42501')
    case 'gate_walk_in': {
      if (!has(db, me, 'admin', 'coordinator')) return h.fail('Only coordinators can do this at the gate.', '42501')
      const c = db.children.find((x) => x.id === a.p_child && x.active)
      if (!c) return h.fail('This child is not registered with the school.')
      const d = today()
      if (db.attendance.some((x) => x.child_id === c.id && x.day === d && x.status !== 'present')) return h.fail('not_coming: This child is marked as not coming today. Check with the core team first.')
      if (db.trips.some((x) => x.child_id === c.id && x.day === d && x.direction === a.p_direction && (x.status === 'handed_over' || x.status === 'checked_in'))) return h.fail(`already_done: ${a.p_direction === 'pickup' ? 'This child has already been collected today.' : 'This child is already checked in.'}`)
      if (db.trips.some((x) => x.child_id === c.id && x.day === d && x.direction === a.p_direction && x.status === 'en_route')) return h.fail("on_the_way: Someone already said they're on the way. Use that request in the queue.")
      let name = 'At the gate', relation: unknown = null
      if (a.p_direction === 'pickup') {
        const g = db.guardianships.find((x) => x.child_id === c.id && x.guardian_id === a.p_handed_to)
        const p = db.profiles.find((x) => x.id === a.p_handed_to && x.active)
        if (!g || !p) return h.fail("guardian_required: Choose one of the child's registered parents or family. Anyone else needs a link and a code from a parent.")
        name = String(p.full_name); relation = g.relation
      }
      const at = iso()
      const trip = { id: crypto.randomUUID(), child_id: c.id, direction: a.p_direction, day: d, status: a.p_direction === 'pickup' ? 'handed_over' : 'checked_in', arrive_at: at, off_schedule: false, reason: null,
        created_by: a.p_handed_to ?? me!.id, traveller_name: name, traveller_relation: relation, created_at: at, updated_at: at, acknowledged_by: me!.id, acknowledged_at: at, ready_by: null, ready_at: null,
        closed_by: me!.id, closed_at: at, handed_to: a.p_handed_to ?? null, traveller_kind: 'guardian' }
      db.trips.push(trip)
      const row = db.attendance.find((x) => x.child_id === c.id && x.day === d)
      const patch = a.p_direction === 'dropoff' ? { checked_in_at: row?.checked_in_at ?? at } : { checked_out_at: at }
      if (row) Object.assign(row, { status: 'present', ...patch })
      else db.attendance.push({ child_id: c.id, day: d, status: 'present', checked_in_at: null, checked_out_at: null, ...patch })
      return h.json(trip)
    }
    case 'gate_load': {
      // Counts only, like the database: expected time per child today, never who.
      const d = today(), wd = indiaClock(new Date(demoNow())).weekday, counts = new Map<string, number>()
      for (const c of db.children.filter((x) => x.active)) {
        const p = db.programmes.find((x) => x.id === c.programme_id)
        if (!p || !(p.weekdays as number[]).includes(wd)) continue
        if (db.attendance.some((x) => x.child_id === c.id && x.day === d && x.status !== 'present')) continue
        if (db.trips.some((x) => x.child_id === c.id && x.day === d && x.direction === a.p_direction && (x.status === 'handed_over' || x.status === 'checked_in'))) continue
        const open = db.trips.find((x) => x.child_id === c.id && x.day === d && x.direction === a.p_direction && x.status === 'en_route')
        const dt = db.day_times.find((x) => x.child_id === c.id && x.day === d && x.direction === a.p_direction)
        const reg = db.child_schedules.find((x) => x.child_id === c.id && x.weekday === wd)
        const at = open ? t(indiaClock(new Date(String(open.arrive_at))).minutes) : dt ? String(dt.at) : reg ? String(a.p_direction === 'pickup' ? reg.pickup : reg.dropoff) : null
        if (at) counts.set(at, (counts.get(at) ?? 0) + 1)
      }
      return h.json([...counts].map(([at, children]) => ({ at, children })))
    }
    case 'my_family':
      return h.json(me ? db.guardianships.filter((g) => g.guardian_id !== me.id && isGuardian(db, me, g.child_id) && db.children.find((c) => c.id === g.child_id)?.active).map((g) => {
        const p = db.profiles.find((x) => x.id === g.guardian_id)!
        return { child_id: g.child_id, full_name: p.full_name, relation: g.relation, kind: g.kind ?? 'parent', abroad: !!p.abroad, has_app: p.app_access !== false && !!p.user_id }
      }) : [])
    case 'set_my_notifications':
      if (me) Object.assign(me, { notify_morning: !!a.p_morning, notify_family: !!a.p_family })
      return h.json(null)
    default:
      return null
  }
}

/** Row visibility for the 0013 tables, like their row-level security. */
export function visibleRows(db: SchoolDb, table: string, rows: Row[], me: Row | undefined): Row[] {
  const office = has(db, me, 'admin', 'core', 'pro')
  const staff = has(db, me, 'admin', 'core', 'coordinator', 'pro')
  switch (table) {
    case 'messages': return rows.filter((r) => office || isGuardian(db, me, r.child_id))
    case 'announcements': return rows.filter((r) => staff || (!!me && recipients(db, r.class_id).has(String(me.id))))
    case 'calls': return staff ? rows : []
    case 'message_reads': case 'announcement_reads': return rows.filter((r) => r.profile_id === me?.id)
    case 'saved_people': return rows.filter((r) => r.owner === me?.id)
    // 0024 (D38): a trip's location only for the parent who sent a one-off collector's link.
    case 'trip_points': return rows.filter((r) => { const t = db.trips.find((x) => x.id === r.trip_id); return !!t && !!me && t.traveller_kind === 'third_person' && t.created_by === me.id && isGuardian(db, me, t.child_id) })
    default: return rows
  }
}
