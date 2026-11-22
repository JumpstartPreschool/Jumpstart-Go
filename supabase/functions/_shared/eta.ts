/**
 * ETA from a road route and a live position (tracking-architecture §8, PRD D12).
 * Server side: the ETA is worked out once, here, so every screen shows the same numbers.
 * Pure and dependency-free, so it runs in Edge Functions (Deno), Node and the tests.
 */

/** [longitude, latitude], the GeoJSON order. */
export type LngLat = [number, number]

/** Jumpstart Karve Road, 11/7 Matoshri, Erandwane. */
export const SCHOOL: LngLat = [73.8328, 18.50885]

/** A position further than this from the route means the person took another road: fetch a new route. */
export const OFF_ROUTE_M = 100

// ponytail: fixed range multipliers (no live traffic data). Recalibrate from predicted vs actual arrivals after the pilot.
export const ETA_LOW_FACTOR = 1.0
export const ETA_HIGH_FACTOR = 1.5
/** Below this, show "Arriving now" rather than a range. */
export const ARRIVING_NOW_S = 120

const EARTH_RADIUS_M = 6_371_008.8
const RAD = Math.PI / 180

export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD
  const dLng = (b[0] - a[0]) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function lineLengthM(line: readonly LngLat[]): number {
  let total = 0
  for (let i = 1; i < line.length; i++) total += distanceM(line[i - 1]!, line[i]!)
  return total
}

/**
 * Where a point sits along a route: metres from the start to the closest point on the route,
 * and how far the point is from the route. Uses a flat projection around the point, which is
 * accurate to well under a metre across a city.
 */
export function locateOnRoute(line: readonly LngLat[], p: LngLat): { alongM: number; offRouteM: number; totalM: number } {
  if (line.length < 2) throw new RangeError('A route needs at least two points')
  const kx = Math.cos(p[1] * RAD) * EARTH_RADIUS_M * RAD
  const ky = EARTH_RADIUS_M * RAD
  const toXY = (q: LngLat) => [(q[0] - p[0]) * kx, (q[1] - p[1]) * ky] as const

  let best = { offRouteM: Infinity, alongM: 0 }
  let travelled = 0
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = toXY(line[i - 1]!)
    const [bx, by] = toXY(line[i]!)
    const dx = bx - ax
    const dy = by - ay
    const segLen = Math.hypot(dx, dy)
    // The point is the origin; project it onto the segment and clamp to the segment's ends.
    const t = segLen === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (segLen * segLen)))
    const off = Math.hypot(ax + t * dx, ay + t * dy)
    if (off < best.offRouteM) best = { offRouteM: off, alongM: travelled + t * segLen }
    travelled += segLen
  }
  return { ...best, totalM: travelled }
}

export interface RouteForEta {
  line: readonly LngLat[]
  durationS: number
}

/** Seconds still to go: the route's own time for the part not yet travelled. */
export function remainingSeconds(route: RouteForEta, position: LngLat): { seconds: number; offRoute: boolean } {
  const { alongM, offRouteM, totalM } = locateOnRoute(route.line, position)
  const fractionLeft = totalM === 0 ? 0 : Math.max(0, 1 - alongM / totalM)
  return { seconds: route.durationS * fractionLeft, offRoute: offRouteM > OFF_ROUTE_M }
}

export type EtaRange = { kind: 'arriving' } | { kind: 'range'; lowMin: number; highMin: number }

/** A range at least 2 minutes wide, in whole minutes, so it never pretends to be precise. */
export function etaRange(seconds: number): EtaRange {
  if (seconds < ARRIVING_NOW_S) return { kind: 'arriving' }
  const lowMin = Math.max(2, Math.round((seconds * ETA_LOW_FACTOR) / 60))
  const highMin = Math.max(lowMin + 2, Math.round((seconds * ETA_HIGH_FACTOR) / 60))
  return { kind: 'range', lowMin, highMin }
}

/** "about 3–5 min" or "Arriving now". */
export function formatEta(range: EtaRange): string {
  return range.kind === 'arriving' ? 'Arriving now' : `about ${range.lowMin}–${range.highMin} min`
}
