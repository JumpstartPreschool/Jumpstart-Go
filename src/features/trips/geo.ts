import { freshness, type Freshness } from '../../domain/freshness'

/** The school gate, 11/7 Matoshri, Karve Road (tracking-architecture.md §7). */
export const SCHOOL: { lat: number; lng: number } = { lat: 18.50885, lng: 73.8328 }

export interface Point { lat: number; lng: number; accuracy: number; fix_at: string }

export interface LatestPoint { trip_id: string; lat: number; lng: number; accuracy: number; fix_at: string; received_at: string; coarse: boolean }

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

// ---- Phone numbers ---------------------------------------------------------------------------------------

/** "98765 43210", "098765 43210", "+91 98765-43210" or "+971 50 123 4567" → "+919876543210"; null when it isn't a mobile number. */
export function toE164(input: string): string | null {
  const plus = input.trim().startsWith('+')
  let d = input.replace(/\D/g, '')
  if (!plus) {
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
    if (!/^[6-9][0-9]{9}$/.test(d)) return null
    d = `91${d}`
  }
  return /^[1-9][0-9]{7,14}$/.test(d) ? `+${d}` : null
}

/** "+91 98765 43210" for reading back to the parent. */
export const formatPhone = (e164: string) => (e164.startsWith('+91') && e164.length === 13 ? `+91 ${e164.slice(3, 8)} ${e164.slice(8)}` : e164)

/** Opens WhatsApp (app or web) with the message ready to send to that number. */
export const whatsappUrl = (e164: string, text: string) => `https://wa.me/${e164.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`

export interface Position { state: Freshness; ageMs: number | null; away: number | null; point: LatestPoint | null }

/** How fresh a point is at `nowMs`, and how far from the gate (never for a coarse fix). */
export function positionOf(point: LatestPoint | null | undefined, nowMs: number): Position {
  const f = freshness(point ? { fixAt: Date.parse(point.fix_at), receivedAt: Date.parse(point.received_at) } : null, nowMs)
  return { state: f.state, ageMs: f.ageMs, away: point && !point.coarse ? distanceM(point, SCHOOL) : null, point: point ?? null }
}
