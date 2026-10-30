import { useState } from 'react'
import { ChevronLeft, ChevronRight } from './icons'

/** Dates are 'YYYY-MM-DD' strings in India time; the arithmetic runs in UTC so no time zone shifts a day. */
const at = (d: string) => new Date(`${d}T00:00:00Z`)
export const addDays = (d: string, n: number) => new Date(at(d).getTime() + n * 86_400_000).toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) => Math.round((at(b).getTime() - at(a).getTime()) / 86_400_000)
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => at(d).toLocaleDateString('en-IN', { ...o, timeZone: 'UTC' })
export const shortDate = (d: string) => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })

export interface Range { from: string; to: string }

/** The next range after tapping a day: a first tap starts it, a later day ends it, an earlier day starts again. */
export function nextRange(r: Range, day: string, picking: boolean): Range {
  if (picking && day >= r.from) return { from: r.from, to: day }
  return { from: day, to: day }
}

/**
 * A month calendar for choosing one day or a run of days (tap the first, then the last). Days outside min–max are off;
 * Sundays are shown quieter since there's no school.
 */
export function RangeCalendar({ value, onChange, min, max }: { value: Range; onChange: (r: Range) => void; min: string; max: string }) {
  const [month, setMonth] = useState(value.from.slice(0, 7))
  const [picking, setPicking] = useState(false)
  const first = `${month}-01`
  const lead = (at(first).getUTCDay() + 6) % 7 // Monday first
  const prev = addDays(first, -1).slice(0, 7)
  const next = addDays(first, 32).slice(0, 7)
  const days = Array.from({ length: daysBetween(first, `${next}-01`) }, (_, i) => addDays(first, i))

  function tap(day: string) {
    setPicking(!(picking && day >= value.from))
    onChange(nextRange(value, day, picking))
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="grid size-11 place-items-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-sunken disabled:opacity-30"
          aria-label="Previous month" disabled={prev < min.slice(0, 7)} onClick={() => setMonth(prev)}><ChevronLeft className="size-5" /></button>
        <p className="text-h4" aria-live="polite">{fmt(first, { month: 'long', year: 'numeric' })}</p>
        <button type="button" className="grid size-11 place-items-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-sunken disabled:opacity-30"
          aria-label="Next month" disabled={next > max.slice(0, 7)} onClick={() => setMonth(next)}><ChevronRight className="size-5" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-caption font-bold text-ink-3" aria-hidden>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1" role="group" aria-label="Choose the days">
        {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
        {days.map((d) => {
          const off = d < min || d > max
          const ends = d === value.from || d === value.to
          const inside = d > value.from && d < value.to
          const sunday = at(d).getUTCDay() === 0
          const band = value.from !== value.to && (inside || ends)
          // The band rounds off where it starts and ends, and at the edges of a week or month.
          const roundL = d === value.from || at(d).getUTCDay() === 1 || d === days[0]
          const roundR = d === value.to || sunday || d === days.at(-1)
          return (
            <div key={d} className={`flex justify-center ${band ? 'bg-accent-soft' : ''} ${band && roundL ? 'rounded-l-full' : ''} ${band && roundR ? 'rounded-r-full' : ''}`}>
              <button type="button" disabled={off} onClick={() => tap(d)} aria-pressed={ends || inside}
                aria-label={`${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}${sunday ? ', no school' : ''}`}
                className={`grid size-10 place-items-center rounded-full text-small font-bold tabular-nums transition-[background-color,transform] duration-150 active:scale-95 disabled:opacity-25 sm:size-11
                  ${ends ? 'bg-accent text-white shadow-[0_2px_0_var(--accent-lip)]' : inside ? 'text-accent-ink' : sunday ? 'text-ink-3' : 'hover:bg-sunken'}`}>
                {Number(d.slice(8))}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
