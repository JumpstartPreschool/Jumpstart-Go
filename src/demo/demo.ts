/**
 * DEMO MODE — sample data only, for trying every role's screens before real sign-in is set up.
 *
 * Available only in development and design-review builds (never production). While it is on, the Supabase
 * client talks to the tiny in-browser backend below instead of the network, so nothing reaches the school's
 * real database. Sign-in stays in each tab (sessionStorage); the sample data is shared by this browser's demo tabs
 * (localStorage), so a parent's phone in one window and a coordinator's iPad in another see each other live.
 * The clock is pinned to a school day at 12:10 PM, so every flow can be tried at any hour.
 */
import type { Area } from '../features/auth/session'
import { indiaClock } from '../domain/time'
import PROGRAMMES from './programmes.json'
import { trackingRpc, type TrackingDb } from './demoTracking'
import { schoolRpc, visibleRows, type SchoolDb } from './demoSchool'
import { adminRpc, auditChanges, checkWrite, kindOfRelation, LEVELS, levelId, levelOfProgramme, type AdminDb } from './demoAdmin'

// Only when asked for (npm run dev:demo, or a design build): a normal dev server and every production build have no demo.
export const DEMO_AVAILABLE = import.meta.env.VITE_DESIGN_PREVIEW === 'true'
export const DEMO_EMAIL = 'ai@jumpstartpreschool.in'
/** The dummy one-time code, filled in for you on the demo sign-in. Any other code is refused, so the error can be tried too. */
export const DEMO_CODE = '246810'
/** One sample account per area, offered as chips on the sign-in screen (the Screen Book's demo accounts). */
/** `hint` says what the account opens; `tone` tints its icon on the sign-in page. */
export const DEMO_ACCOUNTS: Array<{ area: Area; email: string; label?: string; hint: string; tone: string }> = [
  { area: 'parent', email: 'neha@example.com', hint: 'Today and trips', tone: 'var(--rb-blue)' },
  { area: 'parent', email: 'lata@example.com', label: 'Family', hint: 'A grandparent', tone: 'var(--rb-red)' },
  { area: 'coordinator', email: 'sunita@example.com', hint: 'The gate tablet', tone: 'var(--rb-orange)' },
  { area: 'core', email: 'meera@example.com', hint: "Today's board", tone: 'var(--rb-teal)' },
  { area: 'pro', email: 'frontdesk@example.com', hint: 'Phone calls', tone: 'var(--rb-violet)' },
  { area: 'admin', email: DEMO_EMAIL, hint: 'Full access', tone: 'var(--rb-green)' },
]

const FLAG = 'jumpstart-demo'
export const DEMO_DB_KEY = 'jumpstart-demo-db-v3'
const CLOCK = 'jumpstart-demo-clock'
/** The demo's "now": Thursday 24 September 2026, 12:10 PM India time, running on from when the demo began. */
const DEMO_START = Date.parse('2026-09-24T12:10:00+05:30')
export const DEMO_CHANGE_EVENT = 'jumpstart-demo-change'

function store(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}
function shared(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Milliseconds to add to the device clock (0 outside demo mode). */
export function demoClockOffset(): number {
  if (!isDemo()) return 0
  const s = shared()
  let realStart = Number(s?.getItem(CLOCK))
  if (!realStart) {
    realStart = Date.now()
    s?.setItem(CLOCK, String(realStart))
  }
  return DEMO_START - realStart
}

export function isDemo(): boolean {
  return DEMO_AVAILABLE && store()?.getItem(FLAG) === '1'
}

export function enterDemo() {
  store()?.setItem(FLAG, '1')
}

export function leaveDemo() {
  if (!DEMO_AVAILABLE) return
  for (const s of [store(), shared()]) {
    if (!s) continue
    for (const key of Object.keys(s)) if (key.startsWith('jumpstart-demo') || (s === store() && key.startsWith('sb-'))) s.removeItem(key)
  }
}

// ---- Sample data ------------------------------------------------------------------------------------

type Row = Record<string, unknown>
type Db = Record<'profiles' | 'staff_roles' | 'classes' | 'programmes' | 'children' | 'guardianships' | 'child_schedules' | 'coordinator_classes' | 'trips' | 'attendance' | 'trip_points' | 'trip_links' | 'settings' | 'audit_log' | 'day_times' | 'messages' | 'message_reads' | 'announcements' | 'announcement_reads' | 'calls' | 'saved_people' | 'pronunciations', Row[]>

const programmeId = (name: string) => PROGRAMMES.find((p) => p.name === name)!.id
const OWNER = 'demo-owner'

function seed(): Db {
  const profiles = [
    { id: OWNER, full_name: 'Ankit Singh', email: DEMO_EMAIL, phone: '+919800000001', active: true, user_id: null, consent_version: null },
    { id: 'demo-meera', full_name: 'Meera Kulkarni', email: 'meera@example.com', phone: '+919800000002', active: true, user_id: 'u-meera' },
    { id: 'demo-sunita', full_name: 'Sunita Pawar', email: 'sunita@example.com', phone: '+919800000003', active: true, user_id: 'u-sunita' },
    { id: 'demo-farah', full_name: 'Farah Khan', email: 'farah@example.com', phone: null, active: true, user_id: null },
    { id: 'demo-neha', full_name: 'Neha Shah', email: 'neha@example.com', phone: '+919800000011', active: true, user_id: 'u-neha' },
    { id: 'demo-rohan', full_name: 'Rohan Patil', email: 'rohan@example.com', phone: '+919800000012', active: true, user_id: null },
    { id: 'demo-anjali', full_name: 'Anjali Joshi', email: 'anjali@example.com', phone: '+919800000013', active: true, user_id: 'u-anjali' },
    { id: 'demo-priti', full_name: 'Priti Mehta', email: null, phone: '+919800000014', active: false, user_id: 'u-priti' },
    // Isha's grandmother: family who collects and has the app (D26).
    { id: 'demo-lata', full_name: 'Lata Patil', email: 'lata@example.com', phone: '+919800000015', active: true, user_id: null },
    { id: 'demo-desk', full_name: 'Front Desk', email: 'frontdesk@example.com', phone: null, active: true, user_id: null },
  ].map((p) => ({ app_access: p.active, abroad: false, notify_morning: true, notify_family: true, ...p }))
  // The classes are the levels (D18); each programme belongs to one, and a child's class follows their programme.
  const classes = LEVELS.map((name, i) => ({ id: levelId(name), name, active: true, sort: i + 1 }))
  const child = (id: string, full_name: string, preferred_name: string | null, date_of_birth: string, programme: string, gender: 'boy' | 'girl') =>
    ({ id, full_name, preferred_name, date_of_birth, class_id: levelOfProgramme(programme), programme_id: programmeId(programme), active: true, gender })
  return {
    profiles,
    staff_roles: [
      ...['admin', 'core', 'coordinator'].map((role) => ({ profile_id: OWNER, role })),
      { profile_id: 'demo-meera', role: 'core' },
      { profile_id: 'demo-sunita', role: 'coordinator' },
      { profile_id: 'demo-farah', role: 'coordinator' },
      { profile_id: 'demo-desk', role: 'pro' },
    ],
    classes,
    programmes: PROGRAMMES.map((p) => ({ ...p, active: true, class_id: levelOfProgramme(p.name) })),
    children: [
      child('demo-anaya', 'Anaya Singh', null, '2022-03-14', 'Jr KG · Half day', 'girl'),
      child('demo-kabir', 'Kabir Shah', null, '2023-01-20', 'Nursery · 360°', 'boy'),
      child('demo-isha', 'Isha Patil', 'Ishu', '2020-11-02', 'Sr KG · Half day', 'girl'),
      child('demo-riya', 'Riya Joshi', null, '2020-08-09', 'Learning Center', 'girl'),
    ],
    guardianships: [
      { child_id: 'demo-anaya', guardian_id: OWNER, relation: 'Father' },
      { child_id: 'demo-kabir', guardian_id: 'demo-neha', relation: 'Mother' },
      { child_id: 'demo-isha', guardian_id: 'demo-rohan', relation: 'Father' },
      { child_id: 'demo-isha', guardian_id: 'demo-lata', relation: "Grandmother, father's side" },
      { child_id: 'demo-riya', guardian_id: 'demo-anjali', relation: 'Mother' },
    ].map((g) => ({ ...g, kind: kindOfRelation(g.relation) })),
    // Sunita covers Nursery and Jr KG, the owner covers Jr KG, and Sr KG has nobody yet (announced to everyone).
    coordinator_classes: [
      { profile_id: 'demo-sunita', class_id: levelId('Nursery') },
      { profile_id: 'demo-sunita', class_id: levelId('Jr KG') },
      { profile_id: OWNER, class_id: levelId('Jr KG') },
    ],
    // Kabir has regular times set by the core team; the others still show their programme's windows.
    child_schedules: [1, 2, 3, 4, 5].map((weekday) => ({ child_id: 'demo-kabir', weekday, dropoff: '11:40:00', pickup: '17:35:00' })),
    // The demo day so far: Anaya was checked in this morning, and Isha's father is on his way to collect her.
    trips: [
      demoTrip({ id: 'demo-trip-anaya-in', child_id: 'demo-anaya', direction: 'dropoff', status: 'checked_in', arrive_at: demoAt('09:05'), created_by: OWNER,
        traveller_name: 'Ankit Singh', traveller_relation: 'Parent', created_at: demoAt('08:48'), acknowledged_by: 'demo-sunita', acknowledged_at: demoAt('08:50'),
        closed_by: 'demo-sunita', closed_at: demoAt('09:04') }),
      demoTrip({ id: 'demo-trip-isha-out', child_id: 'demo-isha', direction: 'pickup', arrive_at: demoAt('12:40'), created_by: 'demo-rohan',
        traveller_name: 'Rohan Patil', traveller_relation: 'Father', created_at: demoAt('12:04') }),
    ],
    attendance: [
      { child_id: 'demo-anaya', day: DEMO_DAY, status: 'present', checked_in_at: demoAt('09:04'), checked_out_at: null },
    ],
    trip_points: [],
    trip_links: [],
    settings: [{ id: true, arrival_radius_m: 200, get_ready_lead_min: 10, late_threshold_min: 10, morning_reminder: true, school_phone: '+912025451234', app_url: null }],
    audit_log: [],
    day_times: [],
    // A conversation and an announcement, so Messages and Updates have something to show.
    messages: [
      { id: 1, child_id: 'demo-kabir', sender: 'demo-neha', sender_name: 'Neha Shah', sender_role: 'parent', body: 'Kabir has a slight cough today. Please keep his water bottle handy.', created_at: demoAt('09:20') },
      { id: 2, child_id: 'demo-kabir', sender: 'demo-meera', sender_name: 'Meera Kulkarni', sender_role: 'core', body: "Thanks, Neha. We'll keep an eye on him and remind him to drink water.", created_at: demoAt('09:32') },
    ],
    message_reads: [{ profile_id: 'demo-neha', child_id: 'demo-kabir', read_at: demoAt('09:20') }, { profile_id: 'demo-meera', child_id: 'demo-kabir', read_at: demoAt('09:32') }],
    announcements: [
      { id: 'demo-ann-1', title: 'Early closing on Friday', body: 'The school closes at 5:00 PM this Friday for Dussehra. Please plan pickups a little earlier.', class_id: null, sent_by: 'demo-meera', sender_name: 'Meera Kulkarni', sender_role: 'core team', created_at: demoAt('08:30') },
    ],
    announcement_reads: [],
    calls: [],
    saved_people: [],
    pronunciations: [],
  }
}

function load(): Db {
  try {
    const saved = shared()?.getItem(DEMO_DB_KEY)
    // Demo data saved before a table was added gets that table from the sample.
    if (saved) return { ...seed(), ...(JSON.parse(saved) as Partial<Db>) }
  } catch {
    // Unreadable demo data: start again from the sample.
  }
  return seed()
}

function save(db: Db) {
  try {
    shared()?.setItem(DEMO_DB_KEY, JSON.stringify(db))
  } catch {
    // Storage full or blocked: the demo keeps working for this page view.
  }
}

// ---- The in-browser backend --------------------------------------------------------------------------

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const pgError = (status: number, code: string, message: string) => json({ code, message, details: null, hint: null }, status)

const b64 = (v: unknown) => btoa(JSON.stringify(v)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const emailFromToken = (token: string | undefined) => {
  try {
    return (JSON.parse(atob((token?.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'))) as { email: string }).email
  } catch {
    return null
  }
}

function sessionFor(db: Db, email: string) {
  const profile = db.profiles.find((p) => p.email === email)!
  if (!profile.user_id) profile.user_id = `u-${profile.id}`
  const exp = Math.floor(Date.now() / 1000) + 3600
  const user = { id: profile.user_id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  return {
    access_token: `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: user.id, email, exp, aal: 'aal1', role: 'authenticated' })}.demo`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: `demo.${email}`,
    user,
  }
}

function whoami(db: Db, email: string | null) {
  const me = db.profiles.find((p) => p.email === email)
  if (!me) return null
  return {
    profile_id: me.id,
    full_name: me.full_name,
    active: me.active,
    consent_version: me.consent_version ?? null,
    roles: db.staff_roles.filter((r) => r.profile_id === me.id).map((r) => r.role),
    children: db.guardianships.filter((g) => g.guardian_id === me.id).length,
  }
}

// ---- Trips, following the same rules as migration 0006 (start_trip, cancel_trip, gate_step) ----------------

const DEMO_DAY = '2026-09-24'
/** A time on the demo day, India time, as an ISO instant. */
function demoAt(hhmm: string): string {
  return new Date(`${DEMO_DAY}T${hhmm}:00+05:30`).toISOString()
}
function demoTrip(t: Row): Row {
  return {
    day: DEMO_DAY, status: 'en_route', off_schedule: false, reason: null, traveller_relation: null, updated_at: t.created_at,
    acknowledged_by: null, acknowledged_at: null, ready_by: null, ready_at: null, closed_by: null, closed_at: null, handed_to: null, ...t,
  }
}
const demoNow = () => Date.now() + demoClockOffset()
const hhmmMinutes = (t: unknown) => { const [h, m] = String(t).split(':').map(Number); return h! * 60 + m! }
const fail = (message: string, code = 'P0001') => pgError(code === '42501' ? 403 : 400, code, message)

function startTrip(db: Db, me: Row | undefined, args: Row): Response {
  const child = db.children.find((c) => c.id === args.p_child)
  const isGuardian = !!me && db.guardianships.some((g) => g.child_id === args.p_child && g.guardian_id === me.id)
  const isPlanner = !!me && db.staff_roles.some((r) => r.profile_id === me.id && (r.role === 'admin' || r.role === 'core'))
  if (!me || !(isGuardian || isPlanner)) return fail("Only this child's parents or the school can do this.", '42501')
  const minutes = Number(args.p_minutes)
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 180) return fail('Choose when you will reach the school.')
  if (!child?.active) return fail('This child is not registered with the school.')
  const p = db.programmes.find((x) => x.id === child.programme_id)!
  const now = new Date(Math.floor(demoNow() / 60_000) * 60_000)
  const today = indiaClock(now)
  const arrive = new Date(now.getTime() + minutes * 60_000)
  const local = indiaClock(arrive)
  if (local.date !== today.date) return fail('outside_hours: That would be after midnight. Choose an earlier time.')
  if (db.attendance.some((a) => a.child_id === child.id && a.day === today.date && a.status !== 'present')) return fail('not_coming: This child is marked as not coming today. Call the school to change that.')
  if (db.trips.some((x) => x.child_id === child.id && x.direction === args.p_direction && x.day === today.date && (x.status === 'handed_over' || x.status === 'checked_in'))) {
    return fail(`already_done: ${args.p_direction === 'pickup' ? 'This child has already been collected today.' : 'This child has already been checked in today.'}`)
  }
  const [from, to] = p.flexible ? [p.starts, p.ends] : args.p_direction === 'pickup' ? [p.pickup_from, p.pickup_to] : [p.dropoff_from, p.dropoff_to]
  const flagged = local.minutes < hhmmMinutes(from) || local.minutes > hhmmMinutes(to)
  const why = typeof args.p_reason === 'string' && args.p_reason.trim() ? args.p_reason.trim() : null
  if (flagged && !why) return fail("reason_required: This time is outside the child's window. Tell the school why.")
  const relation = db.guardianships.find((g) => g.child_id === child.id && g.guardian_id === me.id)?.relation ?? null
  const fields = {
    arrive_at: arrive.toISOString(), off_schedule: flagged, reason: flagged ? why : null, created_by: me.id,
    traveller_name: me.full_name, traveller_relation: relation, updated_at: new Date(demoNow()).toISOString(), acknowledged_by: null, acknowledged_at: null,
  }
  const open = db.trips.find((x) => x.child_id === child.id && x.direction === args.p_direction && x.day === today.date && x.status === 'en_route')
  // Someone else collecting keeps their name and link when a parent moves the time (0009).
  if (open) return json(Object.assign(open, fields, open.traveller_kind === 'third_person' ? { created_by: open.created_by, traveller_name: open.traveller_name, traveller_relation: open.traveller_relation } : {}))
  const trip = demoTrip({ id: crypto.randomUUID(), child_id: child.id, direction: args.p_direction, day: today.date, created_at: fields.updated_at, ...fields })
  db.trips.push(trip)
  return json(trip)
}

function cancelTrip(db: Db, me: Row | undefined, args: Row): Response {
  const t = db.trips.find((x) => x.id === args.p_trip)
  const allowed = !!me && !!t && (db.guardianships.some((g) => g.child_id === t.child_id && g.guardian_id === me.id)
    || db.staff_roles.some((r) => r.profile_id === me.id && (r.role === 'admin' || r.role === 'core')))
  if (!t || !allowed) return fail("Only this child's parents or the school can do this.", '42501')
  if (t.status !== 'en_route') return fail('This trip is already finished.')
  const at = new Date(demoNow()).toISOString()
  return json(Object.assign(t, { status: 'cancelled', closed_by: me!.id, closed_at: at, updated_at: at }))
}

function gateStep(db: Db, me: Row | undefined, args: Row): Response {
  if (!me || !db.staff_roles.some((r) => r.profile_id === me.id && (r.role === 'admin' || r.role === 'coordinator'))) return fail('Only coordinators can do this at the gate.', '42501')
  const t = db.trips.find((x) => x.id === args.p_trip)
  if (!t) return fail('This trip no longer exists.')
  if (t.status !== 'en_route') return fail('This trip is already finished.')
  const at = new Date(demoNow()).toISOString()
  const seen = { acknowledged_by: t.acknowledged_by ?? me.id, acknowledged_at: t.acknowledged_at ?? at, updated_at: at }
  const mark = (child_id: unknown, patch: Row) => {
    const row = db.attendance.find((a) => a.child_id === child_id && a.day === t.day)
    if (row) Object.assign(row, { status: 'present', ...patch })
    else db.attendance.push({ child_id, day: t.day, status: 'present', checked_in_at: null, checked_out_at: null, ...patch })
  }
  switch (args.p_step) {
    case 'acknowledge':
      return json(Object.assign(t, seen))
    case 'ready':
      if (t.direction !== 'pickup') return fail('Only a pickup can be marked ready.')
      return json(Object.assign(t, seen, { ready_by: t.ready_by ?? me.id, ready_at: t.ready_at ?? at }))
    case 'close':
      if (t.direction === 'pickup') {
        const ok = db.guardianships.some((g) => g.child_id === t.child_id && g.guardian_id === args.p_handed_to && db.profiles.find((p) => p.id === g.guardian_id)?.active)
        if (!ok) return fail("Choose one of the child's registered guardians.")
        Object.assign(t, seen, { status: 'handed_over', handed_to: args.p_handed_to, closed_by: me.id, closed_at: at })
        mark(t.child_id, { checked_out_at: at })
      } else {
        Object.assign(t, seen, { status: 'checked_in', closed_by: me.id, closed_at: at })
        const row = db.attendance.find((a) => a.child_id === t.child_id && a.day === t.day)
        mark(t.child_id, { checked_in_at: row?.checked_in_at ?? at })
      }
      return json(t)
    default:
      return fail('Unknown step.')
  }
}

function rpc(db: Db, fn: string, args: Row, email: string | null): Response {
  const me = db.profiles.find((p) => p.email === email)
  switch (fn) {
    case 'login_allowed':
      return json(db.profiles.some((p) => p.email === args.p_email && p.active))
    case 'whoami':
      return json(whoami(db, email))
    case 'accept_consent':
      if (me) me.consent_version = args.p_version
      return json(null)
    case 'admin_add_person': {
      const clash = db.profiles.some((p) => (args.p_email && p.email === args.p_email) || (args.p_phone && p.phone === args.p_phone))
      if (clash) return pgError(409, '23505', 'duplicate key value violates unique constraint')
      const id = crypto.randomUUID()
      db.profiles.push({ id, full_name: args.p_full_name, email: args.p_email, phone: args.p_phone, active: true, user_id: null })
      for (const role of (args.p_roles as string[]) ?? []) db.staff_roles.push({ profile_id: id, role })
      return json(id)
    }
    case 'admin_add_child': {
      const id = crypto.randomUUID()
      db.children.push({
        id, full_name: args.p_full_name, preferred_name: args.p_preferred_name || null, date_of_birth: args.p_date_of_birth,
        class_id: args.p_class_id, programme_id: args.p_programme_id, active: true,
      })
      for (const g of args.p_guardians as Row[]) db.guardianships.push({ child_id: id, guardian_id: g.guardian_id, relation: g.relation })
      return json(id)
    }
    case 'set_coordinator': {
      if (!db.profiles.some((p) => p.id === args.p_profile && p.active)) return pgError(400, 'P0001', "That person's access is turned off, or they are no longer registered.")
      if (!db.staff_roles.some((r) => r.profile_id === args.p_profile && r.role === 'coordinator')) db.staff_roles.push({ profile_id: args.p_profile, role: 'coordinator' })
      db.coordinator_classes = [
        ...db.coordinator_classes.filter((a) => a.profile_id !== args.p_profile),
        ...((args.p_classes as string[]) ?? []).map((class_id) => ({ profile_id: args.p_profile, class_id })),
      ]
      return json(null)
    }
    case 'start_trip':
      return startTrip(db, me, args)
    case 'cancel_trip':
      return cancelTrip(db, me, args)
    case 'gate_step':
      return gateStep(db, me, args)
    default:
      return schoolRpc(db as unknown as SchoolDb, fn, args, me, { json, fail, startTrip: startTrip as never })
        ?? adminRpc(db as unknown as AdminDb, fn, args, me, { json, fail, startTrip: startTrip as never })
        ?? trackingRpc(db as unknown as TrackingDb, fn, args, me, { json, fail, startTrip: startTrip as never })
        ?? pgError(404, 'PGRST202', `Demo mode has no function ${fn}`)
  }
}

/** Just the PostgREST features this app uses: eq filters, order, embeds on children, single-row replies. */
function rest(db: Db, method: string, table: string, params: URLSearchParams, headers: Headers, body: unknown, me: Row | undefined): Response {
  const rows = (db as Record<string, Row[] | undefined>)[table]
  if (!rows) return pgError(404, '42P01', `Demo mode has no table ${table}`)
  const filters = [...params].filter(([k, v]) => !['select', 'order', 'limit', 'offset', 'columns'].includes(k) && v.startsWith('eq.'))
  const matches = (row: Row) =>
    filters.every(([k, v]) => {
      if (k === 'guardianships.guardian_id') return db.guardianships.some((g) => g.child_id === row.id && g.guardian_id === v.slice(3))
      return String(row[k]) === v.slice(3)
    })
  if (method !== 'GET') {
    const refused = checkWrite(db as unknown as AdminDb, method, table, rows.filter(matches), body as Row | null, me, { json, fail, startTrip: startTrip as never })
    if (refused) return refused
  }
  const representation = headers.get('prefer')?.includes('return=representation')
  const single = headers.get('accept')?.includes('vnd.pgrst.object')

  if (method === 'POST') {
    const added = (Array.isArray(body) ? body : [body]).map((r) => ({ id: crypto.randomUUID(), active: true, ...(r as Row) }))
    rows.push(...added)
    return representation ? json(single ? added[0] : added, 201) : json(null, 204)
  }
  if (method === 'DELETE') {
    const gone = rows.filter(matches)
    db[table as keyof Db] = rows.filter((r) => !gone.includes(r))
    // Like the database trigger (0005): removing the Coordinator role removes that person's classes.
    if (table === 'staff_roles') for (const r of gone) if (r.role === 'coordinator') db.coordinator_classes = db.coordinator_classes.filter((a) => a.profile_id !== r.profile_id)
    return json(null, 204)
  }
  if (method === 'PATCH') {
    const changed = rows.filter(matches)
    for (const r of changed) Object.assign(r, body)
    return representation ? json(changed) : json(null, 204)
  }

  let result = visibleRows(db as unknown as SchoolDb, table, rows.filter(matches), me).map((r) => ({ ...r }))
  if (table === 'children' && params.get('select')?.includes('(')) {
    result = result.map((c) => ({
      ...c,
      programmes: db.programmes.find((p) => p.id === c.programme_id) ?? null,
      classes: db.classes.find((k) => k.id === c.class_id) ?? null,
      child_schedules: db.child_schedules.filter((s) => s.child_id === c.id),
      guardianships: db.guardianships.filter((g) => g.child_id === c.id),
    }))
  }
  const [order, dir] = params.get('order')?.split('.') ?? []
  if (order) result.sort((a, b) => String(a[order]).localeCompare(String(b[order])) * (dir === 'desc' ? -1 : 1))
  const limit = Number(params.get('limit'))
  if (limit > 0) result = result.slice(0, limit)
  return json(single ? result[0] ?? null : result)
}

const READ_ONLY = new Set(['login_allowed', 'whoami', 'collector_code', 'link_open', 'link_status', 'latest_points', 'announcement_stats', 'recipient_count', 'gate_load', 'my_family', 'invite_details'])

/** Stands in for window.fetch inside the Supabase client while demo mode is on. */
export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = new Headers(init?.headers)
  const body = typeof init?.body === 'string' && init.body ? (JSON.parse(init.body) as Row) : {}
  const email = emailFromToken(headers.get('authorization')?.replace(/^Bearer /i, ''))
  // A short pause so loading states show the way they do on a real connection.
  await new Promise((r) => setTimeout(r, 150 + Math.random() * 250))
  const db = load()
  const before = method === 'GET' && !url.pathname.includes('/rpc/') && !url.pathname.startsWith('/functions/') ? null : (JSON.parse(JSON.stringify(db)) as Record<string, Row[]>)
  let response: Response

  const path = url.pathname
  if (path === '/auth/v1/otp') {
    response = db.profiles.some((p) => p.email === body.email && p.active) ? json({}) : json({ msg: 'not_invited' }, 400)
  } else if (path === '/auth/v1/verify') {
    response = body.token === DEMO_CODE && db.profiles.some((p) => p.email === body.email)
      ? json(sessionFor(db, body.email as string))
      : json({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403)
  } else if (path === '/auth/v1/token') {
    const refreshEmail = String(body.refresh_token ?? '').replace(/^demo\./, '')
    response = db.profiles.some((p) => p.email === refreshEmail) ? json(sessionFor(db, refreshEmail)) : json({ msg: 'Invalid Refresh Token' }, 400)
  } else if (path === '/auth/v1/user') {
    response = email ? json(sessionFor(db, email).user) : json({ msg: 'not signed in' }, 401)
  } else if (path === '/auth/v1/logout') {
    response = json(null, 204)
  } else if (path === '/functions/v1/invite-send') {
    // Like invite-send (0020): the same checks, then recorded as emailed. Demo mode sends no email.
    const details = rpc(db, 'invite_details', { p_profile: body.profile }, email)
    if (details.ok) rpc(db, 'mark_invited', { p_profile: body.profile, p_via: 'email' }, email)
    response = details.ok ? json({ sent: true, demo: true }) : json({ error: String(((await details.json()) as Row).message ?? '').replace(/^[a-z_]+: /, '') }, details.status)
  } else if (path.startsWith('/rest/v1/rpc/')) {
    response = rpc(db, path.slice('/rest/v1/rpc/'.length), body, email)
  } else if (path.startsWith('/rest/v1/')) {
    response = rest(db, method, path.slice('/rest/v1/'.length), url.searchParams, headers, init?.body ? JSON.parse(String(init.body)) : null, db.profiles.find((p) => p.email === email))
  } else {
    response = json({ message: 'Not available in demo mode' }, 404)
  }
  // Like the audit trigger: what changed, by whom (their sign-in id, as auth.uid()).
  if (before && response.ok) {
    const actor = db.profiles.find((p) => p.email === email)?.user_id ?? null
    let n = db.audit_log.length
    db.audit_log.push(...auditChanges(before, db as unknown as Record<string, Row[]>, actor, new Date(demoNow()).toISOString(), () => ++n))
  }
  save(db)
  // Like Realtime: screens in this tab hear about a change (other tabs get the storage event).
  const fn = path.startsWith('/rest/v1/rpc/') ? path.slice('/rest/v1/rpc/'.length) : null
  const wrote = fn ? !READ_ONLY.has(fn) && response.ok : (path.startsWith('/rest/v1/') || path.startsWith('/functions/')) && method !== 'GET' && response.ok
  if (wrote) setTimeout(() => window.dispatchEvent(new Event(DEMO_CHANGE_EVENT)), 0)
  return response
}
