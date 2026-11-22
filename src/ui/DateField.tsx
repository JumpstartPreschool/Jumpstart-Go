import { useId, useState, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleAlert } from './icons'
import { Sheet } from './Sheet'

/** Dates are 'YYYY-MM-DD'; the arithmetic runs in UTC so no time zone shifts a day. */
const at = (d: string) => new Date(`${d}T00:00:00Z`)
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => at(d).toLocaleDateString('en-IN', { ...o, timeZone: 'UTC' })
/** "14 May 2022", as the field shows a chosen date. */
export const longDate = (d: string) => fmt(d, { day: 'numeric', month: 'long', year: 'numeric' })
const MONTHS = Array.from({ length: 12 }, (_, m) => fmt(iso(2024, m, 1), { month: 'short' }))
const todayIso = () => new Date().toISOString().slice(0, 10)

type View = 'days' | 'months' | 'years'
const YEARS_PER_PAGE = 12

const navButton = 'grid size-11 place-items-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-sunken disabled:opacity-30 [&_svg]:size-5'
const cell = 'rounded-full font-bold tabular-nums transition-[background-color,transform] duration-150 active:scale-95 disabled:opacity-25'

/**
 * One date in a card: days of a month, and a tap on the month and year jumps to a year grid, then a month grid, so a
 * birth date years back is three taps. Days outside min–max are off; today is ringed; the chosen day is filled.
 */
export function DateCalendar({ value, onPick, min, max, startWith = 'days' }: { value: string; onPick: (d: string) => void; min: string; max: string; startWith?: View }) {
  const anchor = value || (todayIso() > max ? max : todayIso() < min ? min : todayIso())
  const [year, setYear] = useState(Number(anchor.slice(0, 4)))
  const [month, setMonth] = useState(Number(anchor.slice(5, 7)) - 1)
  const [view, setView] = useState<View>(startWith)
  const [page, setPage] = useState(Math.floor(Number(anchor.slice(0, 4)) / YEARS_PER_PAGE) * YEARS_PER_PAGE)
  const [minY, maxY] = [Number(min.slice(0, 4)), Number(max.slice(0, 4))]
  const today = todayIso()
  // Filled only for a real choice; with nothing chosen yet, the current year and month are ringed, not filled.
  const fill = 'bg-accent text-white shadow-[0_2px_0_var(--accent-lip)]'
  const ring = 'bg-sunken ring-2 ring-inset ring-accent text-accent-ink'
  const pickedY = value ? Number(value.slice(0, 4)) : null
  const pickedM = value ? Number(value.slice(5, 7)) - 1 : null

  const first = iso(year, month, 1)
  const lead = (at(first).getUTCDay() + 6) % 7 // Monday first
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const monthKey = (y: number, m: number) => iso(y, m, 1).slice(0, 7)
  const step = (by: number) => { const d = new Date(Date.UTC(year, month + by, 1)); setYear(d.getUTCFullYear()); setMonth(d.getUTCMonth()) }

  const header = (title: string, onTitle: (() => void) | null, prev: [() => void, boolean], next: [() => void, boolean]) => (
    <div className="mb-2 flex items-center justify-between gap-2">
      <button type="button" className={navButton} aria-label="Previous" disabled={prev[1]} onClick={prev[0]}><ChevronLeft /></button>
      {onTitle ? (
        <button type="button" onClick={onTitle} aria-live="polite"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-h4 transition-colors duration-150 hover:bg-sunken [&_svg]:size-4 [&_svg]:text-ink-3">
          {title}<ChevronDown aria-hidden />
        </button>
      ) : <p className="text-h4" aria-live="polite">{title}</p>}
      <button type="button" className={navButton} aria-label="Next" disabled={next[1]} onClick={next[0]}><ChevronRight /></button>
    </div>
  )

  return (
    <div className="rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-card)] sm:p-4">
      {view === 'years' && (
        <>
          {header(`${page} – ${page + YEARS_PER_PAGE - 1}`, null, [() => setPage(page - YEARS_PER_PAGE), page <= minY], [() => setPage(page + YEARS_PER_PAGE), page + YEARS_PER_PAGE > maxY])}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Choose the year">
            {Array.from({ length: YEARS_PER_PAGE }, (_, i) => page + i).map((y) => (
              <button key={y} type="button" disabled={y < minY || y > maxY} aria-pressed={y === pickedY}
                onClick={() => { setYear(y); setView('months') }}
                className={`${cell} h-12 text-body ${y === pickedY ? fill : y === Number(today.slice(0, 4)) ? ring : 'bg-sunken hover:bg-accent-soft'}`}>{y}</button>
            ))}
          </div>
        </>
      )}
      {view === 'months' && (
        <>
          {header(String(year), () => { setPage(Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE); setView('years') }, [() => setYear(year - 1), year <= minY], [() => setYear(year + 1), year >= maxY])}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Choose the month">
            {MONTHS.map((name, m) => (
              <button key={name} type="button" disabled={monthKey(year, m) < min.slice(0, 7) || monthKey(year, m) > max.slice(0, 7)} aria-pressed={year === pickedY && m === pickedM}
                onClick={() => { setMonth(m); setView('days') }}
                className={`${cell} h-12 text-body ${year === pickedY && m === pickedM ? fill : monthKey(year, m) === today.slice(0, 7) ? ring : 'bg-sunken hover:bg-accent-soft'}`}>{name}</button>
            ))}
          </div>
        </>
      )}
      {view === 'days' && (
        <>
          {header(fmt(first, { month: 'long', year: 'numeric' }), () => setView('months'),
            [() => step(-1), monthKey(year, month) <= min.slice(0, 7)], [() => step(1), monthKey(year, month) >= max.slice(0, 7)])}
          <div className="grid grid-cols-7 text-center text-caption font-bold text-ink-3" aria-hidden>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="py-1">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1" role="group" aria-label="Choose the day">
            {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
            {Array.from({ length }, (_, i) => iso(year, month, i + 1)).map((d) => {
              const chosen = d === value
              return (
                <div key={d} className="flex justify-center">
                  <button type="button" disabled={d < min || d > max} aria-pressed={chosen} onClick={() => onPick(d)}
                    aria-label={fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    className={`${cell} grid size-10 place-items-center text-small sm:size-11 ${chosen ? fill : d === today ? 'ring-2 ring-accent ring-inset text-accent-ink' : 'hover:bg-sunken'}`}>
                    {Number(d.slice(8))}
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * A date field that looks like the other fields and opens the calendar card in a sheet: never the browser's own date
 * control, so it looks and works the same on every phone, tablet and computer.
 */
export function DateField({ label, value, onChange, min = '1900-01-01', max = '2100-12-31', error, hint, placeholder = 'Choose a date', startWith }: {
  label: string; value: string; onChange: (d: string) => void; min?: string; max?: string; error?: string | null; hint?: ReactNode; placeholder?: string; startWith?: View
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="px-0.5 text-small font-bold text-ink-2">{label}</label>
      <div className="input">
        <CalendarDays aria-hidden />
        <button id={id} type="button" className="input__value" aria-haspopup="dialog" aria-invalid={!!error || undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined} onClick={() => setOpen(true)}>
          {value ? longDate(value) : <span className="text-ink-3">{placeholder}</span>}
        </button>
        <ChevronDown aria-hidden />
      </div>
      {error ? (
        <p id={`${id}-msg`} className="flex items-start gap-1.5 px-0.5 text-small font-bold text-danger" role="alert"><CircleAlert className="mt-px size-4 shrink-0" aria-hidden />{error}</p>
      ) : hint ? <p id={`${id}-msg`} className="px-0.5 text-caption font-semibold text-ink-2">{hint}</p> : null}
      {open && (
        <Sheet open onClose={() => setOpen(false)} title={label} description="Tap the month and year to jump to another year.">
          <DateCalendar value={value} min={min} max={max} startWith={value ? 'days' : startWith} onPick={(d) => { onChange(d); setOpen(false) }} />
        </Sheet>
      )}
    </div>
  )
}
