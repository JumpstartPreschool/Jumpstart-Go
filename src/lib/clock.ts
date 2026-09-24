import { demoClockOffset } from '../demo/demo'

/** The app's "now" in ms: the device clock, or the demo's school-day clock in demo mode. */
export const now = (): number => Date.now() + demoClockOffset()
