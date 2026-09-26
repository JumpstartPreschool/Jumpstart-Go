/**
 * DEMO MODE — the in-browser stand-in for migrations 0008 and 0009 (location points, one-trip links and codes, the
 * gate's code check), following the same rules so every screen can be tried on localhost. Sample data only.
 */
import { indiaClock } from '../domain/time'
import { demoClockOffset } from './demo'

type Row = Record<string, unknown>
export interface TrackingDb { profiles: Row[]; staff_roles: Row[]; children: Row[]; guardianships: Row[]; programmes: Row[]; trips: Row[]; attendance: Row[]; trip_points: Row[]; trip_links: Row[] }

interface Helpers {
  json: (body: unknown, status?: number) => Response
  fail: (message: string, code?: string) => Response
  startTrip: (db: never, me: Row | undefined, args: Row) => Response
}

const demoNow = () => Date.now() + demoClockOffset()
const iso = (ms: number) => new Date(ms).toISOString()
/** 0024 (D38): a trip's location is for the parent who sent a one-off collector's link, and nobody else. */
export const canSeeLocation = (db: TrackingDb, me: Row | undefined, t: Row) =>
  !!me && t.traveller_kind === 'third_person' && t.created_by === me.id && isGuardian(db, me, t.child_id)
const hasRole = (db: TrackingDb, me: Row | undefined, ...roles: string[]) => !!me && db.staff_roles.some((r) => r.profile_id === me.id && roles.includes(String(r.role)))
const isGuardian = (db: TrackingDb, me: Row | undefined, childId: unknown) => !!me && db.guardianships.some((g) => g.child_id === childId && g.guardian_id === me.id)

function linkFor(db: TrackingDb, token: unknown) {
  const link = db.trip_links.find((l) => l.token === token)
  const trip = link && db.trips.find((t) => t.id === link.trip_id)
  if (!link || !trip) return null
  const today = indiaClock(new Date(demoNow())).date
  const alive = Number(link.confirm_attempts ?? 0) < 3 && trip.day === today && (trip.status === 'en_route'
    || (trip.status === 'handed_over' && !trip.home_at && Date.parse(String(trip.closed_at)) > demoNow() - 60 * 60_000))
  return alive ? { link, trip } : null
}

function summary(db: TrackingDb, trip: Row, link: Row, withCode: boolean) {
  const c = db.children.find((x) => x.id === trip.child_id)!
  return {
    child: c.preferred_name ?? String(c.full_name).split(' ')[0], direction: trip.direction, status: trip.status, arrive_at: trip.arrive_at,
    ready_at: trip.ready_at, closed_at: trip.closed_at, home_at: trip.home_at ?? null, collector: trip.traveller_name, relation: trip.traveller_relation,
    sharing: !!trip.sharing, confirmed: !!link.device, locked: !!link.locked, school_phone: null, code: withCode ? link.code : null,
  }
}

const distanceM = (a: Row, b: Row) => {
  const r = (d: number) => (d * Math.PI) / 180
  const [la1, lo1, la2, lo2] = [Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng)]
  const h = Math.sin(r(la2 - la1) / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(r(lo2 - lo1) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

/** Same checks as app.accept_points: bad points are skipped, not stored. The phone's real clock is moved onto the demo day. */
function accept(db: TrackingDb, trip: Row, points: unknown, h: Helpers): Response | number {
  if (!Array.isArray(points) || points.length < 1 || points.length > 50) return h.fail('bad_batch: Send between 1 and 50 points.')
  const now = demoNow()
  const mine = db.trip_points.filter((p) => p.trip_id === trip.id)
  if (mine.filter((p) => Date.parse(String(p.received_at)) > now - 60_000).length >= 120) return h.fail('rate_limited: Too many location updates. The phone will try again shortly.')
  let last = mine.filter((p) => !p.coarse).sort((a, b) => String(a.fix_at).localeCompare(String(b.fix_at))).at(-1) ?? null
  let n = 0
  for (const raw of [...points].sort((a, b) => String((a as Row).fix_at).localeCompare(String((b as Row).fix_at))) as Row[]) {
    const lat = Number(raw.lat), lng = Number(raw.lng), acc = Number(raw.accuracy), fix = Date.parse(String(raw.fix_at)) + demoClockOffset()
    if (![lat, lng, acc, fix].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || acc <= 0 || acc > 500) continue
    if (fix > now + 30_000 || fix < Date.parse(String(trip.created_at)) - 60_000) continue
    if (last) {
      const lastFix = Date.parse(String(last.fix_at))
      if (fix <= lastFix) continue
      if (fix - lastFix < 120_000 && Math.max(0, distanceM(last, raw) - Number(last.accuracy) - acc) / ((fix - lastFix) / 1000) > 33) continue
    }
    const p = { id: crypto.randomUUID(), trip_id: trip.id, lat, lng, accuracy: acc, fix_at: iso(fix), received_at: iso(now), coarse: acc > 100, backfill: fix < now - 120_000 }
    db.trip_points.push(p)
    n += 1
    if (acc <= 100) last = p
  }
  trip.sharing = true
  return n
}

/** Returns the reply for a tracking function, or null when `fn` isn't one of them. */
export function trackingRpc(db: TrackingDb, fn: string, args: Row, me: Row | undefined, h: Helpers): Response | null {
  const expired = () => h.fail('link_expired: This link has expired or was replaced. Ask the parent to send a new one.')
  const forDevice = () => {
    const l = linkFor(db, args.p_token)
    return l && l.link.device && l.link.device === args.p_device ? l : null
  }
  switch (fn) {
    case 'share_location':
      // 0024 (D38): parents and family never share their own location.
      return h.fail('no_location: Only someone collecting with a one-time link shares their location.')
    case 'stop_sharing': {
      const t = db.trips.find((x) => x.id === args.p_trip && x.created_by === me?.id && (x.traveller_kind ?? 'guardian') === 'guardian')
      if (!t) return h.fail('Only the person on the way can stop sharing.', '42501')
      t.sharing = false
      return h.json(null)
    }
    case 'invite_collector': {
      const name = String(args.p_name ?? '').trim(), phone = String(args.p_phone ?? ''), rel = String(args.p_relation ?? '').trim()
      if (name.length < 2 || name.length > 80) return h.fail('name_required: Enter the full name of the person collecting.')
      if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) return h.fail('phone_required: Enter their mobile number, with the country code for numbers outside India.')
      if (!rel || rel.length > 40) return h.fail('relation_required: Say how they know the child, for example Driver or Grandmother.')
      const started = h.startTrip(db as never, me, { p_child: args.p_child, p_direction: 'pickup', p_minutes: args.p_minutes, p_reason: args.p_reason })
      if (!started.ok) return started
      const today = indiaClock(new Date(demoNow())).date
      const t = db.trips.find((x) => x.child_id === args.p_child && x.direction === 'pickup' && x.day === today && x.status === 'en_route')!
      Object.assign(t, { traveller_kind: 'third_person', traveller_name: name, traveller_relation: rel, traveller_phone: phone, sharing: false })
      const token = `demo_${crypto.randomUUID().replace(/-/g, '')}`
      const code = String(crypto.getRandomValues(new Uint16Array(1))[0]! % 10000).padStart(4, '0')
      db.trip_links = [...db.trip_links.filter((l) => l.trip_id !== t.id), { trip_id: t.id, token, code, device: null, attempts: 0, locked: false, confirm_attempts: 0 }]
      return h.json({ trip_id: t.id, token, code })
    }
    case 'collector_code': {
      const t = db.trips.find((x) => x.id === args.p_trip)
      const l = db.trip_links.find((x) => x.trip_id === args.p_trip)
      return h.json(t && l && (isGuardian(db, me, t.child_id) || hasRole(db, me, 'admin', 'core')) ? l.code : null)
    }
    case 'link_open': {
      const l = linkFor(db, args.p_token)
      if (!l) return expired()
      return h.json(l.link.device ? { confirmed: true } : { ...summary(db, l.trip, l.link, false), confirm_tries_left: 3 - Number(l.link.confirm_attempts ?? 0) })
    }
    case 'link_confirm': {
      if (typeof args.p_device !== 'string' || args.p_device.length < 32) return h.fail('bad_device: Open the link again on this phone.')
      const l = linkFor(db, args.p_token)
      if (!l) return expired()
      if (l.link.device && l.link.device !== args.p_device) return h.fail('in_use: This link is already open on another phone. Only that phone can use it.')
      if (!l.link.device) {
        if (typeof args.p_last4 !== 'string' || !/^[0-9]{4}$/.test(args.p_last4) || !String(l.trip.traveller_phone).endsWith(args.p_last4)) {
          l.link.confirm_attempts = Number(l.link.confirm_attempts ?? 0) + 1
          return h.json({ ok: false, tries_left: 3 - Number(l.link.confirm_attempts) })
        }
        l.link.device = args.p_device
      }
      return h.json(summary(db, l.trip, l.link, true))
    }
    case 'link_status': {
      const l = forDevice()
      return l ? h.json(summary(db, l.trip, l.link, true)) : h.fail('link_expired: This link has expired, was replaced, or is open on another phone.')
    }
    case 'link_share': {
      const l = forDevice()
      if (!l) return h.fail('link_expired: This link has expired, was replaced, or is open on another phone.')
      const n = accept(db, l.trip, args.p_points, h)
      return typeof n === 'number' ? h.json(n) : n
    }
    case 'link_home': {
      const l = forDevice()
      if (!l) return h.fail('link_expired: This link has expired, was replaced, or is open on another phone.')
      if (l.trip.status !== 'handed_over') return h.fail("not_yet: The child hasn't been handed over yet.")
      Object.assign(l.trip, { sharing: false, home_at: l.trip.home_at ?? iso(demoNow()) })
      return h.json(null)
    }
    case 'link_late': {
      if (![10, 20, 30].includes(Number(args.p_extra))) return h.fail('bad_minutes: Choose 10, 20 or 30 minutes.')
      const l = forDevice()
      if (!l) return h.fail('link_expired: This link has expired, was replaced, or is open on another phone.')
      if (l.trip.status !== 'en_route') return h.fail('trip_closed: The child has already been handed over.')
      const base = Math.max(Date.parse(String(l.trip.arrive_at)), Math.floor(demoNow() / 60_000) * 60_000)
      const arrive = new Date(base + Number(args.p_extra) * 60_000)
      const local = indiaClock(arrive)
      if (local.date !== l.trip.day) return h.fail('outside_hours: That would be after midnight. Please call the school.')
      const c = db.children.find((x) => x.id === l.trip.child_id)!
      const p = db.programmes.find((x) => x.id === c.programme_id)!
      const mins = (v: unknown) => { const [a, b] = String(v).split(':').map(Number); return a! * 60 + b! }
      const [from, to] = p.flexible ? [p.starts, p.ends] : [p.pickup_from, p.pickup_to]
      const flagged = local.minutes < mins(from) || local.minutes > mins(to)
      Object.assign(l.trip, { arrive_at: arrive.toISOString(), off_schedule: flagged, reason: flagged ? 'Running late' : null, updated_at: iso(demoNow()), acknowledged_by: null, acknowledged_at: null })
      return h.json(summary(db, l.trip, l.link, true))
    }
    case 'gate_handover_code': {
      if (!hasRole(db, me, 'admin', 'coordinator')) return h.fail('Only coordinators can do this at the gate.', '42501')
      const t = db.trips.find((x) => x.id === args.p_trip)
      if (!t || t.status !== 'en_route' || t.direction !== 'pickup' || t.traveller_kind !== 'third_person') return h.fail("This pickup isn't waiting for a code.")
      const l = db.trip_links.find((x) => x.trip_id === t.id)
      if (!l) return h.fail('There is no code for this pickup. Ask the parent to send the link again.')
      if (l.locked) return h.json({ ok: false, locked: true, tries_left: 0 })
      if (args.p_code !== l.code) {
        l.attempts = Math.min(3, Number(l.attempts) + 1)
        l.locked = Number(l.attempts) >= 3
        return h.json({ ok: false, locked: l.locked, tries_left: 3 - Number(l.attempts) })
      }
      const at = iso(demoNow())
      Object.assign(t, { status: 'handed_over', handed_to_name: t.traveller_name, closed_by: me!.id, closed_at: at, updated_at: at, acknowledged_by: t.acknowledged_by ?? me!.id, acknowledged_at: t.acknowledged_at ?? at })
      const row = db.attendance.find((a) => a.child_id === t.child_id && a.day === t.day)
      if (row) Object.assign(row, { status: 'present', checked_out_at: at })
      else db.attendance.push({ child_id: t.child_id, day: t.day, status: 'present', checked_in_at: null, checked_out_at: at })
      return h.json({ ok: true, trip: t })
    }
    case 'latest_points': {
      // Only the parent who sent the link, for a one-off collector (0024, D38); the school never sees location.
      const ids = new Set((args.p_trips as string[] | undefined ?? []).slice(0, 50))
      const out = new Map<unknown, Row>()
      for (const p of db.trip_points) {
        if (!ids.has(String(p.trip_id)) || p.backfill) continue
        const t = db.trips.find((x) => x.id === p.trip_id)
        if (!t || !canSeeLocation(db, me, t)) continue
        const cur = out.get(p.trip_id)
        if (!cur || String(p.fix_at) > String(cur.fix_at)) out.set(p.trip_id, p)
      }
      return h.json([...out.values()])
    }
    default:
      return null
  }
}

