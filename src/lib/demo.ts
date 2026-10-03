// DEVELOPMENT MOCK, never in a production build. `npm run dev:demo` answers every Supabase request in the browser with
// the made-up school below, so the screens can be checked without touching the live project. Nothing is saved: a
// reload starts over except for who is signed in. Loaded only when import.meta.env.DEV and VITE_DEMO=1 (supabase.ts).
import { passwordFor } from '../../supabase/functions/_shared/passwordPattern'
import { templateProblem, timingProblem, TEMPLATE_KEYS, type TemplateKey } from '../../supabase/functions/_shared/gateAnnounce'

const PATTERN_START = '{First}@{domain}#2026'

interface Person { id: string; user_id: string; full_name: string; email: string | null; phone: string; roles: string[]; email_sign_in: 'none' | 'pattern' | 'own'; password: string | null }

const people: Person[] = [
  { id: 'p-admin', user_id: 'u-admin', full_name: 'Anita Kapoor', email: 'anita.kapoor@jumpstart.test', phone: '+919800000001', roles: ['admin'], email_sign_in: 'own', password: 'AdminDemo#2026' },
  { id: 'p-parent', user_id: 'u-parent', full_name: 'Meera Shah', email: 'meera.shah@gmail.com', phone: '+919800000002', roles: [], email_sign_in: 'pattern', password: null },
  { id: 'p-dad', user_id: 'u-dad', full_name: 'Rohan Shah', email: 'rohan.shah92@outlook.com', phone: '+919800000003', roles: [], email_sign_in: 'none', password: null },
  { id: 'p-gran', user_id: 'u-gran', full_name: 'Sunita Rao', email: null, phone: '+919800000004', roles: [], email_sign_in: 'none', password: null },
  { id: 'p-lead', user_id: 'u-lead', full_name: 'Lata Joshi', email: 'lata.joshi@jumpstart.test', phone: '+919800000005', roles: ['leader'], email_sign_in: 'own', password: 'LeaderDemo#2026' },
  { id: 'p-coord', user_id: 'u-coord', full_name: 'Kiran Patil', email: 'kiran.patil@jumpstart.test', phone: '+919800000006', roles: ['coordinator'], email_sign_in: 'own', password: 'CoordDemo#2026' },
  { id: 'p-vikram', user_id: 'u-vikram', full_name: 'Vikram Mehta', email: null, phone: '+919800000007', roles: [], email_sign_in: 'none', password: null },
  { id: 'p-neha', user_id: 'u-neha', full_name: 'Neha Kapoor', email: null, phone: '+919800000008', roles: [], email_sign_in: 'none', password: null },
]
let pattern = { pattern: PATTERN_START, changed_at: '2026-10-03T06:30:00Z' }
for (const p of people) if (p.email_sign_in === 'pattern' && p.email) p.password = passwordFor(pattern.pattern, p.email)

const programme = { id: 'g-nur', name: 'Nursery · Morning', class_id: 'c-nur', extended: false, flexible: false, starts: '09:00', ends: '12:30', weekdays: [1, 2, 3, 4, 5], saturday_rule: 'except_2nd_and_last', term_start: null, term_end: null, dropoff_from: '08:45', dropoff_to: '09:15', pickup_from: '12:15', pickup_to: '12:45' }
const classes = [{ id: 'c-pg', name: 'Playgroup', active: true, sort: 1 }, { id: 'c-nur', name: 'Nursery', active: true, sort: 2 }, { id: 'c-jr', name: 'Jr KG', active: true, sort: 3 }, { id: 'c-sr', name: 'Sr KG', active: true, sort: 4 }]
const guardianships = [
  { child_id: 'k-aarav', guardian_id: 'p-parent', relation: 'Mother', kind: 'parent' },
  { child_id: 'k-aarav', guardian_id: 'p-dad', relation: 'Father', kind: 'parent' },
  { child_id: 'k-aarav', guardian_id: 'p-gran', relation: 'Grandmother', kind: 'family' },
  { child_id: 'k-kiara', guardian_id: 'p-vikram', relation: 'Father', kind: 'parent' },
  { child_id: 'k-rohan', guardian_id: 'p-neha', relation: 'Mother', kind: 'parent' },
]
const child = (over: Record<string, unknown>) => ({ class_id: 'c-nur', programme_id: 'g-nur', date_of_birth: '2022-04-12', active: true, gender: 'boy', preferred_name: null, programmes: programme, classes: { name: 'Nursery' }, child_schedules: [], ...over })
const children = [
  child({ id: 'k-aarav', full_name: 'Aarav Shah', preferred_name: 'Aaru', guardianships: guardianships.filter((g) => g.child_id === 'k-aarav') }),
  child({ id: 'k-kiara', full_name: 'Kiara Mehta', gender: 'girl', guardianships: guardianships.filter((g) => g.child_id === 'k-kiara') }),
  child({ id: 'k-rohan', full_name: 'Rohan Kapoor', guardianships: guardianships.filter((g) => g.child_id === 'k-rohan') }),
]

// Today's trips, kept in this browser so every demo tab shares them: a parent's tab and a gate tab hear the same trip.
// Seeded relative to when the demo first opens: Aarav's mother 15 minutes away, Kiara's father dropping off in about 6,
// and a one-time driver for Rohan in 25 (a time not recorded ahead).
const TRIPS_KEY = 'jumpstart.demo.trips'
const todayIndia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
type DemoTrip = Record<string, unknown> & { id: string; child_id: string; direction: string; status: string }
function seedTrips(): DemoTrip[] {
  const now = Date.now()
  const at = (m: number) => new Date(now + m * 60_000).toISOString()
  const base = { day: todayIndia(), status: 'en_route', off_schedule: false, reason: null, created_at: at(0), updated_at: at(0), acknowledged_by: null, acknowledged_at: null, ready_at: null, closed_at: null, handed_to: null, arrived_at: null, traveller_kind: 'guardian', traveller_phone: null, sharing: false, handed_to_name: null }
  return [
    { ...base, id: 'trip-aarav', child_id: 'k-aarav', direction: 'pickup', arrive_at: at(15), created_by: 'p-parent', traveller_name: 'Meera Shah', traveller_relation: 'Mother' },
    { ...base, id: 'trip-kiara', child_id: 'k-kiara', direction: 'dropoff', arrive_at: at(6), created_by: 'p-vikram', traveller_name: 'Vikram Mehta', traveller_relation: 'Father' },
    { ...base, id: 'trip-rohan', child_id: 'k-rohan', direction: 'pickup', arrive_at: at(25), created_by: 'p-neha', traveller_name: 'Ramesh', traveller_relation: 'Driver', traveller_kind: 'third_person', traveller_phone: '+919811111111' },
  ]
}
function readTrips(): DemoTrip[] {
  try {
    const saved = JSON.parse(localStorage.getItem(TRIPS_KEY) ?? 'null') as DemoTrip[] | null
    if (saved && saved.every((t) => t.day === todayIndia())) return saved
  } catch { /* fresh start */ }
  const fresh = seedTrips()
  writeTrips(fresh)
  return fresh
}
function writeTrips(t: DemoTrip[]) {
  try { localStorage.setItem(TRIPS_KEY, JSON.stringify(t)) } catch { /* this tab only */ }
  // Every screen showing trips reloads on 'online' (useTodayTrips): stands in for the realtime message.
  setTimeout(() => window.dispatchEvent(new Event('online')), 0)
}
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === TRIPS_KEY) window.dispatchEvent(new Event('online')) })
/** Changes one trip as the database would, and returns it. */
/** The fields running_late sets (0043). */
const lateBy = (to: number, from: number, by: string | null, note: string | null): Partial<DemoTrip> => ({
  arrive_at: new Date(to).toISOString(), late_from: new Date(from).toISOString(), late_at: new Date().toISOString(), late_by: by,
  late_note: note?.trim() || null, acknowledged_at: null, acknowledged_by: null,
})
function changeTrip(id: unknown, patch: (t: DemoTrip) => Partial<DemoTrip>): DemoTrip | null {
  const all = readTrips()
  const t = all.find((x) => x.id === id)
  if (!t) return null
  Object.assign(t, patch(t), { updated_at: new Date().toISOString() })
  writeTrips(all)
  return t
}

const profileRow = (p: Person) => ({ id: p.id, full_name: p.full_name, email: p.email, phone: p.phone, active: true, app_access: true, abroad: false, user_id: p.user_id, invited_at: null, invited_via: null, email_sign_in: p.email_sign_in })

// Gate announcements (0042): null wording means the default, like the real table.
let gate: Record<string, unknown> = { id: true, early_min: 15, ready_min: 10, urgent_min: 5, reminder_min: 2, updated_at: '2026-10-03T06:30:00Z' }

const TABLES: Record<string, () => unknown[]> = {
  gate_announcement_settings: () => [gate],
  trips: () => readTrips(),
  coordinator_classes: () => [{ profile_id: 'p-lead', class_id: 'c-nur' }, { profile_id: 'p-coord', class_id: 'c-nur' }],
  profiles: () => people.map(profileRow),
  staff_roles: () => people.flatMap((p) => p.roles.map((role) => ({ profile_id: p.id, role }))),
  children: () => children,
  guardianships: () => guardianships,
  classes: () => classes,
  programmes: () => [programme],
  settings: () => [{ id: true, get_ready_lead_min: 10, late_threshold_min: 10, school_phone: '+912025451234', app_url: 'http://localhost:5173' }],
  password_pattern: () => [pattern],
}

// The signed-in person rides in the access token's subject, like the real thing.
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
function session(p: Person, method: 'password' | 'otp') {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const user = { id: p.user_id, aud: 'authenticated', role: 'authenticated', email: p.email ?? undefined, phone: p.phone.slice(1), app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  return { access_token: `${b64({ alg: 'none' })}.${b64({ sub: p.user_id, role: 'authenticated', exp, amr: [{ method, timestamp: exp - 3600 }] })}.demo`, refresh_token: `demo-${p.user_id}-${method}`, token_type: 'bearer', expires_in: 3600, expires_at: exp, user }
}
function caller(headers: Headers): Person | null {
  const token = (headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  try {
    const { sub } = JSON.parse(atob((token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string }
    return people.find((p) => p.user_id === sub) ?? null
  } catch { return null }
}

const json = (body: unknown, status = 200) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const authError = (code: string, message: string, status = 400) => json({ code, error_code: code, msg: message, message }, status)

export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  banner()
  const req = new Request(input, init)
  const url = new URL(req.url)
  const path = url.pathname
  const body = req.method === 'GET' || req.method === 'HEAD' ? null : await req.clone().json().catch(() => null) as Record<string, unknown> | null
  const me = caller(req.headers)
  await new Promise((r) => setTimeout(r, 250)) // A little latency, so loading states show.

  // Sign-in
  if (path.endsWith('/auth/v1/token')) {
    const grant = url.searchParams.get('grant_type')
    if (grant === 'password') {
      const p = people.find((x) => x.email && x.email === String(body?.email ?? '').toLowerCase())
      if (!p || !p.password || p.password !== body?.password) return authError('invalid_credentials', 'Invalid login credentials')
      return json(session(p, 'password'))
    }
    if (grant === 'refresh_token') {
      const [, uid, method] = /^demo-(u-[a-z]+)-(password|otp)$/.exec(String(body?.refresh_token ?? '')) ?? []
      const p = people.find((x) => x.user_id === uid)
      return p ? json(session(p, method === 'password' ? 'password' : 'otp')) : authError('refresh_token_not_found', 'Invalid Refresh Token', 400)
    }
  }
  if (path.endsWith('/auth/v1/otp')) return json({})
  if (path.endsWith('/auth/v1/verify')) {
    const p = people.find((x) => x.phone === `+${String(body?.phone ?? '').replace(/^\+/, '')}`)
    if (!p || body?.token !== '123456') return authError('otp_expired', 'Token has expired or is invalid', 403)
    return json(session(p, 'otp'))
  }
  if (path.endsWith('/auth/v1/user')) {
    if (!me) return authError('session_not_found', 'not signed in', 401)
    if (req.method === 'PUT' && typeof body?.password === 'string') {
      if (body.password === me.password) return authError('same_password', 'New password should be different from the old password.', 422)
      me.password = body.password
      me.email_sign_in = 'own'
    }
    return json(session(me, 'password').user)
  }
  if (path.endsWith('/auth/v1/logout')) return new Response(null, { status: 204 })

  // The password-pattern function
  if (path.endsWith('/functions/v1/password-pattern')) {
    if (!me?.roles.includes('admin')) return json({ error: 'Only the admin can change the password pattern.' }, 403)
    if (body?.action === 'save') {
      pattern = { pattern: String(body.pattern), changed_at: new Date().toISOString() }
      // Staff never get a pattern password (0041).
      const set = people.filter((p) => p.email && !p.roles.length)
      for (const p of set) { p.password = passwordFor(pattern.pattern, p.email!); p.email_sign_in = 'pattern' }
      return json({ updated: set.length, failed: [] })
    }
    const p = people.find((x) => x.id === body?.profile_id)
    if (!p?.email || p.roles.length) return json({ error: 'Only parents and family with an email and app access get a pattern password. Staff sign in with their mobile number.' }, 400)
    p.password = passwordFor(pattern.pattern, p.email)
    p.email_sign_in = 'pattern'
    return json({ updated: 1, failed: [], password: p.password })
  }
  if (path.includes('/functions/v1/')) return json({ error: 'Not part of the demo.' }, 404)

  // Database functions
  const rpc = /\/rest\/v1\/rpc\/([a-z_]+)$/.exec(path)?.[1]
  if (rpc) {
    if (rpc === 'whoami') {
      if (!me) return json(null)
      const kids = guardianships.filter((g) => g.guardian_id === me.id).length
      return json({ profile_id: me.id, full_name: me.full_name, phone: me.phone, email: me.email, email_sign_in: me.email_sign_in, active: true, consent_version: '2026-10-02', roles: me.roles, children: kids })
    }
    if (rpc === 'phone_login_allowed') return json(true)
    // Trips, as the database functions do them (0006, 0026, 0035, 0038).
    if (rpc === 'gate_step') {
      const now = new Date().toISOString()
      const step = body?.p_step
      return json(changeTrip(body?.p_trip, () => step === 'acknowledge' ? { acknowledged_at: now, acknowledged_by: me?.id }
        : step === 'ready' ? { ready_at: now, acknowledged_at: now, acknowledged_by: me?.id }
        : { status: 'handed_over', closed_at: now, handed_to: body?.p_handed_to ?? null }))
    }
    // Running late (0043): +5/+10/+15 or a later time, an optional note; the same checks as the database, in short.
    if (rpc === 'running_late') {
      const t = readTrips().find((x) => x.id === body?.p_trip)
      if (!t || t.status !== 'en_route') return json({ code: 'P0001', message: 'trip_closed: This trip has already finished.' }, 400)
      if (t.arrived_at) return json({ code: 'P0001', message: "already_here: You've already told the school you've arrived." }, 400)
      const from = Date.parse(String(t.arrive_at))
      const to = body?.p_minutes ? Math.max(from, Date.now()) + Number(body.p_minutes) * 60_000 : Date.parse(String(body?.p_at))
      if (!(to > from && to > Date.now())) return json({ code: 'P0001', message: 'not_later: Choose a later time.' }, 400)
      return json(changeTrip(t.id, () => lateBy(to, from, me?.id ?? null, (body?.p_note as string | null) ?? null)))
    }
    if (rpc === 'arrive_trip') return json(changeTrip(body?.p_trip, () => ({ arrived_at: new Date().toISOString() })))
    if (rpc === 'cancel_trip') return json(changeTrip(body?.p_trip, () => ({ status: 'cancelled', closed_at: new Date().toISOString() })))
    if (rpc === 'start_trip') {
      const arrive = new Date(Date.now() + Number(body?.p_minutes ?? 10) * 60_000).toISOString()
      const open = readTrips().find((t) => t.child_id === body?.p_child && t.direction === body?.p_direction && t.status === 'en_route')
      // A new time for a trip already on its way (running late, change time) replaces it, unacknowledged again.
      if (open) return json(changeTrip(open.id, () => ({ arrive_at: arrive, acknowledged_at: null, acknowledged_by: null, arrived_at: null, reason: body?.p_reason ?? null })))
      const all = readTrips()
      const t = { ...seedTrips()[0]!, id: `trip-${Date.now()}`, child_id: String(body?.p_child), direction: String(body?.p_direction), arrive_at: arrive, created_by: me?.id ?? 'p-parent', traveller_name: me?.full_name ?? 'Parent', traveller_relation: guardianships.find((g) => g.child_id === body?.p_child && g.guardian_id === me?.id)?.relation ?? null, reason: body?.p_reason ?? null }
      all.push(t)
      writeTrips(all)
      return json(t)
    }
    if (rpc === 'admin_save_gate_announcements') {
      if (!me?.roles.includes('admin')) return json({ code: '42501', message: 'Only the admin can change gate announcements.' }, 403)
      const p = (body?.p ?? {}) as Record<string, unknown>
      for (const k of TEMPLATE_KEYS) if (typeof p[k] === 'string' && templateProblem(k as TemplateKey, p[k] as string)) return json({ code: 'P0001', message: `bad_template: ${templateProblem(k as TemplateKey, p[k] as string)}` }, 400)
      const t = { early_min: Number(p.early_min ?? 15), ready_min: Number(p.ready_min ?? 10), urgent_min: Number(p.urgent_min ?? 5), reminder_min: Number(p.reminder_min ?? 2) }
      if (timingProblem(t)) return json({ code: 'P0001', message: `bad_timing: ${timingProblem(t)}` }, 400)
      gate = { ...p, ...t, id: true, updated_at: new Date().toISOString() }
      return json(gate)
    }
    return json(null)
  }

  // Tables: reads answer from the made-up school; writes succeed without changing anything.
  const table = /\/rest\/v1\/([a-z_]+)$/.exec(path)?.[1]
  if (table) {
    if (req.method !== 'GET') return json(null)
    const rows = TABLES[table]?.() ?? []
    const one = (req.headers.get('Accept') ?? '').includes('vnd.pgrst.object')
    return one ? (rows[0] ? json(rows[0]) : json({ code: 'PGRST116', message: 'no rows' }, 406)) : json(rows)
  }
  return json({})
}

let shown = false
function banner() {
  if (shown || typeof document === 'undefined') return
  shown = true
  const el = document.createElement('div')
  el.textContent = 'Demo · made-up data'
  el.setAttribute('role', 'status')
  el.style.cssText = 'position:fixed;right:8px;top:calc(env(safe-area-inset-top) + 4px);z-index:60;white-space:nowrap;padding:4px 10px;border-radius:999px;background:#16193a;color:#e9c27a;font:700 11px/1.4 system-ui,sans-serif;letter-spacing:.04em;box-shadow:0 8px 20px -10px rgb(0 0 0/.6);pointer-events:none'
  document.body.append(el)
  document.body.append(controls())
}

/** The parent's side, for trying the gate: taps that change the shared trips, heard on any demo tab on duty. */
function controls(): HTMLElement {
  const box = document.createElement('details')
  box.style.cssText = 'position:fixed;left:8px;bottom:max(8px,env(safe-area-inset-bottom));z-index:60;max-width:min(320px,calc(100vw - 16px));border-radius:16px;background:#16193a;color:#f6f3ff;font:600 13px/1.35 system-ui,sans-serif;box-shadow:0 14px 30px -14px rgb(0 0 0/.7);'
  const summary = document.createElement('summary')
  summary.textContent = 'Demo: act as a parent'
  summary.style.cssText = 'cursor:pointer;padding:10px 14px;color:#e9c27a;font-weight:800;list-style:none'
  box.append(summary)
  const list = document.createElement('div')
  list.style.cssText = 'display:grid;gap:6px;padding:0 10px 10px'
  const later = (m: number) => (t: DemoTrip) => { const from = Date.parse(String(t.arrive_at)); return lateBy(Math.max(from, Date.now()) + m * 60_000, from, 'p-parent', 'Traffic near school') }
  const actions: Array<[string, () => void]> = [
    ["Aarav's mother taps I've arrived", () => void changeTrip('trip-aarav', () => ({ arrived_at: new Date().toISOString() }))],
    ["Aarav's mother is running late (+10 min)", () => void changeTrip('trip-aarav', later(10))],
    ["Kiara's father taps I've arrived", () => void changeTrip('trip-kiara', () => ({ arrived_at: new Date().toISOString() }))],
    ["Cancel Rohan's pickup", () => void changeTrip('trip-rohan', () => ({ status: 'cancelled', closed_at: new Date().toISOString() }))],
    ['Start all three trips again', () => writeTrips(seedTrips())],
  ]
  for (const [label, run] of actions) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.style.cssText = 'min-height:40px;padding:8px 12px;border-radius:10px;text-align:left;background:rgb(255 255 255/.08);color:inherit;box-shadow:inset 0 0 0 1px rgb(233 194 122/.3);cursor:pointer'
    b.addEventListener('click', run)
    list.append(b)
  }
  box.append(list)
  return box
}
