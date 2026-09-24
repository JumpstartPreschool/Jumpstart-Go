import { formatTime, toMinutes, type Minutes } from '../../domain/time'

const FROM = toMinutes('08:30')
const TO = toMinutes('19:30')
const pct = (m: Minutes) => `${(((m - FROM) / (TO - FROM)) * 100).toFixed(2)}%`
const TICKS = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00'].map(toMinutes)

/**
 * The school day as a bar (Screen Book): the class hours, with the drop-off and pickup windows marked on it, so a
 * change to the hours shows where the windows move. Decorative: the same times are always written out next to it.
 */
export function DayBar({ hours, dropoff, pickup, extended }: { hours: [Minutes, Minutes]; dropoff: [Minutes, Minutes]; pickup: [Minutes, Minutes]; extended?: boolean }) {
  const seg = (a: Minutes, b: Minutes, cls: string) => <span className={`absolute inset-y-0 rounded-sm ${cls}`} style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)} + 4px)` }} />
  return (
    <div aria-hidden>
      <div className="relative h-6 rounded-md bg-sunken">
        {seg(hours[0], hours[1], 'bg-line-2')}
        {seg(dropoff[0], dropoff[1], 'bg-rb-green')}
        {seg(pickup[0], pickup[1], extended ? 'bg-[repeating-linear-gradient(90deg,var(--rb-orange)_0_6px,color-mix(in_oklab,var(--rb-orange)_35%,transparent)_6px_12px)]' : 'bg-rb-orange')}
      </div>
      <div className="relative mt-1 h-4 text-[12px] font-bold text-ink-3">
        {TICKS.map((t) => <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: pct(t) }}>{formatTime(t).replace(':00', '').replace(' ', ' ')}</span>)}
      </div>
    </div>
  )
}
