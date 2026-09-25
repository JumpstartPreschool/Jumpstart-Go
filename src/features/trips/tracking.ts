import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { onTableChange } from '../../lib/live'
import { now } from '../../lib/clock'
import { distanceM, positionOf, SCHOOL, type LatestPoint, type Point, type Position } from './geo'

// ---- Calls ------------------------------------------------------------------------------------------------

export interface Invite { trip_id: string; token: string; code: string }
export async function inviteCollector(childId: string, minutes: number, name: string, phone: string, relation: string, reason: string | null): Promise<Invite> {
  const { data, error } = await supabase.rpc('invite_collector', { p_child: childId, p_minutes: minutes, p_name: name, p_phone: phone, p_relation: relation, p_reason: reason })
  if (error) throw error
  return data as Invite
}
export async function collectorCode(tripId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('collector_code', { p_trip: tripId })
  if (error) throw error
  return (data as string | null) ?? null
}
export async function handoverWithCode(tripId: string, code: string): Promise<{ ok: boolean; locked?: boolean; tries_left?: number }> {
  const { data, error } = await supabase.rpc('gate_handover_code', { p_trip: tripId, p_code: code })
  if (error) throw error
  return data as { ok: boolean; locked?: boolean; tries_left?: number }
}

export const linkUrl = (token: string) => `${window.location.origin}/t/${token}`

/** The message a parent sends on WhatsApp: who, when, the link and the code. */
export function whatsappText(p: { collector: string; child: string; at: string; token: string; code: string }): string {
  return `Hi ${p.collector.split(' ')[0]}, please collect ${p.child} from Jumpstart, Karve Road, at about ${p.at}. Open this link on your phone: ${linkUrl(p.token)} Show code ${p.code} at the gate.`
}

// ---- The link page (no sign-in: the token and this phone's key are the proof) ---------------------------

export interface LinkSummary {
  child: string
  direction: 'pickup' | 'dropoff'
  status: 'en_route' | 'handed_over' | 'checked_in' | 'cancelled'
  arrive_at: string
  ready_at: string | null
  closed_at: string | null
  home_at: string | null
  collector: string
  relation: string | null
  sharing: boolean
  confirmed: boolean
  locked: boolean
  school_phone: string | null
  code: string | null
  /** Before confirming: how many tries are left for the last 4 digits of the mobile (0017). */
  confirm_tries_left?: number
}

const DEVICE_KEY = 'jumpstart-link-device'
/** A random key made once on this phone; the server keeps only its hash, and only this phone can use a confirmed link. */
export function deviceKey(): string {
  try {
    let k = localStorage.getItem(DEVICE_KEY)
    if (!k) {
      k = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('')
      localStorage.setItem(DEVICE_KEY, k)
    }
    return k
  } catch {
    return '' // Storage blocked (private mode): the server answers "open the link again on this phone"
  }
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}
export const linkOpen = (token: string) => call<LinkSummary>('link_open', { p_token: token })
/** Confirms on this phone with the last 4 digits of the mobile the parent gave: the link and its code, or tries left. */
export const linkConfirm = (token: string, last4: string) => call<LinkSummary | { ok: false; tries_left: number }>('link_confirm', { p_token: token, p_device: deviceKey(), p_last4: last4 })
export const linkStatus = (token: string) => call<LinkSummary>('link_status', { p_token: token, p_device: deviceKey() })
export const linkShare = (token: string, points: Point[]) => call<number>('link_share', { p_token: token, p_device: deviceKey(), p_points: points })
export const linkHome = (token: string) => call<null>('link_home', { p_token: token, p_device: deviceKey() })
export const linkLate = (token: string, extra: 10 | 20 | 30) => call<LinkSummary>('link_late', { p_token: token, p_device: deviceKey(), p_extra: extra })

// ---- Live points ------------------------------------------------------------------------------------------

/**
 * The newest point of each trip the reader may see (row-level security decides), kept live: Realtime when points
 * arrive, and a 10-second poll so a dropped connection can't freeze a marker that looks live.
 */
export function useLatestPoints(tripIds: string[]) {
  const [points, setPoints] = useState<Map<string, LatestPoint>>(new Map())
  const key = [...tripIds].sort().join(',')
  useEffect(() => {
    if (!key) { setPoints(new Map()); return }
    const ids = key.split(',')
    let alive = true
    const load = async () => {
      const { data, error } = await supabase.rpc('latest_points', { p_trips: ids })
      if (!alive || error) return
      setPoints(new Map(((data ?? []) as LatestPoint[]).map((p) => [p.trip_id, p])))
    }
    void load()
    const stop = onTableChange('trip_points', () => void load())
    const poll = setInterval(() => void load(), 10_000)
    return () => { alive = false; stop(); clearInterval(poll) }
  }, [key])
  return points
}

/** One trip's newest point and its freshness, ticking every second so LIVE turns RECENT and STALE on time. */
export function useTripPosition(tripId: string | null, active: boolean): Position {
  const points = useLatestPoints(tripId && active ? [tripId] : [])
  const [nowMs, setNowMs] = useState(now)
  useEffect(() => {
    if (!active) return
    const tick = setInterval(() => setNowMs(now()), 1000)
    return () => clearInterval(tick)
  }, [active])
  return positionOf(tripId ? points.get(tripId) : null, nowMs)
}

/** The trip's path so far (newest last), for the map. At most the last 300 points. */
export function useTripTrail(tripId: string | null, active: boolean): Array<[number, number]> {
  const [trail, setTrail] = useState<Array<[number, number]>>([])
  useEffect(() => {
    if (!tripId || !active) return
    let alive = true
    const load = async () => {
      const { data } = await supabase.from('trip_points').select('lat, lng, coarse, backfill, fix_at').eq('trip_id', tripId).order('fix_at', { ascending: false }).limit(300)
      if (!alive) return
      setTrail(((data ?? []) as Array<{ lat: number; lng: number; coarse: boolean }>).filter((p) => !p.coarse).reverse().map((p) => [p.lng, p.lat]))
    }
    void load()
    const stop = onTableChange('trip_points', () => void load())
    const poll = setInterval(() => void load(), 15_000)
    return () => { alive = false; stop(); clearInterval(poll) }
  }, [tripId, active])
  return trail
}

// ---- Sending this phone's location ---------------------------------------------------------------------

/** How to turn location back on, for the browser in use. */
export function locationHelp(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return 'On iPhone: Settings, then Privacy & Security, then Location Services, then Safari Websites, then While Using the App. Then come back and tap Try again.'
  }
  if (/Android/.test(ua)) return 'Tap the icon next to the web address, then Permissions, then Location, and allow it. Then tap Try again.'
  return "Click the icon next to the web address, allow Location for this site, then click Try again."
}

/**
 * Sends this phone's position while `on`: at most every 5 s when moving 10 m or more, and at least every 10 s when
 * still (tracking-architecture.md §4.2). Points wait in the page while offline and go in a batch when it's back.
 * The screen is kept awake while sharing, because a locked phone stops sending.
 */
export function useSendLocation(on: boolean, send: (points: Point[]) => Promise<unknown>) {
  // 'ended': the server says the trip is over (handed over, closed at the gate, or the link replaced), so sharing stops.
  const [error, setError] = useState<'denied' | 'unavailable' | 'unsupported' | 'ended' | null>(null)
  const [lastSent, setLastSent] = useState<number | null>(null)
  const [lastFix, setLastFix] = useState<Point | null>(null)
  const queue = useRef<Point[]>([])
  const last = useRef<{ p: Point; at: number } | null>(null)
  const sendRef = useRef(send)
  sendRef.current = send

  useEffect(() => {
    if (!on) return
    if (!('geolocation' in navigator)) { setError('unsupported'); return }
    setError(null)
    let wake: WakeLockSentinel | null = null
    const keepAwake = async () => { try { wake = await navigator.wakeLock?.request('screen') } catch { /* optional */ } }
    void keepAwake()
    const onVisible = () => { if (document.visibilityState === 'visible') void keepAwake() }
    document.addEventListener('visibilitychange', onVisible)

    let sending = false
    let ended = false
    const flush = async () => {
      if (ended || sending || !queue.current.length || !navigator.onLine) return
      sending = true
      const batch = queue.current.slice(0, 50)
      try {
        await sendRef.current(batch)
        queue.current = queue.current.slice(batch.length)
        setLastSent(Date.now())
      } catch (e) {
        // The trip is over: stop the GPS and say so. Anything else (offline, busy) is kept for the next try.
        if (/^(trip_closed|link_expired)/.test((e as { message?: string }).message ?? '')) {
          ended = true
          queue.current = []
          stop()
          setError('ended')
        }
      } finally { sending = false }
    }
    const onFix = (pos: GeolocationPosition) => {
      if (ended) return
      setError(null)
      const p: Point = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.max(1, pos.coords.accuracy), fix_at: new Date(pos.timestamp).toISOString() }
      const prev = last.current
      const t = Date.now()
      const moved = prev ? distanceM(prev.p, p) : Infinity
      if (prev && !((moved >= 10 && t - prev.at >= 5000) || t - prev.at >= 9_000)) return
      last.current = { p, at: t }
      setLastFix(p)
      queue.current.push(p)
      void flush()
    }
    const onError = (e: GeolocationPositionError) => setError(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable')
    const watch = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 })
    // Many phones report only when they move, so someone waiting at the gate would look stale: ask for a genuine new
    // fix every 10 s as well (at most 5 s old; never an old position with a new time).
    const heartbeat = setInterval(() => navigator.geolocation.getCurrentPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15_000 }), 10_000)
    const retry = setInterval(() => void flush(), 5000)
    window.addEventListener('online', flush)
    function stop() {
      navigator.geolocation.clearWatch(watch)
      clearInterval(heartbeat)
      clearInterval(retry)
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVisible)
      void wake?.release().catch(() => {})
    }
    return stop
  }, [on])

  return { error, lastSent, lastFix }
}

/**
 * DEMO MODE ONLY: a made-up traveller heading to the gate from about 1.6 km away, one point every 5 s at city speed,
 * so the location screens can be tried on a laptop. Every screen that uses it says "Simulated" next to the position.
 */
export function useSimulatedTrip(on: boolean, send: (points: Point[]) => Promise<unknown>) {
  const sendRef = useRef(send)
  sendRef.current = send
  useEffect(() => {
    if (!on) return
    const start = { lat: SCHOOL.lat + 0.0105, lng: SCHOOL.lng - 0.0102 }
    let step = 0
    const tick = () => {
      const f = Math.min(1, step / 48) // about 4 minutes to the gate, then waiting there
      const wobble = Math.sin(step / 3) * 0.00012
      void sendRef.current([{ lat: start.lat + (SCHOOL.lat - start.lat) * f + wobble, lng: start.lng + (SCHOOL.lng - start.lng) * f, accuracy: 12, fix_at: new Date(Date.now() - 400).toISOString() }]).catch(() => {})
      step += 1
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [on])
}
