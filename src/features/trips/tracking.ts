import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { onTableChange } from '../../lib/live'
import { now } from '../../lib/clock'
import { freshness, type Freshness } from '../../domain/freshness'

/** The school gate, 11/7 Matoshri, Karve Road (tracking-architecture.md §7). */
export const SCHOOL: { lat: number; lng: number } = { lat: 18.50885, lng: 73.8328 }

export interface Point { lat: number; lng: number; accuracy: number; fix_at: string }
export interface StoredPoint extends Point { received_at: string; coarse: boolean; backfill: boolean }

/** Straight-line distance in metres (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

/** "350 m" or "2.4 km", as the crow flies (no route or traffic, so never shown as a time). */
export function formatDistance(m: number): string {
  return m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`
}

// ---- Calls ------------------------------------------------------------------------------------------------

export async function shareLocation(tripId: string, points: Point[]): Promise<number> {
  const { data, error } = await supabase.rpc('share_location', { p_trip: tripId, p_points: points })
  if (error) throw error
  return data as number
}
export async function stopSharing(tripId: string): Promise<void> {
  const { error } = await supabase.rpc('stop_sharing', { p_trip: tripId })
  if (error) throw error
}

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

// ---- Live points ------------------------------------------------------------------------------------------

/** A trip's newest point and how fresh it is, kept live (guardians see the whole trip; staff until handover). */
export function useTripPosition(tripId: string | null, active: boolean) {
  const [last, setLast] = useState<StoredPoint | null>(null)
  const [nowMs, setNowMs] = useState(now)
  const load = useCallback(async () => {
    if (!tripId) return
    const { data } = await supabase.from('trip_points').select('lat, lng, accuracy, fix_at, received_at, coarse, backfill')
      .eq('trip_id', tripId).order('fix_at', { ascending: false }).limit(1)
    setLast(((data ?? []) as StoredPoint[]).find((p) => !p.backfill) ?? null)
  }, [tripId])
  useEffect(() => {
    if (!tripId || !active) return
    void load()
    const stop = onTableChange('trip_points', () => void load())
    const poll = setInterval(() => void load(), 10_000)
    const tick = setInterval(() => setNowMs(now()), 1000)
    return () => { stop(); clearInterval(poll); clearInterval(tick) }
  }, [tripId, active, load])
  const f = freshness(last ? { fixAt: Date.parse(last.fix_at), receivedAt: Date.parse(last.received_at) } : null, nowMs)
  const away = last && !last.coarse ? distanceM(last, SCHOOL) : null
  return { last, state: f.state as Freshness, ageMs: f.ageMs, away }
}

// ---- Sending this phone's location ---------------------------------------------------------------------

export type LocationPermission = 'granted' | 'prompt' | 'denied' | 'unsupported'

export async function locationPermission(): Promise<LocationPermission> {
  if (!('geolocation' in navigator)) return 'unsupported'
  try {
    const s = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return s.state as LocationPermission
  } catch {
    return 'prompt' // Older Safari can't say before asking
  }
}

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
  const [error, setError] = useState<'denied' | 'unavailable' | 'unsupported' | null>(null)
  const [lastSent, setLastSent] = useState<number | null>(null)
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
    const flush = async () => {
      if (sending || !queue.current.length || !navigator.onLine) return
      sending = true
      const batch = queue.current.slice(0, 50)
      try {
        await sendRef.current(batch)
        queue.current = queue.current.slice(batch.length)
        setLastSent(Date.now())
      } catch { /* kept for the next try */ } finally { sending = false }
    }
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null)
        const p: Point = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.max(1, pos.coords.accuracy), fix_at: new Date(pos.timestamp).toISOString() }
        const prev = last.current
        const t = Date.now()
        const moved = prev ? distanceM(prev.p, p) : Infinity
        if (prev && !((moved >= 10 && t - prev.at >= 5000) || t - prev.at >= 10_000)) return
        last.current = { p, at: t }
        queue.current.push(p)
        void flush()
      },
      (e) => setError(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    )
    const retry = setInterval(() => void flush(), 5000)
    window.addEventListener('online', flush)
    return () => {
      navigator.geolocation.clearWatch(watch)
      clearInterval(retry)
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVisible)
      void wake?.release().catch(() => {})
    }
  }, [on])

  return { error, lastSent }
}
