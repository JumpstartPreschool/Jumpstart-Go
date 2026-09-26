import { useState, type ReactNode } from 'react'
import { CalendarX, Check, Clock, House, MessageSquare, Navigation, Phone, School, Sunrise } from '../../ui/icons'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/Field'
import { Pill } from '../../ui/Pill'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { EmptyState, Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { childColor } from '../../ui/childColor'
import { formatMobile } from '../../domain/contact'
import { formatTime } from '../../domain/time'
import { windowFor, type Direction } from '../../domain/programme'
import { explainDbError } from '../admin/api'
import { clockTime, formatRange } from '../trips/rules'
import { todayInIndia } from '../trips/api'
import { setAttendance, type AttendanceStatus } from './api'
import { AWAY_LABEL, boardOrder, busyAt, type DayState } from './dayModel'
import { TimeSheet } from './TimeSheet'
import type { SchoolChild } from './useSchoolDay'

type Filter = 'all' | 'here' | 'otw' | 'done' | 'away'
const MATCH: Record<Filter, (s: DayState) => boolean> = { all: () => true, here: (s) => s === 'here', otw: (s) => s === 'otw', done: (s) => s === 'collected', away: (s) => s === 'away' }

export function StatePill({ c }: { c: SchoolChild }) {
  const s = c.day.state
  if (s === 'away') return <Pill tone="stale" icon={<CalendarX />}>{c.day.next.label}</Pill>
  if (s === 'collected') return <Pill icon={<House />}>Home time</Pill>
  if (s === 'otw') return <Pill tone="accent" icon={<Navigation />}>On the way</Pill>
  if (s === 'here') return <Pill tone="live" icon={<School />}>At school</Pill>
  return <Pill icon={<Sunrise />}>Expected</Pill>
}

const nextDirection = (c: SchoolChild): Direction | null => (c.day.state === 'away' || c.day.state === 'collected' ? null : c.day.state === 'here' || c.day.trip?.direction === 'pickup' ? 'pickup' : 'dropoff')

/** The four counts at the top of the board; each one filters the list (tap again to show everyone). */
function Sums({ children, filter, onFilter }: { children: SchoolChild[]; filter: Filter; onFilter: (f: Filter) => void }) {
  const n = (f: Filter) => children.filter((c) => MATCH[f](c.day.state)).length
  const sum = (f: Filter, label: string, tone: string) => (
    <button type="button" aria-pressed={filter === f} onClick={() => onFilter(filter === f ? 'all' : f)}
      className={`card grid rounded-xl px-4 py-3 text-left transition-shadow duration-150 ${filter === f ? 'shadow-[0_0_0_2px_var(--accent),var(--shadow-card)]' : 'hover:shadow-[var(--shadow-lift)]'}`}>
      <span className={`text-numeral tabular-nums ${tone}`}>{n(f)}</span>
      <span className="text-small font-bold text-ink-2">{label}</span>
    </button>
  )
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {sum('here', 'At school', 'text-live')}{sum('otw', 'On the way', 'text-accent-ink')}{sum('done', 'Collected', 'text-ink')}{sum('away', 'Absent or off', 'text-warning')}
    </div>
  )
}

/** The core team's sheet for a child: attendance today, and today's time. */
function KidSheet({ c, all, nowMs, onClose, onChanged }: { c: SchoolChild; all: SchoolChild[]; nowMs: number; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const current: AttendanceStatus = c.day.away?.status ?? 'present'
  const [status, setStatus] = useState<AttendanceStatus>(current)
  const [note, setNote] = useState(c.day.away?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeFor, setTimeFor] = useState<Direction | null>(null)
  const next = nextDirection(c)
  const changed = status !== current || (status !== 'present' && note.trim() !== (c.day.away?.note ?? ''))
  const done = (d: Direction) => c.trips.find((t) => t.direction === d && t.status !== 'en_route' && t.status !== 'cancelled')

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await setAttendance(c.id, todayInIndia(), status, status === 'present' ? null : note.trim() || null)
      toast(`${c.first}: ${status === 'present' ? 'present' : AWAY_LABEL[status]!.toLowerCase()}.`)
      onChanged()
      onClose()
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  const fact = (label: string, d: Direction) => {
    const closed = done(d)
    return (
      <div className="rounded-lg bg-sunken px-3.5 py-2.5">
        <p className="kicker">{label}</p>
        <p className="mt-0.5 text-h4 tabular-nums">{closed ? clockTime(closed.closed_at!) : c.day.expected[d] !== null ? formatTime(c.day.expected[d]!) : 'Not set'}</p>
        <p className="text-caption font-semibold text-ink-2">{closed ? (d === 'pickup' ? 'Collected' : 'Checked in') : c.day.changed[d] ? 'Changed for today' : c.programme ? `Window ${formatRange(windowFor(c.programme, d))}` : ''}</p>
      </div>
    )
  }

  return (
    <>
      <Sheet open onClose={onClose} title={c.fullName} description={c.programmeRow?.name}>
        <div className="grid grid-cols-2 gap-2.5">{fact('Drop-off', 'dropoff')}{fact('Pickup', 'pickup')}</div>
        <fieldset className="mt-5">
          <legend className="kicker mb-2.5">Attendance today</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Attendance">
            {(['present', 'absent', 'on_leave', 'off'] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={status === v} onClick={() => setStatus(v)} className="choice h-12 px-3 text-h4">{v === 'present' ? 'Present' : AWAY_LABEL[v]}</button>
            ))}
          </div>
        </fieldset>
        {status !== 'present' && (
          <div className="mt-4 grid gap-2">
            <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="For example, unwell" />
            <p className="text-caption font-semibold text-ink-2">Marking {c.first} away cancels today's trips, so nothing is announced.</p>
          </div>
        )}
        {error && <Notice tone="danger" className="mt-4">{error}</Notice>}
        <SheetFooter>
          <Button size="xl" className="w-full" icon={<Check />} loading={busy} disabled={!changed} onClick={() => void save()}>Save attendance</Button>
          {next && current === 'present' && c.programme && (
            <Button variant="secondary" className="mt-2.5 w-full" icon={<Clock />} onClick={() => setTimeFor(next)}>Change today's {next === 'pickup' ? 'pickup' : 'drop-off'} time</Button>
          )}
        </SheetFooter>
      </Sheet>
      {timeFor && c.programme && (
        <TimeSheet open onClose={() => setTimeFor(null)} childId={c.id} first={c.first} direction={timeFor} programme={c.programme} current={c.day.changed[timeFor] ? c.day.expected[timeFor] : null}
          usual={c.regular ? c.day.expected[timeFor] : null} nowMs={nowMs} onSaved={() => { onChanged(); onClose() }}
          onBehalfOf={c.guardians[0]?.full_name.split(' ')[0]} busy={(at) => busyAt(all.map((x) => ({ id: x.id, day: x.day })), c.id, timeFor, at)} />
      )}
    </>
  )
}

/** The front desk's read-only sheet: where the child is, and the family's numbers to call. */
function InfoSheet({ c, onClose, onLogCall, onMessages }: { c: SchoolChild; onClose: () => void; onLogCall?: () => void; onMessages?: () => void }) {
  return (
    <Sheet open onClose={onClose} title={c.fullName} description={c.programmeRow?.name}>
      <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-sunken px-3.5 py-3">
        <StatePill c={c} />
        <span className="text-small font-bold">{c.day.next.at !== null ? `${formatTime(c.day.next.at)} ${c.day.next.label}` : c.day.next.label}</span>
      </div>
      <h3 className="kicker mt-5">Parents and family</h3>
      <ul className="mt-2 divide-y divide-line">
        {c.guardians.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <Avatar name={g.full_name} color={g.kind === 'parent' ? 'var(--rb-blue)' : 'var(--ink-3)'} size="sm" />
            <div className="min-w-0 flex-1 basis-[160px]">
              <p className="truncate text-h4">{g.full_name}</p>
              <p className="truncate text-small font-semibold text-ink-2">{g.relation}{g.abroad ? ', lives outside India' : ''}{g.phone ? `, ${formatMobile(g.phone)}` : ', no phone'}{g.app_access ? ', has the app' : ''}</p>
            </div>
            {g.phone && <a className="btn btn--secondary btn--md" href={`tel:${g.phone}`} aria-label={`Call ${g.full_name}`}><Phone aria-hidden />Call</a>}
          </li>
        ))}
      </ul>
      <SheetFooter>
        {onLogCall && <Button size="xl" className="w-full" icon={<Phone />} onClick={onLogCall}>Log a call about {c.first}</Button>}
        {onMessages && <Button variant="secondary" className="mt-2.5 w-full" icon={<MessageSquare />} onClick={onMessages}>Open messages</Button>}
      </SheetFooter>
    </Sheet>
  )
}

/**
 * Today's children (Screen Book: the core team's Today, the front desk's list): counts that filter, then each child with
 * where they are and the time that matters next. The core team edits; the front desk reads and logs calls.
 */
export function Board({ children, editable, nowMs, onChanged, onLogCall, onMessages, title }: {
  children: SchoolChild[]; editable: boolean; nowMs: number; onChanged: () => void; onLogCall?: (childId: string) => void; onMessages?: (childId: string) => void; title?: ReactNode
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [picked, setPicked] = useState<string | null>(null)
  const list = children.filter((c) => MATCH[filter](c.day.state)).sort((a, b) => boardOrder(a.day) - boardOrder(b.day))
  const chosen = children.find((c) => c.id === picked) ?? null
  return (
    <div className="grid gap-4">
      <Sums children={children} filter={filter} onFilter={setFilter} />
      {title}
      {filter !== 'all' && (
        <p className="flex items-center gap-2 text-small font-semibold text-ink-2">
          Showing {({ here: 'those at school', otw: 'those on the way', done: 'those collected', away: 'those absent or off' } as Record<string, string>)[filter]}.
          <button type="button" className="linkbtn" onClick={() => setFilter('all')}>Show everyone</button>
        </p>
      )}
      {list.length === 0 ? <EmptyState title="Nobody here">No children match this.</EmptyState> : (
        <ul className="grid gap-2.5 lg:grid-cols-2">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setPicked(c.id)} className="card flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl p-3 pr-4 text-left transition-shadow duration-150 hover:shadow-[var(--shadow-lift)]">
                <Avatar name={c.first} color={childColor(c.id)} />
                <span className="min-w-0 flex-1 basis-[150px]">
                  <span className="block truncate text-h4">{c.fullName}</span>
                  <span className="block truncate text-small font-semibold text-ink-2">{c.programmeRow?.name ?? 'No programme'}</span>
                </span>
                <StatePill c={c} />
                <span className="grid min-w-[72px] justify-items-end text-right">
                  <span className="text-h4 tabular-nums">{c.day.next.at !== null ? formatTime(c.day.next.at).replace(/ (AM|PM)$/, '') : '·'}</span>
                  <span className="text-caption font-semibold text-ink-2">{c.day.next.at !== null ? c.day.next.label : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen && (editable
        ? <KidSheet c={chosen} all={children} nowMs={nowMs} onClose={() => setPicked(null)} onChanged={onChanged} />
        : <InfoSheet c={chosen} onClose={() => setPicked(null)} onLogCall={onLogCall && (() => { setPicked(null); onLogCall(chosen.id) })} onMessages={onMessages && (() => { setPicked(null); onMessages(chosen.id) })} />)}
    </div>
  )
}
