/** Minutes since midnight, India time (IST: UTC+5:30, no daylight saving). */
export type Minutes = number

/** School hours are fixed (PRD D6). Nothing can be requested outside them. */
export const SCHOOL_OPENS: Minutes = 9 * 60
export const SCHOOL_CLOSES: Minutes = 19 * 60

const IST_OFFSET_MS = 330 * 60_000

/** "09:30" → 570. Throws on anything that isn't a valid 24-hour HH:MM. */
export function toMinutes(hhmm: string): Minutes {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm)
  if (!m) throw new RangeError(`Not a 24-hour time: ${hhmm}`)
  return Number(m[1]) * 60 + Number(m[2])
}

/** 570 → "9:30 AM", 780 → "1:00 PM". */
export function formatTime(min: Minutes): string {
  const h = Math.floor(min / 60)
  const m = String(min % 60).padStart(2, '0')
  const suffix = h < 12 ? 'AM' : 'PM'
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${suffix}`
}

export function withinSchoolHours(min: Minutes): boolean {
  return min >= SCHOOL_OPENS && min <= SCHOOL_CLOSES
}

/** The India date and time for an instant: date as YYYY-MM-DD, weekday 1 = Monday … 7 = Sunday. */
export function indiaClock(at: Date): { date: string; minutes: Minutes; weekday: number } {
  const d = new Date(at.getTime() + IST_OFFSET_MS)
  return {
    date: d.toISOString().slice(0, 10),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    weekday: d.getUTCDay() === 0 ? 7 : d.getUTCDay(),
  }
}

/** Weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
export function weekdayOf(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}
