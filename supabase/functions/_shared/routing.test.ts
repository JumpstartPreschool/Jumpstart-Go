import { describe, expect, it, vi } from 'vitest'
import { openRouteService, RoutingError, type RoutingFailure } from './routing.ts'
import { SCHOOL, type LngLat } from './eta.ts'

const from: LngLat = [73.8105, 18.501]

function reply(status: number, body: unknown = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

const orsBody = {
  features: [{ geometry: { coordinates: [from, [73.82, 18.505], SCHOOL] }, properties: { summary: { distance: 3060.2, duration: 309.5 } } }],
}

describe('openRouteService', () => {
  it('returns the route line, distance and time', async () => {
    const fetchImpl = reply(200, orsBody)
    const route = await openRouteService('key', fetchImpl).route(from, SCHOOL)
    expect(route).toEqual({ line: [from, [73.82, 18.505], SCHOOL], distanceM: 3060.2, durationS: 309.5 })
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(url).toContain('/v2/directions/driving-car/geojson')
    expect(init.headers.Authorization).toBe('key')
    expect(JSON.parse(init.body)).toEqual({ coordinates: [from, SCHOOL], instructions: false })
  })

  it.each<[number, RoutingFailure]>([
    [429, 'rate_limited'],
    [403, 'unauthorized'],
    [404, 'no_route'],
    [500, 'unavailable'],
  ])('turns HTTP %i into %s', async (status, reason) => {
    const err = await openRouteService('key', reply(status)).route(from, SCHOOL).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RoutingError)
    expect((err as RoutingError).reason).toBe(reason)
  })

  it('reports an unreachable service as unavailable', async () => {
    const down = vi.fn(async () => { throw new TypeError('network down') }) as unknown as typeof fetch
    await expect(openRouteService('key', down).route(from, SCHOOL)).rejects.toMatchObject({ reason: 'unavailable' })
  })

  it('rejects coordinates in the wrong order or out of range', async () => {
    await expect(openRouteService('key', reply(200, orsBody)).route([18.5, 173.8], SCHOOL)).rejects.toThrow(RangeError)
  })

  it('treats an empty answer as no route', async () => {
    await expect(openRouteService('key', reply(200, { features: [] })).route(from, SCHOOL)).rejects.toMatchObject({ reason: 'no_route' })
  })

  it('refuses to start without a key', () => {
    expect(() => openRouteService('')).toThrow('ORS_API_KEY')
  })
})
