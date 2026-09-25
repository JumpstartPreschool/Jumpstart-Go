import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { AudioLines, BellOff, CircleCheck, Delete, KeyRound, LogOut, Phone, ShieldAlert, Timer, TriangleAlert, UserCheck } from '../ui/icons'
import { Button } from '../ui/Button'
import { Logo } from '../ui/Logo'
import { FreshnessBadge } from '../ui/FreshnessBadge'
import { Sheet } from '../ui/Sheet'
import { childColor } from '../ui/childColor'
import { PreviewRibbon } from './PreviewShell'
import { GATE_ROWS, SAMPLE_CODE, SAMPLE_PROGRESS_INDEX, SAMPLE_ROUTE, SCHOOL, type GateRow } from './sample'

const TripMap = lazy(() => import('../ui/TripMap'))

const SECTIONS: Array<{ key: GateRow['section']; title: string; color: string }> = [
  { key: 'attention', title: 'Needs attention', color: 'var(--warning)' },
  { key: 'arriving', title: 'Arriving next', color: 'var(--accent-ink)' },
  { key: 'upcoming', title: 'Coming up', color: 'var(--ink-2)' },
  { key: 'done', title: 'Done today', color: 'var(--live)' },
]
// Sample children are keyed by first name; real ones by id, so each child keeps one colour everywhere.
const colorFor = (row: GateRow) => childColor(row.child.split(' ')[0]!.toLowerCase())
const DIGIT_COLORS = ['var(--rb-red)', 'var(--rb-orange)', 'var(--rb-green)', 'var(--rb-blue)']

function useWide() {
  const q = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

/** The row's one main button is always the next valid step (feature-specification §1). */
function nextStep(row: GateRow): { label: string; icon: ReactNode } | null {
  if (row.section === 'done') return null
  if (row.flag) return { label: 'Acknowledge', icon: <CircleCheck /> }
  if (!row.ready) return { label: 'Ready', icon: <CircleCheck /> }
  return row.thirdPerson ? { label: 'Enter code', icon: <KeyRound /> } : { label: 'Confirm', icon: <UserCheck /> }
}

function Avatar({ row, size = 'md' }: { row: GateRow; size?: 'md' | 'lg' }) {
  const c = colorFor(row)
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full tracking-[-0.02em] font-bold text-white ring-[3px] ring-white/70 ${size === 'lg' ? 'size-16 text-[28px]' : 'size-12 text-[22px]'}`}
      style={{ background: c }}
      aria-hidden
    >
      {row.child[0]}
    </span>
  )
}

function Chip({ tone, icon, children }: { tone: 'flag' | 'neutral' | 'live'; icon?: ReactNode; children: ReactNode }) {
  const style = tone === 'flag' ? 'bg-warning-soft text-warning' : tone === 'live' ? 'bg-live-soft text-live' : 'bg-sunken text-ink-2'
  return <span className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-extrabold [&_svg]:size-3.5 ${style}`}>{icon}{children}</span>
}

function Row({ row, selected, onSelect }: { row: GateRow; selected: boolean; onSelect: () => void }) {
  const step = nextStep(row)
  const [time, meridiem] = row.time.split(' ')
  return (
    <div className={`card flex items-center gap-3 rounded-2xl p-3.5 pr-4 transition-[box-shadow,transform] duration-200 ${selected ? 'ring-[3px] ring-accent' : ''} ${row.section === 'done' ? 'opacity-70' : ''}`}>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
        <Avatar row={row} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate tracking-[-0.02em] text-[21px] font-bold leading-7">{row.child}</p>
            <p className="shrink-0 text-[14px] font-extrabold tabular-nums text-ink-2">{time} {meridiem}</p>
          </div>
          <p className="truncate text-[14px] font-semibold text-ink-2">{row.doneText ?? `${row.person} · ${row.relation}`} · {row.group}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {row.flag && <Chip tone="flag" icon={<TriangleAlert />}>Off-schedule · {row.flag.note}</Chip>}
            {row.lateMin && <Chip tone="flag" icon={<Timer />}>{row.lateMin} min late</Chip>}
            {row.freshness && <FreshnessBadge state={row.freshness} age={row.ageText} />}
            {row.eta && row.freshness !== 'stale' && <span className="text-[14px] font-extrabold tabular-nums">{row.eta}</span>}
            {row.thirdPerson && row.section !== 'done' && <Chip tone="neutral" icon={<KeyRound />}>Code needed</Chip>}
            {row.ready && <Chip tone="live" icon={<CircleCheck />}>Ready</Chip>}
          </div>
        </div>
      </button>
      {step && (
        <Button size="md" variant={row.section === 'upcoming' ? 'secondary' : 'primary'} icon={step.icon} onClick={onSelect}>
          {step.label}
        </Button>
      )}
    </div>
  )
}

function CodeEntry({ person }: { person: string }) {
  const [digits, setDigits] = useState('')
  const [tries, setTries] = useState(3)
  const [result, setResult] = useState<'idle' | 'wrong' | 'done' | 'locked'>('idle')

  if (result === 'done')
    return (
      <div className="rounded-2xl bg-live-soft p-7 text-center text-live" role="status">
        <img src="/brand/star.webp" alt="" aria-hidden className="float mx-auto size-20" />
        <p className="mt-3 tracking-[-0.02em] text-[26px] font-bold">Handed over to {person}</p>
        <p className="text-[16px] font-bold">12:47 PM · Sneha has been told</p>
      </div>
    )
  if (result === 'locked')
    return (
      <div className="rounded-2xl bg-danger-soft p-7 text-center text-danger" role="alert">
        <ShieldAlert className="mx-auto size-12" aria-hidden />
        <p className="mt-2 tracking-[-0.02em] text-[24px] font-bold">Handover locked after 3 wrong codes</p>
        <p className="text-[16px] font-bold">The parent and the admin have been alerted. Don't release the child.</p>
      </div>
    )

  const press = (d: string) => {
    setResult('idle')
    setDigits((v) => (v.length < 4 ? v + d : v))
  }
  const submit = () => {
    if (digits === SAMPLE_CODE) return setResult('done')
    const left = tries - 1
    setTries(left)
    setDigits('')
    setResult(left === 0 ? 'locked' : 'wrong')
  }

  return (
    <div>
      <p className="tracking-[-0.02em] text-[20px] font-bold">Enter the code {person.split(' ')[0]} shows you</p>
      <div className="mt-3 grid grid-cols-4 gap-3" aria-label={`${digits.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="grid h-20 place-items-center rounded-xl tracking-[-0.02em] text-[44px] font-bold tabular-nums text-ink"
            style={{
              background: digits[i] ? `color-mix(in oklab, ${DIGIT_COLORS[i]} 20%, var(--surface))` : 'var(--sunken)',
              boxShadow: result === 'wrong' ? 'inset 0 0 0 2px var(--danger)' : digits[i] ? `inset 0 0 0 2px color-mix(in oklab, ${DIGIT_COLORS[i]} 45%, transparent)` : 'none',
            }}
          >
            {digits[i] ?? ''}
          </span>
        ))}
      </div>
      {result === 'wrong' && <p className="mt-2 text-[16px] font-extrabold text-danger" role="alert">That code doesn't match · {tries} {tries === 1 ? 'try' : 'tries'} left</p>}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Button key={d} size="xl" variant="secondary" onClick={() => press(d)} className="!h-[68px] tracking-[-0.02em] !text-[28px] tabular-nums">{d}</Button>
        ))}
        <span />
        <Button size="xl" variant="secondary" onClick={() => press('0')} className="!h-[68px] tracking-[-0.02em] !text-[28px]">0</Button>
        <Button size="xl" variant="quiet" aria-label="Delete" icon={<Delete />} className="!h-[68px] !w-full" onClick={() => setDigits((v) => v.slice(0, -1))} />
      </div>
      <Button size="xl" className="mt-4 w-full" icon={<CircleCheck />} disabled={digits.length < 4} onClick={submit}>
        Handed over
      </Button>
      <p className="mt-2 text-center text-[13px] font-semibold text-ink-2">Sample code for this preview: {SAMPLE_CODE}</p>
    </div>
  )
}

function Detail({ row, showHeading }: { row: GateRow; showHeading: boolean }) {
  return (
    <div>
      {showHeading && (
        <div className="flex items-center gap-4">
          <Avatar row={row} size="lg" />
          <div className="min-w-0">
            <p className="text-[14px] font-extrabold uppercase tracking-[0.07em] text-ink-2">{row.direction === 'pickup' ? 'Pickup' : 'Drop-off'} · {row.time}</p>
            <h2 className="truncate text-[32px] font-bold leading-9">{row.child}</h2>
            <p className="text-[15px] font-semibold text-ink-2">{row.group}</p>
          </div>
        </div>
      )}

      {row.freshness && row.section !== 'done' && (
        <div className="relative mt-5 h-60 overflow-hidden rounded-2xl ring-1 ring-line">
          <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-sunken" />}>
            <TripMap className="absolute inset-0" route={SAMPLE_ROUTE} progressIndex={SAMPLE_PROGRESS_INDEX} position={SAMPLE_ROUTE[SAMPLE_PROGRESS_INDEX] ?? null}
              freshness={row.freshness} destination={SCHOOL.position} padding={{ top: 50, bottom: 40, left: 40, right: 40 }} />
          </Suspense>
          <div className="glass absolute left-3 top-3 flex items-center gap-2 rounded-full py-1 pl-1 pr-3.5">
            <FreshnessBadge state={row.freshness} age={row.ageText} />
            {row.eta && row.freshness !== 'stale' && <span className="text-[14px] font-extrabold">{row.eta}</span>}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 rounded-xl bg-sunken p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-rb-teal tracking-[-0.02em] text-[20px] font-bold text-white" aria-hidden>{row.person[0]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-extrabold">{row.person}</p>
          <p className="text-[14px] font-semibold text-ink-2">{row.relation}{row.thirdPerson ? ' · sent by Sneha (Mother)' : ' · registered guardian'}</p>
        </div>
        <Button size="md" variant="secondary" icon={<Phone />}>Call</Button>
      </div>

      <div className="mt-5">
        {row.section === 'done' ? (
          <p className="rounded-xl bg-live-soft p-5 text-[18px] font-extrabold text-live">{row.doneText}</p>
        ) : row.flag ? (
          <div className="rounded-2xl bg-warning-soft p-5">
            <p className="tracking-[-0.02em] text-[20px] font-bold text-warning">Off-schedule pickup · {row.flag.note}</p>
            <p className="mt-1 text-[16px] font-semibold text-ink">Outside the Nursery 360° pickup window. Tap Acknowledge so the school knows you've seen it.</p>
            <Button size="xl" className="mt-4 w-full" icon={<CircleCheck />}>Acknowledge</Button>
          </div>
        ) : row.thirdPerson ? (
          <CodeEntry key={row.id} person={row.person} />
        ) : (
          <div>
            <p className="tracking-[-0.02em] text-[20px] font-bold">Confirm who is collecting {row.child.split(' ')[0]}</p>
            <div className="mt-3 grid gap-3">
              {[`${row.person} · ${row.relation}`, 'Second guardian'].map((g) => (
                <Button key={g} size="xl" variant="secondary" icon={<UserCheck />} className="justify-start">{g}</Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function GateQueue() {
  const wide = useWide()
  const [selectedId, setSelectedId] = useState<string | null>(wide ? 'a' : null)
  const selected = GATE_ROWS.find((r) => r.id === selectedId) ?? null

  return (
    <div className="flex h-dvh flex-col">
      <PreviewRibbon />
      <header className="shrink-0 px-4 pt-[max(44px,calc(env(safe-area-inset-top)+36px))] sm:px-6">
        <div className="glass flex items-center gap-2 rounded-2xl py-3 pl-3 pr-2 sm:gap-4 sm:pl-5 sm:pr-3">
          <Logo className="hidden h-10 sm:block" />
          <span className="flex items-center gap-2.5 rounded-full bg-live-soft py-2 pl-3 pr-4 text-live">
            <span className="relative flex size-3" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-50" />
              <span className="relative inline-flex size-3 rounded-full bg-live" />
            </span>
            <span className="leading-tight">
              <span className="block text-[16px] font-extrabold">Priya · On duty</span>
              <span className="block text-[12px] font-bold opacity-80">Sunflowers, Tulips</span>
            </span>
          </span>
          <div className="relative ml-2 hidden min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-full bg-accent-soft py-2 pl-2 pr-4 xl:flex">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white"><AudioLines className="size-5 animate-pulse" aria-hidden /></span>
            <p className="truncate text-[15px] font-extrabold text-accent-ink">"Aarav Kulkarni's pickup is arriving. Ramesh, grandfather."</p>
          </div>
          <p className="ml-auto text-[24px] font-extrabold leading-none tracking-[-0.03em] tabular-nums sm:text-[32px]">12:44 PM</p>
          <Button size="md" variant="secondary" icon={<BellOff />} aria-label="Mute 5 minutes" />
          <Button size="md" variant="quiet" icon={<LogOut />} aria-label="End duty" />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 px-4 pb-4 pt-4 sm:px-6 lg:grid-cols-[minmax(420px,46%)_1fr]">
        <div className="min-h-0 overflow-y-auto pb-[max(16px,env(safe-area-inset-bottom))]">
          <div className="glass mb-4 flex gap-1 rounded-full p-1.5 text-[15px] font-extrabold" role="tablist">
            <span role="tab" aria-selected="true" className="flex-1 rounded-full bg-accent py-2.5 text-center text-white shadow-[0_3px_0_var(--accent-lip)]">My classes</span>
            <span role="tab" aria-selected="false" className="flex-1 py-2.5 text-center text-ink-2">All classes</span>
          </div>
          {SECTIONS.map((s) => {
            const rows = GATE_ROWS.filter((r) => r.section === s.key)
            return (
              <section key={s.key} className="mb-5">
                <h2 className="mb-2 flex items-center gap-2 px-2 font-sans text-[13px] font-extrabold uppercase tracking-[0.08em]" style={{ color: s.color }}>
                  <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
                  {s.title} · {rows.length}
                </h2>
                <div className="grid grid-cols-1 gap-3">
                  {rows.map((r) => <Row key={r.id} row={r} selected={r.id === selectedId} onSelect={() => setSelectedId(r.id)} />)}
                </div>
              </section>
            )
          })}
        </div>

        {wide ? (
          <aside className="card min-h-0 overflow-y-auto rounded-2xl p-6 xl:p-8">
            {selected ? <Detail row={selected} showHeading /> : <p className="text-ink-2">Choose a child to see the details.</p>}
          </aside>
        ) : (
          <Sheet open={!!selected} onClose={() => setSelectedId(null)} title={selected ? `${selected.child} · ${selected.time}` : ''} wide>
            {selected && <Detail row={selected} showHeading={false} />}
          </Sheet>
        )}
      </div>
    </div>
  )
}
