import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BellRing, CircleCheck, DoorOpen, Eye, Headset, House, KeyRound, Lock, MapPin, Navigation, Phone, RotateCcw, School, TriangleAlert, UserCheck } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { FreshnessBadge } from '../../ui/FreshnessBadge'
import { Pill } from '../../ui/Pill'
import { Sheet } from '../../ui/Sheet'
import { ErrorState, Notice, SkeletonList } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { childColor } from '../../ui/childColor'
import { useNow } from '../../ui/hooks'
import { supabase } from '../../lib/supabase'
import { onTableChange } from '../../lib/live'
import { useSession } from '../auth/session'
import { explainTripError, gateStep, useTodayTrips, type GateStep, type Trip } from '../trips/api'
import { clockTime } from '../trips/rules'
import { formatDistance, positionOf, type Position } from '../trips/geo'
import { formatMobile } from '../../domain/contact'
import { useLatestPoints } from '../trips/tracking'
import { formatAge } from '../../domain/freshness'
import { CodeSheet } from './CodeSheet'
import { ExpectedLists } from './GateExtras'
import { Tabs } from '../../ui/Tabs'
import { CallSheet } from '../school/CallSheet'
import { useSchoolDay } from '../school/useSchoolDay'
import { PRIORITY, type Announcer } from './announcer'
import { cancelledText, shouldAnnounce, spokenText, type GateChild } from './gate'

interface Guardian { id: string; name: string; relation: string; active: boolean; kind: 'parent' | 'family'; abroad: boolean }
interface GateData { children: Map<string, GateChild & { guardians: Guardian[] }>; myClasses: Set<string>; covered: Set<string> }

/** The children, their guardians and who covers which class: everything the gate needs besides the trips. */
function useGateData() {
  const { state } = useSession()
  const myId = state.status === 'signed-in' ? state.me?.profile_id : undefined
  const [data, setData] = useState<GateData | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    const [kids, people, assigned] = await Promise.all([
      supabase.from('children').select('id, full_name, preferred_name, class_id, classes(name), programmes(name), guardianships(guardian_id, relation, kind)').eq('active', true),
      supabase.from('profiles').select('id, full_name, active, abroad'),
      supabase.from('coordinator_classes').select('profile_id, class_id'),
    ])
    if (kids.error || people.error || assigned.error) return setError(true)
    setError(false)
    const names = new Map((people.data ?? []).map((p) => [p.id as string, p as { id: string; full_name: string; active: boolean; abroad: boolean }]))
    type Kid = { id: string; full_name: string; preferred_name: string | null; class_id: string; classes: { name: string } | null; programmes: { name: string } | null; guardianships: Array<{ guardian_id: string; relation: string; kind: 'parent' | 'family' }> }
    const children = new Map(((kids.data ?? []) as unknown as Kid[]).map((c) => [c.id, {
      id: c.id, name: c.preferred_name ?? c.full_name.split(' ')[0]!, fullName: c.full_name, classId: c.class_id,
      className: c.classes?.name ?? '', programmeName: c.programmes?.name ?? '',
      guardians: c.guardianships.map((g) => ({ id: g.guardian_id, name: names.get(g.guardian_id)?.full_name ?? 'Guardian', relation: g.relation, active: names.get(g.guardian_id)?.active ?? false, kind: g.kind ?? 'parent', abroad: names.get(g.guardian_id)?.abroad ?? false })),
    }]))
    const rows = (assigned.data ?? []) as Array<{ profile_id: string; class_id: string }>
    setData({ children, myClasses: new Set(rows.filter((r) => r.profile_id === myId).map((r) => r.class_id)), covered: new Set(rows.map((r) => r.class_id)) })
  }, [myId])
  useEffect(() => {
    void load()
    const stops = ['children', 'guardianships', 'coordinator_classes'].map((t) => onTableChange(t, () => void load()))
    return () => stops.forEach((s) => s())
  }, [load])
  return { data, error, reload: load }
}

/** What the gate does next with a trip. */
function nextStep(t: Trip): { step: GateStep | 'handover'; label: string; icon: ReactNode } {
  if (t.off_schedule && !t.acknowledged_at) return { step: 'acknowledge', label: 'Acknowledge', icon: <Eye /> }
  if (t.direction === 'dropoff') return { step: 'close', label: 'Check in', icon: <DoorOpen /> }
  if (!t.ready_at) return { step: 'ready', label: 'Ready', icon: <CircleCheck /> }
  return t.traveller_kind === 'third_person' ? { step: 'handover', label: 'Enter code', icon: <KeyRound /> } : { step: 'handover', label: 'Hand over', icon: <UserCheck /> }
}

const relationName = (t: Trip) => [t.traveller_relation, t.traveller_name.split(' ')[0]].filter(Boolean).join(', ')

/** "1.2 km away" or "At the gate": straight-line, never a time (no route or traffic). */
const awayText = (p: Position) => (p.away === null ? 'Approximate' : p.away < 150 ? 'At the school' : `${formatDistance(p.away)} away`)

/**
 * The live gate queue on the coordinator's iPad (J4, J5, ANN-1): today's drop-offs and pickups as they come in,
 * announced aloud, with the steps at the gate. Handover goes only to a registered guardian (D4), checked by the server.
 */
export function GateQueue({ announcer }: { announcer: Announcer }) {
  const toast = useToast()
  const trips = useTodayTrips()
  const gate = useGateData()
  const nowMs = useNow(5_000)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [handover, setHandover] = useState<Trip | null>(null)
  const [codeFor, setCodeFor] = useState<Trip | null>(null)
  const [locked, setLocked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const school = useSchoolDay()
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [calling, setCalling] = useState(false)
  const cancelHeard = useRef(new Set<string>())
  const announced = useRef(new Map<string, string>())

  // Your classes (and any class nobody covers), or the whole school. Announcements follow their own rule (shouldAnnounce).
  const inScope = (childId: string) => {
    const c = gate.data?.children.get(childId)
    return scope === 'all' || !c || gate.data!.myClasses.has(c.classId) || !gate.data!.covered.has(c.classId)
  }
  const sections = useMemo(() => {
    const all = (trips.trips ?? []).filter((t) => inScope(t.child_id))
    const open = all.filter((t) => t.status === 'en_route')
    return {
      attention: open.filter((t) => t.off_schedule && !t.acknowledged_at),
      coming: open.filter((t) => !(t.off_schedule && !t.acknowledged_at)),
      done: all.filter((t) => t.status !== 'en_route').sort((a, b) => Date.parse(b.closed_at ?? b.updated_at) - Date.parse(a.closed_at ?? a.updated_at)),
    }
  }, [trips.trips, scope, gate.data])

  // Where people on the way are (only while the trip is open; staff never see points after the handover).
  const points = useLatestPoints((trips.trips ?? []).filter((t) => t.status === 'en_route').map((t) => t.id))
  const posOf = (t: Trip) => positionOf(points.get(t.id), nowMs)

  // Announcements follow the trips: new or changed ones play (the class's own coordinators first); seen ones stop repeating.
  useEffect(() => {
    if (!trips.trips || !gate.data) return
    for (const t of trips.trips) {
      const child = gate.data.children.get(t.child_id)
      if (!child) continue
      const id = `trip:${t.id}`
      if (t.status === 'en_route' && shouldAnnounce(t, child.classId, gate.data.myClasses, gate.data.covered, nowMs)) {
        // Once per version of the trip; the announcer itself repeats it every 2 minutes until someone acknowledges.
        if (announced.current.get(t.id) !== t.updated_at) {
          announced.current.set(t.id, t.updated_at)
          announcer.announce({ id, text: spokenText(t, child), chime: t.off_schedule ? 'flagged' : 'normal', priority: t.off_schedule ? PRIORITY.flagged : PRIORITY.newRequest })
        }
      } else if (announced.current.has(t.id)) {
        announced.current.delete(t.id)
        announcer.acknowledge(id)
      }
      // A cancellation is said once, if it happened in the last 10 minutes.
      if (t.status === 'cancelled' && nowMs - Date.parse(t.updated_at) < 10 * 60_000 && !cancelHeard.current.has(t.id)) {
        cancelHeard.current.add(t.id)
        announcer.announce({ id: `${id}:cancel`, text: cancelledText(t, child), chime: 'normal', priority: PRIORITY.info })
        setTimeout(() => announcer.acknowledge(`${id}:cancel`), 30_000)
      }
    }
  }, [trips.trips, gate.data, nowMs, announcer])

  async function act(t: Trip, step: GateStep, handedTo?: string) {
    setBusy(t.id)
    setError(null)
    try {
      await gateStep(t.id, step, handedTo)
      await trips.reload()
      const child = gate.data?.children.get(t.child_id)
      const name = child?.name ?? 'The child'
      toast(step === 'acknowledge' ? `Seen: ${name}'s ${t.direction === 'pickup' ? 'pickup' : 'drop-off'}.`
        : step === 'ready' ? `${name} is ready. The parent has been told.`
        : t.direction === 'pickup' ? `${name} handed over.` : `${name} checked in.`)
      if (step === 'close') setHandover(null)
    } catch (e) {
      setError(explainTripError(e as { code?: string; message?: string }))
    } finally {
      setBusy(null)
    }
  }

  const openHandover = (t: Trip) => (t.traveller_kind === 'third_person' ? setCodeFor(t) : setHandover(t))
  const doNext = (t: Trip) => {
    const n = nextStep(t)
    if (n.step === 'handover') return openHandover(t)
    void act(t, n.step)
  }

  if (trips.error || gate.error) {
    return <ErrorState title="Couldn't load the queue" onRetry={() => { void trips.reload(); void gate.reload() }}>Check the iPad's connection. Announcements pause until it's back.</ErrorState>
  }
  if (!trips.trips || !gate.data) return <SkeletonList count={3} className="grid gap-3" />

  const children = gate.data.children
  const selected = trips.trips.find((t) => t.id === picked) ?? sections.attention[0] ?? sections.coming[0] ?? null

  const Row = ({ t }: { t: Trip }) => {
    const c = children.get(t.child_id)
    const done = t.status !== 'en_route'
    const n = done ? null : nextStep(t)
    const mine = c ? gate.data!.myClasses.has(c.classId) : false
    const pos = done ? null : posOf(t)
    return (
      <li>
        <div className={`card flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl p-3 pr-3.5 transition-shadow duration-200 ${selected?.id === t.id ? 'shadow-[0_0_0_2px_var(--accent),var(--shadow-card)]' : ''} ${done ? 'opacity-70' : ''}`}>
          <button type="button" className="flex min-w-0 flex-1 basis-[200px] items-center gap-3 text-left" onClick={() => setPicked(t.id)} aria-label={`${c?.fullName ?? 'Child'}: details`}>
            <Avatar name={c?.name ?? '?'} color={childColor(t.child_id)} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-h3">{c?.fullName ?? 'Child'}</span>
                <span className="shrink-0 text-small font-bold text-ink-2 tabular-nums">{clockTime(done ? t.closed_at ?? t.updated_at : t.arrive_at)}</span>
              </span>
              <span className="block truncate text-small font-semibold text-ink-2">{t.direction === 'pickup' ? 'Pickup' : 'Drop-off'} · {relationName(t)}{c?.className ? ` · ${c.className}` : ''}</span>
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {t.status === 'handed_over' && <Pill tone="live" icon={<House />}>Handed over</Pill>}
                {t.status === 'checked_in' && <Pill tone="live" icon={<School />}>Checked in</Pill>}
                {t.status === 'cancelled' && <Pill tone="stale">Cancelled</Pill>}
                {!done && t.off_schedule && <Pill tone="warning" icon={<TriangleAlert />}>{t.reason ?? 'Outside the usual time'}</Pill>}
                {!done && t.ready_at && <Pill tone="live" icon={<CircleCheck />}>Ready</Pill>}
                {!done && t.acknowledged_at && !t.ready_at && <Pill icon={<Eye />}>Seen</Pill>}
                {!done && t.traveller_kind === 'third_person' && (locked.has(t.id) ? <Pill tone="danger" icon={<Lock />}>Locked</Pill> : <Pill icon={<KeyRound />}>Code needed</Pill>)}
                {pos && pos.state !== 'unavailable' && <FreshnessBadge state={pos.state} age={pos.ageMs !== null ? formatAge(pos.ageMs) : undefined} />}
                {pos && pos.state !== 'unavailable' && <Pill icon={<MapPin />}>{awayText(pos)}</Pill>}
                {!done && t.phoned_in_by && <Pill icon={<Headset />}>Phoned in</Pill>}
                {!done && !mine && (c && !gate.data!.covered.has(c.classId) ? <Pill tone="warning" icon={<BellRing />}>No coordinator</Pill> : <Pill icon={<BellRing />}>Other class</Pill>)}
              </span>
            </span>
          </button>
          {n && <Button size="md" variant={n.step === 'acknowledge' ? 'sunshine' : 'primary'} icon={n.icon} loading={busy === t.id} onClick={() => doNext(t)}>{n.label}</Button>}
        </div>
      </li>
    )
  }

  const Section = ({ title, icon, list, empty }: { title: string; icon: ReactNode; list: Trip[]; empty?: string }) => (
    <section className="grid gap-2.5">
      <h2 className="kicker flex items-center gap-2 px-0.5 [&_svg]:size-4">{icon}{title} · {list.length}</h2>
      {list.length ? <ul className="grid gap-2.5">{list.map((t) => <Row key={t.id} t={t} />)}</ul>
        : empty ? <p className="rounded-lg bg-sunken px-4 py-3 text-small font-semibold text-ink-2">{empty}</p> : null}
    </section>
  )

  const detailChild = selected ? children.get(selected.child_id) : null

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs id="scope" label="Whose children" value={scope} onChange={setScope}
            items={[{ key: 'mine', label: gate.data.myClasses.size ? 'Your classes' : 'Uncovered classes', icon: <BellRing /> }, { key: 'all', label: 'Whole school', icon: <School /> }]} />
          <Button size="md" variant="secondary" icon={<Phone />} className="ml-auto" disabled={!school.children} onClick={() => setCalling(true)}>Log a call</Button>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        {sections.attention.length > 0 && <Section title="Needs attention" icon={<TriangleAlert />} list={sections.attention} />}
        <Section title="Coming" icon={<Navigation />} list={sections.coming} empty="Nobody is on the way right now. New drop-offs and pickups appear here and are announced." />
        {school.children && <ExpectedLists children={school.children.filter((c) => inScope(c.id))} onDone={() => { school.reload(); void trips.reload() }} />}
        {sections.done.length > 0 && <Section title="Done today" icon={<CircleCheck />} list={sections.done} />}
      </div>

      {/* The chosen trip, side by side on iPad landscape and desktop. */}
      <aside className="card sticky top-[calc(env(safe-area-inset-top)+180px)] hidden rounded-2xl p-6 lg:block" aria-label="Details">
        {selected && detailChild ? (
          <TripDetail trip={selected} child={detailChild} busy={busy === selected.id} pos={posOf(selected)} locked={locked.has(selected.id)} onStep={(s) => (s === 'handover' ? openHandover(selected) : void act(selected, s))} />
        ) : (
          <div className="grid justify-items-center gap-2 py-8 text-center text-body text-ink-2">
            <School className="size-10 text-ink-3" aria-hidden />
            Choose someone in the queue to see the details.
          </div>
        )}
      </aside>

      <Sheet open={!!handover} onClose={() => setHandover(null)} title={handover ? `Hand over ${children.get(handover.child_id)?.name ?? ''}` : 'Hand over'}
        description="Who is collecting? Only the parents and family the school has added are listed. Anyone else needs a link and a code from a parent.">
        {handover && (
          <div className="grid gap-2.5">
            {(['parent', 'family'] as const).map((kind) => {
              const list = (children.get(handover.child_id)?.guardians ?? []).filter((g) => g.active && g.kind === kind)
              return list.length > 0 && (
                <div key={kind} className="grid gap-2.5">
                  <p className="kicker mt-1">{kind === 'parent' ? 'Parents' : 'Family'}</p>
                  {list.map((g) => (
                    <button key={g.id} type="button" className="choice flex items-center gap-3 p-3 text-left" disabled={busy === handover.id} onClick={() => void act(handover, 'close', g.id)}>
                      <Avatar name={g.name} color={kind === 'parent' ? 'var(--rb-blue)' : 'var(--ink-3)'} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-h4">{g.name}</span>
                        <span className="block text-small font-semibold text-ink-2">{g.relation}{g.abroad ? ', lives outside India' : ''}{g.id === handover.created_by ? ", said they're on the way" : ''}</span>
                      </span>
                      <UserCheck className="size-5 text-accent" aria-hidden />
                    </button>
                  ))}
                </div>
              )
            })}
            {error && <Notice tone="danger">{error}</Notice>}
            <Notice tone="warning">Someone not on this list? Don't hand over. Call the parent first.</Notice>
          </div>
        )}
      </Sheet>
      <div className="lg:hidden">
        <Sheet open={!!picked && !!selected && !!detailChild} onClose={() => setPicked(null)} title={detailChild?.fullName ?? 'Details'}>
          {selected && detailChild && <TripDetail trip={selected} child={detailChild} busy={busy === selected.id} pos={posOf(selected)} locked={locked.has(selected.id)} onStep={(s) => { if (s === 'handover') { setPicked(null); openHandover(selected) } else void act(selected, s) }} />}
        </Sheet>
      </div>
      {calling && school.children && <CallSheet open onClose={() => setCalling(false)} children={school.children} nowMs={nowMs} onLogged={() => { school.reload(); void trips.reload() }} />}
      {codeFor && (
        <CodeSheet open onClose={() => setCodeFor(null)} trip={codeFor} childName={children.get(codeFor.child_id)?.name ?? 'the child'}
          onDone={(isLocked) => {
            if (isLocked) return setLocked((l) => new Set(l).add(codeFor.id))
            toast(`Code correct. ${children.get(codeFor.child_id)?.name ?? 'The child'} handed over to ${codeFor.traveller_name.split(' ')[0]}.`)
            setCodeFor(null)
            void trips.reload()
          }} />
      )}
      <Button size="md" variant="quiet" icon={<RotateCcw />} className="justify-self-start lg:col-span-2" onClick={() => { void trips.reload(); void gate.reload() }}>Refresh</Button>
    </div>
  )
}

function TripDetail({ trip, child, busy, pos, locked, onStep }: { trip: Trip; child: GateChild & { guardians: Guardian[] }; busy: boolean; pos: Position; locked: boolean; onStep: (s: GateStep | 'handover') => void }) {
  const third = trip.traveller_kind === 'third_person'
  const who = trip.traveller_name.split(' ')[0]!
  const done = trip.status !== 'en_route'
  const pickup = trip.direction === 'pickup'
  const fact = (label: string, value: string) => (
    <div className="rounded-lg bg-sunken px-3.5 py-2.5">
      <p className="kicker">{label}</p>
      <p className="mt-0.5 text-h4 tabular-nums">{value}</p>
    </div>
  )
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3.5">
        <Avatar name={child.name} color={childColor(child.id)} size="lg" />
        <div className="min-w-0">
          <p className="kicker">{pickup ? 'Pickup' : 'Drop-off'} · {clockTime(trip.arrive_at)}</p>
          <h3 className="truncate text-h2">{child.fullName}</h3>
          <p className="truncate text-small font-semibold text-ink-2">{child.programmeName || child.className}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {fact('Arrives', `about ${clockTime(trip.arrive_at)}`)}
        {fact('Coming', relationName(trip) || trip.traveller_name)}
      </div>
      {!done && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sunken px-3.5 py-2.5">
          <FreshnessBadge state={pos.state} age={pos.ageMs !== null && pos.state !== 'unavailable' ? formatAge(pos.ageMs) : undefined} />
          <span className="text-small font-semibold text-ink-2">{pos.state === 'unavailable' ? 'Not sharing location' : awayText(pos)}</span>
        </div>
      )}
      {third && !done && (
        <Notice tone="info" icon={<KeyRound aria-hidden />}>Sent by a parent: {who} isn't registered with the school. Hand over only with the 4-digit code on {who}'s phone.</Notice>
      )}
      {trip.off_schedule && trip.reason && <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>Outside the usual time: {trip.reason}</Notice>}
      {done ? (
        <Notice tone="success">{trip.status === 'handed_over' ? `Handed over at ${clockTime(trip.closed_at!)}.` : trip.status === 'checked_in' ? `Checked in at ${clockTime(trip.closed_at!)}.` : 'Cancelled by the parent or the school.'}</Notice>
      ) : (
        <div className="grid gap-2.5">
          {!trip.acknowledged_at && <Button variant={trip.off_schedule ? 'sunshine' : 'secondary'} icon={<Eye />} loading={busy} onClick={() => onStep('acknowledge')}>Acknowledge</Button>}
          {pickup && !trip.ready_at && <Button variant="secondary" icon={<CircleCheck />} loading={busy} onClick={() => onStep('ready')}>{child.name} is ready</Button>}
          {locked ? <Notice tone="danger" icon={<Lock aria-hidden />}>Locked after three wrong codes. Call the parent before releasing {child.name}.</Notice>
            : pickup
            ? <Button size="xl" icon={third ? <KeyRound /> : <UserCheck />} loading={busy} onClick={() => onStep('handover')}>{third ? `Enter ${who}'s code` : 'Hand over'}</Button>
            : <Button size="xl" icon={<DoorOpen />} loading={busy} onClick={() => onStep('close')}>Check in {child.name}</Button>}
          {third && trip.traveller_phone && <a className="btn btn--quiet btn--md" href={`tel:${trip.traveller_phone}`}><Phone aria-hidden />Call {who}, {formatMobile(trip.traveller_phone)}</a>}
        </div>
      )}
    </div>
  )
}
