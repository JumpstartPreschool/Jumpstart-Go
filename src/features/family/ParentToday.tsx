import { useEffect, useState, type ReactNode } from 'react'
import { Check, CircleCheck, Clock, House, KeyRound, Navigation, School, Send, Sunrise, Timer, TriangleAlert, Users } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { EmptyState, ErrorState } from '../../ui/States'
import { childColor } from '../../ui/childColor'
import { useNow } from '../../ui/hooks'
import { formatTime, indiaClock, toMinutes } from '../../domain/time'
import { runsOn, windowFor, type Direction, type Programme } from '../../domain/programme'
import { supabase } from '../../lib/supabase'
import { AreaShell } from '../auth/AreaShell'
import { useSession } from '../auth/session'
import type { ProgrammeRow } from '../admin/api'
import { useTodayTrips, type Trip } from '../trips/api'
import { clockTime, formatRange, programmeOf } from '../trips/rules'
import { CancelSheet, LateSheet, OnMyWaySheet } from '../trips/TripSheets'
import { ResendSheet, SomeoneElseSheet } from '../trips/CollectorSheets'
import { ShareMyLocation, TravellerPosition } from '../trips/TripLocation'
import { collectorCode } from '../trips/tracking'

interface ChildRow {
  id: string
  full_name: string
  preferred_name: string | null
  programmes: ProgrammeRow | null
  classes: { name: string } | null
  child_schedules: Array<{ weekday: number; dropoff: string; pickup: string }>
}

const WORD: Record<Direction, string> = { dropoff: 'drop-off', pickup: 'pickup' }
const FIELDS = 'id, full_name, preferred_name, programmes(id, name, flexible, starts, ends, weekdays, saturday_rule, term_start, term_end, dropoff_from, dropoff_to, pickup_from, pickup_to), classes(name), child_schedules(weekday, dropoff, pickup), guardianships!inner(guardian_id)'

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

function Tile({ icon, label, value, detail, done }: { icon: ReactNode; label: string; value: string; detail: string; done?: boolean }) {
  return (
    <div className={`grid content-start gap-1 rounded-lg p-3.5 ${done ? 'bg-live-soft text-live' : 'bg-sunken'}`}>
      <p className={`kicker flex items-center gap-1.5 [&_svg]:size-4 ${done ? 'text-live!' : ''}`}>{icon}{label}</p>
      <p className="text-numeral tabular-nums">{value}</p>
      <p className={`text-caption font-semibold ${done ? '' : 'text-ink-2'}`}>{detail}</p>
    </div>
  )
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
  const steps = pickup
    ? [{ label: third ? `Link sent to ${who}` : 'Sent to the school', at: trip.created_at }, { label: 'Seen by the school', at: trip.acknowledged_at }, { label: `${first} is ready at the gate`, at: trip.ready_at }, { label: third ? `Collected by ${who}` : 'Collected', at: trip.closed_at }]
    : [{ label: 'Sent to the school', at: trip.created_at }, { label: 'Seen by the school', at: trip.acknowledged_at }, { label: `${first} checked in`, at: trip.closed_at }]
  const sub = trip.ready_at ? `${first} is ready at the gate.` : trip.acknowledged_at ? 'The school has seen it and is getting ready.' : mine ? "The school knows you're coming." : `The school knows ${who} is coming.`
  return (
    <div className="mt-4 rounded-xl border border-line bg-canvas p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        {trip.ready_at ? <Pill tone="live" icon={<CircleCheck />}>Ready</Pill> : <Pill tone="accent" icon={<Navigation />}>On the way</Pill>}
        <span className="kicker">{pickup ? 'Pickup' : 'Drop-off'}</span>
      </div>
      <p className="mt-3 text-h2 tabular-nums">{mine ? 'Arriving' : `${who} arrives`} about {clockTime(trip.arrive_at)}</p>
      <p className="mt-1 text-body text-ink-2">{sub}</p>
      {trip.off_schedule && trip.reason && <Pill tone="warning" icon={<TriangleAlert />} className="mt-3">Outside the usual time: {trip.reason}</Pill>}
      {third && (
        <p className="mt-3 flex items-center gap-2 text-small font-semibold text-ink-2">
          <KeyRound className="size-4 shrink-0" aria-hidden />
          {code ? <span>{who} shows code <b className="text-ink tracking-[0.12em] tabular-nums">{code}</b> at the gate.</span> : <span>{who} shows their 4-digit code at the gate.</span>}
        </p>
      )}
      {mine ? <ShareMyLocation trip={trip} /> : <TravellerPosition trip={trip} who={third ? who : trip.traveller_relation ? `${who} (${trip.traveller_relation.toLowerCase()})` : who} />}
      <Steps items={steps} />
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Button size="md" variant="sunshine" icon={<Timer />} onClick={onLate}>Running late</Button>
        {third ? <Button size="md" variant="secondary" icon={<Send />} onClick={onResend}>Resend link</Button>
          : <Button size="md" variant="secondary" icon={<Clock />} onClick={onChange}>Change time</Button>}
        <Button size="md" variant="quiet" className="col-span-2 sm:col-span-1" onClick={onCancel}>Cancel {WORD[trip.direction]}</Button>
      </div>
    </div>
  )
}

type Sheet = { kind: 'otw' | 'late' | 'cancel' | 'else' | 'resend'; direction: Direction } | null

function ChildCard({ child, trips, nowMs, meId }: { child: ChildRow; trips: Trip[]; nowMs: number; meId: string | null }) {
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
  const school = programme ? runsOn(programme, today.date, new Set()) : false

  const usual = (d: Direction) => {
    if (regular) return { value: formatTime(toMinutes((d === 'pickup' ? regular.pickup : regular.dropoff).slice(0, 5))), detail: 'Regular time' }
    if (!programme) return { value: 'Not set', detail: 'No programme yet' }
    const w = windowFor(programme, d)
    return programme.windows === 'flexible' ? { value: d === 'pickup' ? `By ${formatTime(programme.hours.to)}` : `From ${formatTime(programme.hours.from)}`, detail: 'Any time in the hours' }
      : { value: formatTime(w.from), detail: `Window ${formatRange(w)}` }
  }
  // Drop-off first; after it (or once its time has clearly passed) the pickup.
  const dropoffOver = programme ? today.minutes > (programme.windows === 'flexible' ? programme.hours.from + 180 : windowFor(programme, 'dropoff').to + 30) : true
  const next: Direction | null = !school || pickDone ? null : !dropDone && !dropoffOver ? 'dropoff' : 'pickup'

  const status = open ? null : pickDone ? <Pill icon={<House />}>Home time</Pill> : dropDone ? <Pill tone="live" icon={<School />}>At school</Pill> : null
  const drop = usual('dropoff')
  const pick = usual('pickup')

  return (
    <li className="card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <Avatar name={first} color={childColor(child.id)} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-h2">{first}</h2>
          <p className="truncate text-small font-semibold text-ink-2">{[row?.name, child.classes?.name].filter(Boolean).join(' · ') || 'No programme yet'}</p>
        </div>
        {status}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {dropDone ? <Tile done icon={<Sunrise />} label="Drop-off" value={clockTime(dropDone.closed_at!)} detail="Checked in" />
          : <Tile icon={<Sunrise />} label="Drop-off" value={drop.value} detail={drop.detail} />}
        {pickDone ? <Tile done icon={<House />} label="Pickup" value={clockTime(pickDone.closed_at!)} detail={pickDone.traveller_kind === 'third_person' ? `By ${pickDone.traveller_name.split(' ')[0]}` : 'Collected'} />
          : <Tile icon={<House />} label="Pickup" value={pick.value} detail={pick.detail} />}
      </div>

      {/* The way home with the person who collected (TRK-7): until they say they're home, at most an hour. */}
      {pickDone?.traveller_kind === 'third_person' && !pickDone.home_at && nowMs - Date.parse(pickDone.closed_at!) < 60 * 60_000 && (
        <TravellerPosition trip={pickDone} who={pickDone.traveller_name.split(' ')[0]!} />
      )}
      {open && programme ? (
        <TripBlock trip={open} first={first} meId={meId}
          onResend={() => setSheet({ kind: 'resend', direction: open.direction })}
          onLate={() => setSheet({ kind: 'late', direction: open.direction })}
          onChange={() => setSheet({ kind: 'otw', direction: open.direction })}
          onCancel={() => setSheet({ kind: 'cancel', direction: open.direction })} />
      ) : next && programme ? (
        <div className="mt-4">
          <Button size="xl" className="w-full" icon={<Navigation />} onClick={() => setSheet({ kind: 'otw', direction: next })}>I'm on my way</Button>
          <p className="mt-2 text-center text-caption font-semibold text-ink-3">For {first}'s {WORD[next]}, {next === 'pickup' ? pick.detail.toLowerCase() : drop.detail.toLowerCase()}</p>
          {next === 'pickup' && <Button size="md" variant="secondary" className="mt-3 w-full" icon={<Users />} onClick={() => setSheet({ kind: 'else', direction: 'pickup' })}>Someone else is collecting</Button>}
        </div>
      ) : (
        <p className="mt-4 text-body text-ink-2">{!school ? `No school for ${first} today.` : 'All done for today.'}</p>
      )}

      {programme && sheet?.kind === 'otw' && (
        <OnMyWaySheet open onClose={() => setSheet(null)} childId={child.id} first={first} direction={sheet.direction} programme={programme} trip={open} nowMs={nowMs} />
      )}
      {programme && open && sheet?.kind === 'late' && <LateSheet open onClose={() => setSheet(null)} trip={open} first={first} programme={programme} nowMs={nowMs} />}
      {open && sheet?.kind === 'cancel' && <CancelSheet open onClose={() => setSheet(null)} trip={open} first={first} />}
      {programme && sheet?.kind === 'else' && <SomeoneElseSheet open onClose={() => setSheet(null)} childId={child.id} first={first} programme={programme} nowMs={nowMs} />}
      {open && sheet?.kind === 'resend' && <ResendSheet open onClose={() => setSheet(null)} trip={open} first={first} nowMs={nowMs} />}
    </li>
  )
}

const greeting = (minutes: number) => (minutes < 12 * 60 ? 'Good morning' : minutes < 17 * 60 ? 'Good afternoon' : 'Good evening')

/** The parent's Today (J1–J3): each child's drop-off and pickup, "I'm on my way", and the trip's progress live. */
export function ParentToday() {
  const { state } = useSession()
  const me = state.status === 'signed-in' ? state.me : null
  const children = useMyChildren(me?.profile_id ?? null)
  const trips = useTodayTrips()
  const nowMs = useNow(15_000)
  const clock = indiaClock(new Date(nowMs))
  const date = new Date(nowMs).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })
  const loadError = children.error || trips.error

  return (
    <AreaShell area="parent" title={`${greeting(clock.minutes)}, ${me?.full_name.split(' ')[0] ?? ''}`} subtitle={date}>
      <section className="mt-6" aria-busy={!children.rows}>
        {loadError ? (
          <ErrorState title="Couldn't load today" onRetry={() => { children.reload(); void trips.reload() }}>Check your connection and try again.</ErrorState>
        ) : !children.rows || !trips.trips ? (
          <ul className="grid gap-4 md:grid-cols-2" aria-label="Loading">{[0, 1].map((i) => <li key={i} className="card h-[300px] animate-pulse rounded-2xl" />)}</ul>
        ) : children.rows.length === 0 ? (
          <EmptyState title="No children yet">No children are linked to your account yet. Please contact the school.</EmptyState>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {children.rows.map((c) => <ChildCard key={c.id} child={c} trips={trips.trips!} nowMs={nowMs} meId={me?.profile_id ?? null} />)}
          </ul>
        )}
      </section>
    </AreaShell>
  )
}
