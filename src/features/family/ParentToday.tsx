import { useEffect, useState, type ReactNode } from 'react'
import { CalendarX, Check, ChevronRight, CircleCheck, Clock, House, KeyRound, MapPin, Megaphone, MessageSquare, Navigation, Phone, School, Send, Sunrise, Timer, Users } from '../../ui/icons'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { EmptyState, ErrorState } from '../../ui/States'
import { childColor } from '../../ui/childColor'
import { useNow } from '../../ui/hooks'
import { formatTime, indiaClock, toMinutes } from '../../domain/time'
import { windowFor, type Direction, type Programme } from '../../domain/programme'
import { supabase } from '../../lib/supabase'
import { AreaShell } from '../auth/AreaShell'
import { useSession } from '../auth/session'
import type { ProgrammeRow } from '../admin/api'
import { arriveTrip, explainTripError, useTodayTrips, type Trip } from '../trips/api'
import { clockTime, formatRange, programmeOf } from '../trips/rules'
import { CancelSheet, LateSheet, OnMyWaySheet } from '../trips/TripSheets'
import { ResendSheet, SomeoneElseSheet } from '../trips/CollectorSheets'
import { CollectorTracker } from '../trips/TripLocation'
import { collectorCode } from '../trips/tracking'
import { undoAbsence, useToday, type Attendance, type DayTime } from '../school/api'
import { AWAY_LABEL } from '../school/dayModel'
import { Link } from 'react-router'
import { formatMobile } from '../../domain/contact'
import { AbsenceSheet } from './ParentPages'
import { useMyAnnouncements } from './parentData'
import { useToast } from '../../ui/Toast'
import { explainDbError } from '../admin/api'

interface ChildRow {
  id: string
  full_name: string
  preferred_name: string | null
  gender?: string | null
  programmes: ProgrammeRow | null
  child_schedules: Array<{ weekday: number; dropoff: string; pickup: string }>
}

const WORD: Record<Direction, string> = { dropoff: 'drop-off', pickup: 'pickup' }
const FIELDS = 'id, full_name, preferred_name, gender, programmes(id, name, flexible, starts, ends, weekdays, saturday_rule, term_start, term_end, dropoff_from, dropoff_to, pickup_from, pickup_to), child_schedules(weekday, dropoff, pickup), guardianships!inner(guardian_id)'

/** The signed-in parent's own children (row-level security allows no more; a staff member who is also a parent sees only theirs). */
function useMyChildren(guardianId: string | null) {
  const [rows, setRows] = useState<ChildRow[] | null>(null)
  const [error, setError] = useState(false)
  const load = () => {
    if (!guardianId) return
    setError(false)
    void supabase.from('children').select(FIELDS).eq('active', true).eq('guardianships.guardian_id', guardianId).order('full_name')
      .then(({ data, error: e }) => (e ? setError(true) : setRows((data ?? []) as unknown as ChildRow[])))
  }
  useEffect(load, [guardianId])
  return { rows, error, reload: load }
}

/** A drop-off or pickup time. With onClick it's a button: "I'm on my way" for that one, at any time of day. */
function Tile({ icon, label, value, detail, done, onClick }: { icon: ReactNode; label: string; value: string; detail: string; done?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <p className={`kicker flex items-center gap-1.5 [&_svg]:size-4 ${done ? 'text-live!' : ''}`}>{icon}{label}{onClick && <ChevronRight className="ml-auto text-ink-3" aria-hidden />}</p>
      <p className="text-numeral tabular-nums">{value}</p>
      <p className={`text-caption font-semibold ${done ? '' : 'text-ink-2'}`}>{detail}</p>
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} aria-label={`I'm on my way for ${label.toLowerCase()}, ${detail.toLowerCase()}`} className="choice grid content-start gap-1 p-3.5 text-left">{body}</button>
    : <div className={`grid content-start gap-1 rounded-lg p-3.5 ${done ? 'bg-live-soft text-live' : 'bg-sunken'}`}>{body}</div>
}

/** Sent → Seen → Ready → Collected, each with its time (the Screen Book's trip steps). */
function Steps({ items }: { items: Array<{ label: string; at: string | null }> }) {
  return (
    <ol className="mt-3 grid gap-0.5">
      {items.map((s, i) => (
        <li key={s.label} className={`relative grid grid-cols-[24px_1fr_auto] items-center gap-2.5 py-1.5 text-small font-bold ${s.at ? 'text-ink' : 'text-ink-3'}`}>
          <span className={`grid size-5 place-items-center justify-self-center rounded-full transition-colors duration-200 ${s.at ? 'bg-accent text-on-accent' : 'bg-surface shadow-[inset_0_0_0_2px_var(--line-2)]'}`} aria-hidden>
            {s.at && <Check className="size-3.5" strokeWidth={3.5} />}
          </span>
          {i < items.length - 1 && <span className="absolute left-[11px] top-[28px] h-3 w-0.5 bg-line-2" aria-hidden />}
          <span>{s.label}</span>
          <time className="text-caption font-semibold text-ink-2 tabular-nums">{s.at ? clockTime(s.at) : ''}</time>
        </li>
      ))}
    </ol>
  )
}

/** The collector's code, for the parent to read out again if needed (collector_code: guardians and planners only). */
function useCollectorCode(trip: Trip) {
  const [code, setCode] = useState<string | null>(null)
  const third = trip.traveller_kind === 'third_person'
  useEffect(() => {
    if (!third) return
    void collectorCode(trip.id).then(setCode).catch(() => setCode(null))
  }, [trip.id, trip.updated_at, third])
  return third ? code : null
}

function TripBlock({ trip, first, meId, onLate, onChange, onCancel, onResend }: { trip: Trip; first: string; meId: string | null; onLate: () => void; onChange: () => void; onCancel: () => void; onResend: () => void }) {
  const pickup = trip.direction === 'pickup'
  const third = trip.traveller_kind === 'third_person'
  const who = trip.traveller_name.split(' ')[0]!
  const mine = !third && trip.created_by === meId
  const code = useCollectorCode(trip)
  const toast = useToast()
  const [arriving, setArriving] = useState(false)
  // "I've arrived": the gate announces it at once. For the family's own trips; a collector with a link shows the code.
  async function arrived() {
    setArriving(true)
    try {
      await arriveTrip(trip.id)
      toast("The gate knows you're here.")
    } catch (e) {
      toast(explainTripError(e as { code?: string; message?: string }), { tone: 'danger' })
    } finally {
      setArriving(false)
    }
  }
  const steps = pickup
    ? [{ label: third ? `Link sent to ${who}` : 'Sent to the school', at: trip.created_at }, { label: 'Seen by the school', at: trip.acknowledged_at }, { label: `${first} is ready at the gate`, at: trip.ready_at }, { label: third ? `Collected by ${who}` : 'Collected', at: trip.closed_at }]
    : [{ label: 'Sent to the school', at: trip.created_at }, { label: 'Seen by the school', at: trip.acknowledged_at }, { label: `${first} checked in`, at: trip.closed_at }]
  return (
    <div className="mt-4 rounded-xl border border-line bg-canvas p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        {trip.ready_at ? <Pill tone="live" icon={<CircleCheck />}>Ready</Pill>
          : trip.arrived_at ? <Pill tone="live" icon={<MapPin />}>At the gate</Pill>
          : trip.late_at ? <Pill tone="warning" icon={<Timer />}>Running late</Pill>
          : <Pill tone="accent" icon={<Navigation />}>On the way</Pill>}
        <span className="kicker">{pickup ? 'Pickup' : 'Drop-off'}</span>
      </div>
      <p className="mt-3 text-h2 tabular-nums">{mine ? 'Arriving' : `${who} arrives`} about {clockTime(trip.arrive_at)}</p>
      {(trip.off_schedule && trip.reason && !trip.late_at) || third ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {trip.off_schedule && trip.reason && !trip.late_at && (
            <Pill tone="warning" icon={<Timer />}><span className="sr-only">Outside the usual time: </span>{trip.reason}</Pill>
          )}
          {third && (
            <Pill icon={<KeyRound />}>{code ? <>Gate code <b className="ml-1 tracking-[0.12em] tabular-nums text-ink">{code}</b></> : 'Gate code sent'}</Pill>
          )}
        </div>
      ) : null}
      {/* Location only for someone collecting with a link, and only for the parent who sent it (D38). */}
      {third && trip.created_by === meId && <CollectorTracker trip={trip} child={first} />}
      {third && trip.created_by !== meId && <p className="mt-3 text-small font-semibold text-ink-2">Only the parent who sent {who} the link can see where they are.</p>}
      <Steps items={steps} />
      {!third && !trip.arrived_at && (
        <Button size="lg" className="mt-4 w-full" icon={<MapPin />} loading={arriving} onClick={() => void arrived()}>I've arrived</Button>
      )}
      <div className="mt-4 flex flex-wrap gap-2.5 [&>*]:grow [&>*]:basis-40">
        <Button size="md" variant="sunshine" icon={<Timer />} onClick={onLate}>Running late</Button>
        {third ? <Button size="md" variant="secondary" icon={<Send />} onClick={onResend}>Resend link</Button>
          : <Button size="md" variant="secondary" icon={<Clock />} onClick={onChange}>Change time</Button>}
        <Button size="md" variant="quiet" onClick={onCancel}>Cancel {WORD[trip.direction]}</Button>
      </div>
    </div>
  )
}

type Sheet = { kind: 'otw' | 'late' | 'cancel' | 'else' | 'resend' | 'absence'; direction: Direction } | null

function ChildCard({ child, trips, nowMs, meId, attendance, times, onChanged }: { child: ChildRow; trips: Trip[]; nowMs: number; meId: string | null; attendance: Attendance | null; times: DayTime[]; onChanged: () => void }) {
  const toast = useToast()
  const [sheet, setSheet] = useState<Sheet>(null)
  const first = child.preferred_name ?? child.full_name.split(' ')[0]!
  const row = child.programmes
  const programme: Programme | null = row ? programmeOf(row) : null
  const today = indiaClock(new Date(nowMs))
  const mine = trips.filter((t) => t.child_id === child.id)
  const open = mine.find((t) => t.status === 'en_route') ?? null
  const dropDone = mine.find((t) => t.direction === 'dropoff' && t.status === 'checked_in') ?? null
  const pickDone = mine.find((t) => t.direction === 'pickup' && t.status === 'handed_over') ?? null
  const regular = child.child_schedules.find((s) => s.weekday === today.weekday)
  // 0026: trips work any day, so the buttons show every day (the regular times still follow the programme's days).
  const school = !!programme

  const changedTime = (d: Direction) => times.find((t) => t.direction === d) ?? null
  const usual = (d: Direction) => {
    const c = changedTime(d)
    if (c) return { value: formatTime(toMinutes(c.at.slice(0, 5))), detail: c.reason ? `Changed for today: ${c.reason.toLowerCase()}` : 'Changed for today', today: true }
    if (regular) return { value: formatTime(toMinutes((d === 'pickup' ? regular.pickup : regular.dropoff).slice(0, 5))), detail: 'Regular time' }
    if (!programme) return { value: 'Not set', detail: 'No programme yet' }
    const w = windowFor(programme, d)
    return programme.windows === 'flexible' ? { value: d === 'pickup' ? `By ${formatTime(programme.hours.to)}` : `From ${formatTime(programme.hours.from)}`, detail: 'Any time in the hours' }
      : { value: formatTime(w.from), detail: `Window ${formatRange(w)}` }
  }
  // Drop-off first; after it (or once its time has clearly passed) the pickup.
  const dropoffOver = programme ? today.minutes > (programme.windows === 'flexible' ? programme.hours.from + 180 : windowFor(programme, 'dropoff').to + 30) : true
  const away = attendance && attendance.status !== 'present' ? attendance : null
  const next: Direction | null = !school || pickDone || away ? null : !dropDone && !dropoffOver ? 'dropoff' : 'pickup'
  // The window only picks which one the big button offers: both tiles open "I'm on my way" at any time until it's done.
  const otw = (d: Direction) => (!open && next && !(d === 'dropoff' && dropDone) ? () => setSheet({ kind: 'otw', direction: d }) : undefined)
  async function undo() {
    try { await undoAbsence(child.id, today.date); toast(`${first} is expected today again.`); onChanged() } catch (e) { toast(explainDbError(e as { code?: string; message?: string })) }
  }

  const status = open ? null : pickDone ? <Pill icon={<House />}>Home time</Pill> : dropDone ? <Pill tone="live" icon={<School />}>At school</Pill> : null
  const drop = usual('dropoff')
  const pick = usual('pickup')

  return (
    <li className="card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <Avatar name={first} color={childColor(child.id)} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-h2">{first}</h2>
          <p className="truncate text-small font-semibold text-ink-2">{row?.name ?? 'No programme yet'}</p>
        </div>
        {status}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {dropDone ? <Tile done icon={<Sunrise />} label="Drop-off" value={clockTime(dropDone.closed_at!)} detail="Checked in" />
          : <Tile icon={<Sunrise />} label={'today' in drop ? 'Drop-off, today' : 'Drop-off'} value={drop.value} detail={drop.detail} onClick={otw('dropoff')} />}
        {pickDone ? <Tile done icon={<House />} label="Pickup" value={clockTime(pickDone.closed_at!)} detail={pickDone.traveller_kind === 'third_person' ? `By ${pickDone.traveller_name.split(' ')[0]}` : 'Collected'} />
          : <Tile icon={<House />} label={'today' in pick ? 'Pickup, today' : 'Pickup'} value={pick.value} detail={pick.detail} onClick={otw('pickup')} />}
      </div>

      {/* The way home with the person who collected (TRK-7): until they say they're home, at most an hour. */}
      {pickDone?.traveller_kind === 'third_person' && pickDone.created_by === meId && !pickDone.home_at && nowMs - Date.parse(pickDone.closed_at!) < 60 * 60_000 && (
        <CollectorTracker trip={pickDone} child={first} afterHandover />
      )}
      {open && programme ? (
        <TripBlock trip={open} first={first} meId={meId}
          onResend={() => setSheet({ kind: 'resend', direction: open.direction })}
          onLate={() => setSheet({ kind: 'late', direction: open.direction })}
          onChange={() => setSheet({ kind: 'otw', direction: open.direction })}
          onCancel={() => setSheet({ kind: 'cancel', direction: open.direction })} />
      ) : next && programme ? (
        <div className="mt-4">
          <Button size="xl" className="w-full [--fs:22px] [--h:80px] [--r:24px]" icon={<Navigation />} onClick={() => setSheet({ kind: 'otw', direction: next })}>I'm on my way</Button>
          <p className="mt-2 text-center text-caption font-semibold text-ink-3">For {first}'s {WORD[next]}, {next === 'pickup' ? pick.detail.toLowerCase() : drop.detail.toLowerCase()}</p>
          {next === 'pickup' && <Button size="md" variant="secondary" icon={<Users />} className="mt-3 w-full" onClick={() => setSheet({ kind: 'else', direction: 'pickup' })}>Someone else is collecting</Button>}
        </div>
      ) : away ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-sunken px-4 py-3">
          <CalendarX className="size-5 shrink-0 text-ink-2" aria-hidden />
          <p className="min-w-0 flex-1 text-small font-bold">{AWAY_LABEL[away.status] ?? 'Away'} today{away.note ? `: ${away.note.toLowerCase()}` : ''}</p>
          {away.status === 'absent' && <Button size="md" variant="secondary" onClick={() => void undo()}>Undo</Button>}
        </div>
      ) : (
        <p className="mt-4 text-body text-ink-2">{!school ? `No school for ${first} today.` : 'All done for today.'}</p>
      )}
      {school && !away && !pickDone && <Button size="md" variant="secondary" icon={<CalendarX />} className="mt-2.5 w-full" onClick={() => setSheet({ kind: 'absence', direction: 'dropoff' })}>{first} won't come today</Button>}

      {programme && sheet?.kind === 'otw' && (
        <OnMyWaySheet open onClose={() => setSheet(null)} childId={child.id} first={first} direction={sheet.direction} programme={programme} trip={open} nowMs={nowMs} />
      )}
      {programme && open && sheet?.kind === 'late' && <LateSheet open onClose={() => setSheet(null)} trip={open} first={first} programme={programme} nowMs={nowMs} />}
      {open && sheet?.kind === 'cancel' && <CancelSheet open onClose={() => setSheet(null)} trip={open} first={first} />}
      {programme && sheet?.kind === 'else' && <SomeoneElseSheet open onClose={() => setSheet(null)} childId={child.id} first={first} programme={programme} nowMs={nowMs} />}
      {open && sheet?.kind === 'resend' && <ResendSheet open onClose={() => setSheet(null)} trip={open} first={first} nowMs={nowMs} />}
      {sheet?.kind === 'absence' && <AbsenceSheet kids={[child]} initialChild={child.id} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); onChanged() }} />}
    </li>
  )
}

/**
 * Beside the children on wide screens: the school's latest news and the things a parent does often, so a family with one
 * child doesn't look at an empty half page. On phones it comes after the cards.
 */
function TodaySide({ kids }: { kids: Array<{ id: string; full_name: string; preferred_name: string | null }> }) {
  const ann = useMyAnnouncements()
  const [phone, setPhone] = useState<string | null>(null)
  const [absence, setAbsence] = useState(false)
  useEffect(() => { void supabase.from('settings').select('school_phone').single().then(({ data }) => setPhone((data as { school_phone: string | null } | null)?.school_phone ?? null)) }, [])
  const latest = ann.list?.slice(0, 3) ?? []
  const action = (icon: ReactNode, title: string, sub: string) => (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sunken [&_svg]:size-5" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-h4">{title}</span><span className="block truncate text-small font-semibold text-ink-2">{sub}</span></span>
      <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
    </>
  )
  const rowCls = 'flex w-full items-center gap-3 py-3 text-left'
  return (
    <aside className="grid content-start gap-5 lg:sticky lg:top-28" aria-label="From the school">
      <section className="card rounded-2xl p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="kicker flex items-center gap-2 [&_svg]:size-4"><Megaphone aria-hidden />From the school</h2>
          {ann.unread > 0 && <Pill tone="accent">{ann.unread} new</Pill>}
        </div>
        {!ann.list ? <div className="mt-3 h-20 animate-pulse rounded-lg bg-sunken" />
          : latest.length === 0 ? <p className="mt-3 text-small font-semibold text-ink-2">No announcements yet. School news will appear here.</p>
          : (
            <ul className="mt-2 divide-y divide-line">
              {latest.map((a) => (
                <li key={a.id} className="py-3">
                  <p className="flex items-center gap-2 text-h4">{!ann.read.has(a.id) && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="New" />}{a.title}</p>
                  <p className="line-clamp-2 text-small font-semibold text-ink-2">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        <Link to="/parent/updates" className="linkbtn -ml-2 mt-1 inline-flex items-center gap-1">All updates<ChevronRight className="size-4" aria-hidden /></Link>
      </section>

      <section className="card divide-y divide-line rounded-2xl px-5" aria-label="Quick actions">
        <button type="button" className={rowCls} disabled={!kids.length} onClick={() => setAbsence(true)}>{action(<CalendarX />, 'Report an absence', 'One day or several')}</button>
        <Link to="/parent/messages" className={rowCls}>{action(<MessageSquare />, 'Message the school', 'Everyday questions and notes')}</Link>
        {phone && <a href={`tel:${phone}`} className={rowCls}>{action(<Phone />, 'Call the school', formatMobile(phone))}</a>}
      </section>
      {absence && <AbsenceSheet kids={kids} onClose={() => setAbsence(false)} onSaved={() => setAbsence(false)} />}
    </aside>
  )
}

const greeting = (minutes: number) => (minutes < 12 * 60 ? 'Good morning' : minutes < 17 * 60 ? 'Good afternoon' : 'Good evening')

/** The parent's Today (J1–J3): each child's drop-off and pickup, "I'm on my way", and the trip's progress live. */
export function ParentToday() {
  const { state } = useSession()
  const me = state.status === 'signed-in' ? state.me : null
  const children = useMyChildren(me?.profile_id ?? null)
  const trips = useTodayTrips()
  const { attendance, times } = useToday()
  const nowMs = useNow(15_000)
  const clock = indiaClock(new Date(nowMs))
  const date = new Date(nowMs).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })
  const loadError = children.error || trips.error

  return (
    <AreaShell area="parent" title={`${greeting(clock.minutes)}, ${me?.full_name.split(' ')[0] ?? ''}`} subtitle={date}>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:gap-8">
      <section aria-busy={!children.rows}>
        {loadError ? (
          <ErrorState title="Couldn't load today" onRetry={() => { children.reload(); void trips.reload() }}>Check your connection and try again.</ErrorState>
        ) : !children.rows || !trips.trips ? (
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2" aria-label="Loading">{[0, 1].map((i) => <li key={i} className="card h-[300px] animate-pulse rounded-2xl" />)}</ul>
        ) : children.rows.length === 0 ? (
          <EmptyState title="No children yet">No children are linked to your account yet. Please contact the school.</EmptyState>
        ) : (
          <ul className={`grid gap-4 ${children.rows.length > 1 ? 'md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2' : ''}`}>
            {children.rows.map((c) => <ChildCard key={c.id} child={c} trips={trips.trips!} nowMs={nowMs} meId={me?.profile_id ?? null}
              attendance={attendance.rows?.find((a) => a.child_id === c.id) ?? null} times={times.rows?.filter((t) => t.child_id === c.id) ?? []}
              onChanged={() => { void trips.reload(); void attendance.reload(); void times.reload() }} />)}
          </ul>
        )}
      </section>
      {children.rows && children.rows.length > 0 && <TodaySide kids={children.rows} />}
      </div>
    </AreaShell>
  )
}
