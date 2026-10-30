/**
 * Road routes through a replaceable provider (tracking-architecture §11, services.md).
 * OpenRouteService is the first provider; swapping to OSRM means writing another `RoutingProvider`.
 */
import type { LngLat } from './eta.ts'

export interface Route {
  line: LngLat[]
  distanceM: number
  durationS: number
}

export interface RoutingProvider {
  route(from: LngLat, to: LngLat): Promise<Route>
}

export type RoutingFailure = 'rate_limited' | 'no_route' | 'unauthorized' | 'unavailable'

export class RoutingError extends Error {
  readonly reason: RoutingFailure
  constructor(reason: RoutingFailure, message: string) {
    super(message)
    this.name = 'RoutingError'
    this.reason = reason
  }
}

export function isLngLat(v: unknown): v is LngLat {
  return (
    Array.isArray(v) && v.length === 2 &&
    typeof v[0] === 'number' && typeof v[1] === 'number' &&
    Number.isFinite(v[0]) && Number.isFinite(v[1]) &&
    v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90
  )
}

const ORS_DIRECTIONS = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson'

export function openRouteService(apiKey: string, fetchImpl: typeof fetch = fetch, timeoutMs = 8000): RoutingProvider {
  if (!apiKey) throw new Error('ORS_API_KEY is not set')
  return {
    async route(from, to) {
      if (!isLngLat(from) || !isLngLat(to)) throw new RangeError('Coordinates must be [longitude, latitude]')
      let res: Response
      try {
        res = await fetchImpl(ORS_DIRECTIONS, {
          method: 'POST',
          headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
          body: JSON.stringify({ coordinates: [from, to], instructions: false }),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch {
        throw new RoutingError('unavailable', 'The routing service did not respond')
      }
      if (res.status === 429) throw new RoutingError('rate_limited', 'Routing quota used up for now')
      if (res.status === 401 || res.status === 403) throw new RoutingError('unauthorized', 'The routing key was refused')
      // ORS answers 404 when a point is too far from any road, 400 for other unroutable requests.
      if (res.status === 400 || res.status === 404) throw new RoutingError('no_route', 'No road route between these points')
      if (!res.ok) throw new RoutingError('unavailable', `Routing service error ${res.status}`)

      const body = (await res.json()) as { features?: Array<{ geometry?: { coordinates?: unknown[] }; properties?: { summary?: { distance?: number; duration?: number } } }> }
      const feature = body.features?.[0]
      const line = (feature?.geometry?.coordinates ?? []).filter(isLngLat)
      if (line.length < 2) throw new RoutingError('no_route', 'The routing service returned no route')
      const summary = feature?.properties?.summary ?? {}
      return { line, distanceM: summary.distance ?? 0, durationS: summary.duration ?? 0 }
    },
  }
}
