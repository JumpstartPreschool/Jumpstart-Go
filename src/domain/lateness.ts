import type { Minutes } from './time'

/** Default running-late threshold and repeat step, in minutes (PRD D20; the admin can change the threshold). */
export const LATE_THRESHOLD_MIN = 10
export const LATE_STEP_MIN = 10

/**
 * The lateness band to announce: 0 while less than `threshold` late, then threshold, threshold + step, …
 * An announcement is due whenever the band rises above the last one announced.
 */
export function lateBand(scheduled: Minutes, projectedArrival: Minutes, threshold = LATE_THRESHOLD_MIN, step = LATE_STEP_MIN): number {
  const late = projectedArrival - scheduled
  if (late < threshold) return 0
  return threshold + Math.floor((late - threshold) / step) * step
}
