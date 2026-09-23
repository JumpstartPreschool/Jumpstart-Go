import { describe, expect, it } from 'vitest'
import { distanceM, etaRange, formatEta, lineLengthM, locateOnRoute, remainingSeconds, SCHOOL, type LngLat } from './eta.ts'

// A straight 1 km road running east, about 111 m per 0.001° of latitude at Pune's latitude.
const west: LngLat = [73.82, 18.5]
const east: LngLat = [73.8294696, 18.5] // ≈ 1 km east
const road = [west, east]

describe('geometry', () => {
  it('measures distances', () => {
    expect(distanceM(west, east)).toBeGreaterThan(990)
    expect(distanceM(west, east)).toBeLessThan(1010)
    expect(lineLengthM(road)).toBeCloseTo(distanceM(west, east), 6)
  })
  it('finds where a point sits along the route', () => {
    const halfway: LngLat = [(west[0] + east[0]) / 2, 18.5]
    const r = locateOnRoute(road, halfway)
    expect(r.alongM / r.totalM).toBeCloseTo(0.5, 3)
    expect(r.offRouteM).toBeLessThan(0.5)
  })
  it('measures how far off the route a point is', () => {
    const north: LngLat = [(west[0] + east[0]) / 2, 18.5 + 0.0018] // ≈ 200 m north
    expect(locateOnRoute(road, north).offRouteM).toBeGreaterThan(190)
    expect(locateOnRoute(road, north).offRouteM).toBeLessThan(210)
  })
  it('clamps to the ends of the route', () => {
    const beyond: LngLat = [73.84, 18.5]
    const r = locateOnRoute(road, beyond)
    expect(r.alongM).toBeCloseTo(r.totalM, 3)
  })
})

describe('remainingSeconds', () => {
  const route = { line: road, durationS: 600 }
  it('scales the route time by the part still to go', () => {
    const quarter: LngLat = [west[0] + (east[0] - west[0]) * 0.25, 18.5]
    const { seconds, offRoute } = remainingSeconds(route, quarter)
    expect(seconds).toBeCloseTo(450, 0)
    expect(offRoute).toBe(false)
  })
  it('flags a position more than 100 m from the route', () => {
    expect(remainingSeconds(route, [73.825, 18.5015]).offRoute).toBe(true)
  })
})

describe('etaRange', () => {
  it('says "Arriving now" under 2 minutes', () => {
    expect(formatEta(etaRange(90))).toBe('Arriving now')
  })
  it('gives an honest range at least 2 minutes wide', () => {
    expect(etaRange(180)).toEqual({ kind: 'range', lowMin: 3, highMin: 5 })
    expect(formatEta(etaRange(600))).toBe('about 10–15 min')
    const r = etaRange(130)
    expect(r.kind === 'range' && r.highMin - r.lowMin).toBeGreaterThanOrEqual(2)
  })
  it('knows where the school is', () => {
    expect(SCHOOL).toEqual([73.8328, 18.50885])
  })
})
