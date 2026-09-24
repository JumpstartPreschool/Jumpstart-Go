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
import PROGRAMMES from './programmes.json'

export const DEMO_AVAILABLE = import.meta.env.DEV || import.meta.env.VITE_DESIGN_PREVIEW === 'true'
export const DEMO_EMAIL = 'ai@jumpstartpreschool.in'
/** The dummy one-time code. Any other code is refused, so the error state can be tried too. */
export const DEMO_CODE = '246810'

const FLAG = 'jumpstart-demo'
const LANDING = 'jumpstart-demo-area'
export const DEMO_DB_KEY = 'jumpstart-demo-db'
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

export function enterDemo(area: Area) {
  store()?.setItem(FLAG, '1')
  store()?.setItem(LANDING, area)
}

export function leaveDemo() {
  if (!DEMO_AVAILABLE) return
  for (const s of [store(), shared()]) {
    if (!s) continue
    for (const key of Object.keys(s)) if (key.startsWith('jumpstart-demo') || (s === store() && key.startsWith('sb-'))) s.removeItem(key)
  }
}

/** The area picked on the demo login, so the person lands there once instead of their first area. */
export function demoLanding(): Area | null {
  return isDemo() ? (store()?.getItem(LANDING) as Area | null) : null
}

export function clearDemoLanding() {
  if (DEMO_AVAILABLE) store()?.removeItem(LANDING)
}

// ---- Sample data ------------------------------------------------------------------------------------

type Row = Record<string, unknown>
type Db = Record<'profiles' | 'staff_roles' | 'classes' | 'programmes' | 'children' | 'guardianships' | 'child_schedules' | 'coordinator_classes', Row[]>

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
  ]
  const classes = [
    { id: 'demo-bluebells', name: 'Bluebells', active: true },
    { id: 'demo-sunflowers', name: 'Sunflowers', active: true },
    { id: 'demo-tulips', name: 'Tulips', active: true },
  ]
  const child = (id: string, full_name: string, preferred_name: string | null, date_of_birth: string, class_id: string, programme: string) =>
    ({ id, full_name, preferred_name, date_of_birth, class_id, programme_id: programmeId(programme), active: true })
  return {
    profiles,
    staff_roles: [
      ...['admin', 'core', 'coordinator'].map((role) => ({ profile_id: OWNER, role })),
      { profile_id: 'demo-meera', role: 'core' },
      { profile_id: 'demo-sunita', role: 'coordinator' },
      { profile_id: 'demo-farah', role: 'coordinator' },
    ],
    classes,
    programmes: PROGRAMMES.map((p) => ({ ...p, active: true })),
    children: [
      child('demo-anaya', 'Anaya Singh', null, '2022-03-14', 'demo-sunflowers', 'Jr KG · Half day'),
      child('demo-kabir', 'Kabir Shah', null, '2023-01-20', 'demo-bluebells', 'Nursery · 360°'),
      child('demo-isha', 'Isha Patil', 'Ishu', '2020-11-02', 'demo-tulips', 'Sr KG · Half day'),
      child('demo-riya', 'Riya Joshi', null, '2020-08-09', 'demo-bluebells', 'Learning Center'),
    ],
    guardianships: [
      { child_id: 'demo-anaya', guardian_id: OWNER, relation: 'Parent' },
      { child_id: 'demo-kabir', guardian_id: 'demo-neha', relation: 'Mother' },
      { child_id: 'demo-isha', guardian_id: 'demo-rohan', relation: 'Father' },
      { child_id: 'demo-riya', guardian_id: 'demo-anjali', relation: 'Mother' },
    ],
    // Sunita covers Bluebells and Sunflowers, the owner covers Sunflowers, and Tulips has nobody yet.
    coordinator_classes: [
      { profile_id: 'demo-sunita', class_id: 'demo-bluebells' },
      { profile_id: 'demo-sunita', class_id: 'demo-sunflowers' },
      { profile_id: OWNER, class_id: 'demo-sunflowers' },
    ],
    // Kabir has regular times set by the core team; the others still show their programme's windows.
    child_schedules: [1, 2, 3, 4, 5, 6].map((weekday) => ({ child_id: 'demo-kabir', weekday, dropoff: '09:15:00', pickup: '16:15:00' })),
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
    default:
      return pgError(404, 'PGRST202', `Demo mode has no function ${fn}`)
  }
}

/** Just the PostgREST features this app uses: eq filters, order, embeds on children, single-row replies. */
function rest(db: Db, method: string, table: string, params: URLSearchParams, headers: Headers, body: unknown): Response {
  const rows = (db as Record<string, Row[] | undefined>)[table]
  if (!rows) return pgError(404, '42P01', `Demo mode has no table ${table}`)
  const filters = [...params].filter(([k, v]) => !['select', 'order', 'limit', 'offset', 'columns'].includes(k) && v.startsWith('eq.'))
  const matches = (row: Row) =>
    filters.every(([k, v]) => {
      if (k === 'guardianships.guardian_id') return db.guardianships.some((g) => g.child_id === row.id && g.guardian_id === v.slice(3))
      return String(row[k]) === v.slice(3)
    })
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

  let result = rows.filter(matches).map((r) => ({ ...r }))
  if (table === 'children' && params.get('select')?.includes('(')) {
    result = result.map((c) => ({
      ...c,
      programmes: db.programmes.find((p) => p.id === c.programme_id) ?? null,
      classes: db.classes.find((k) => k.id === c.class_id) ?? null,
      child_schedules: db.child_schedules.filter((s) => s.child_id === c.id),
      guardianships: db.guardianships.filter((g) => g.child_id === c.id),
    }))
  }
  const order = params.get('order')?.split('.')[0]
  if (order) result.sort((a, b) => String(a[order]).localeCompare(String(b[order])))
  return json(single ? result[0] ?? null : result)
}

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
  } else if (path.startsWith('/rest/v1/rpc/')) {
    response = rpc(db, path.slice('/rest/v1/rpc/'.length), body, email)
  } else if (path.startsWith('/rest/v1/')) {
    response = rest(db, method, path.slice('/rest/v1/'.length), url.searchParams, headers, init?.body ? JSON.parse(String(init.body)) : null)
  } else {
    response = json({ message: 'Not available in demo mode' }, 404)
  }
  save(db)
  return response
}
