/** How fresh a live position is (TRK-3, tracking-architecture §6). */
export type Freshness = 'live' | 'recent' | 'stale' | 'unavailable'

export const LIVE_UNDER_MS = 15_000
export const RECENT_UNDER_MS = 60_000

export interface PositionTimes {
  /** When the phone took the fix (phone clock), ms since epoch. */
  fixAt: number
  /** When the server received it (server clock), ms since epoch. */
  receivedAt: number
}

/**
 * Uses the earlier of the phone and server times, so a phone with a wrong clock
 * can never make a position look newer than it is. `now` is server-corrected time.
 */
export function freshness(last: PositionTimes | null, now: number): { state: Freshness; ageMs: number | null } {
  if (!last) return { state: 'unavailable', ageMs: null }
  const ageMs = Math.max(0, now - Math.min(last.fixAt, last.receivedAt))
  const state = ageMs < LIVE_UNDER_MS ? 'live' : ageMs < RECENT_UNDER_MS ? 'recent' : 'stale'
  return { state, ageMs }
}

/** "32s", "3 min", "1 h 5 min": the age text shown next to RECENT and STALE. */
export function formatAge(ageMs: number): string {
  const s = Math.floor(ageMs / 1000)
  if (s < 60) return `${s}s`
  const min = Math.floor(s / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}
