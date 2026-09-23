import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { AudioLines, BellOff, CircleCheck, Delete, KeyRound, LogOut, Phone, ShieldAlert, Timer, TriangleAlert, UserCheck } from 'lucide-react'
import { Button } from '../ui/Button'
import { FreshnessBadge } from '../ui/FreshnessBadge'
import { Sheet } from '../ui/Sheet'
import { PreviewRibbon } from './PreviewShell'
import { GATE_ROWS, SAMPLE_CODE, SAMPLE_PROGRESS_INDEX, SAMPLE_ROUTE, SCHOOL, type GateRow } from './sample'

const TripMap = lazy(() => import('../ui/TripMap'))

const SECTIONS: Array<{ key: GateRow['section']; title: string }> = [
  { key: 'attention', title: 'Needs attention' },
  { key: 'arriving', title: 'Arriving next' },
  { key: 'upcoming', title: 'Coming up' },
  { key: 'done', title: 'Done today' },
]

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
  return row.thirdPerson ? { label: 'Enter code', icon: <KeyRound /> } : { label: 'Confirm guardian', icon: <UserCheck /> }
}

function Row({ row, selected, onSelect }: { row: GateRow; selected: boolean; onSelect: () => void }) {
  const step = nextStep(row)
  const [time, meridiem] = row.time.split(' ')
  return (
    <div
      className={`flex items-center gap-4 rounded-[20px] bg-surface p-4 ring-1 transition-shadow ${selected ? 'ring-2 ring-accent shadow-2' : 'ring-line shadow-1'} ${row.section === 'done' ? 'opacity-70' : ''}`}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <div className="w-16 shrink-0 text-center">
          <p className="text-[20px] font-semibold leading-6 tabular-nums">{time}</p>
          <p className="text-[12px] font-semibold text-ink-2">{meridiem}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[18px] font-semibold leading-6">{row.child}</p>
          <p className="truncate text-[14px] text-ink-2">
            {row.doneText ?? `${row.person} · ${row.relation}`} · {row.group}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {row.flag && (
              <>
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-flag-soft px-2.5 text-[12px] font-bold uppercase tracking-[0.05em] text-flag">
                  <TriangleAlert className="size-3.5" aria-hidden /> Off-schedule
                </span>
                <span className="text-[14px] font-semibold text-flag">{row.flag.note}</span>
              </>
            )}
            {row.lateMin && (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-flag-soft px-2.5 text-[12px] font-bold uppercase tracking-[0.05em] text-flag">
                <Timer className="size-3.5" aria-hidden /> {row.lateMin} min late
              </span>
            )}
            {row.freshness && <FreshnessBadge state={row.freshness} age={row.ageText} />}
            {row.eta && row.freshness !== 'stale' && <span className="text-[14px] font-semibold tabular-nums">{row.eta}</span>}
            {row.thirdPerson && row.section !== 'done' && (
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-sunken px-2.5 text-[12px] font-semibold text-ink-2">
                <KeyRound className="size-3.5" aria-hidden /> Code needed
              </span>
            )}
            {row.ready && <span className="inline-flex h-7 items-center gap-1 rounded-full bg-live-soft px-2.5 text-[12px] font-semibold text-live"><CircleCheck className="size-3.5" aria-hidden /> Ready</span>}
          </div>
        </div>
      </button>
      {step && (
        <Button size="md" variant={row.flag ? 'primary' : row.section === 'upcoming' ? 'secondary' : 'primary'} icon={step.icon} onClick={onSelect}>
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
      <div className="rounded-[20px] bg-live-soft p-6 text-center text-live" role="status">
        <CircleCheck className="mx-auto size-10" aria-hidden />
        <p className="mt-2 text-[22px] font-semibold">Handed over to {person}</p>
        <p className="text-[15px]">12:47 PM · Sneha has been told</p>
      </div>
    )
  if (result === 'locked')
    return (
      <div className="rounded-[20px] bg-danger-soft p-6 text-center text-danger" role="alert">
        <ShieldAlert className="mx-auto size-10" aria-hidden />
        <p className="mt-2 text-[20px] font-semibold">Handover locked after 3 wrong codes</p>
        <p className="text-[15px]">The parent and the admin have been alerted. Don't release the child.</p>
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
      <p className="text-[17px] font-semibold">Enter the code {person.split(' ')[0]} shows you</p>
      <div className="mt-3 flex gap-3" aria-label={`${digits.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`grid h-16 flex-1 place-items-center rounded-[16px] text-[30px] font-semibold tabular-nums ring-1 ${digits[i] ? 'bg-surface ring-accent' : 'bg-sunken ring-line'} ${result === 'wrong' ? 'ring-danger' : ''}`}>
            {digits[i] ?? ''}
          </span>
        ))}
      </div>
      {result === 'wrong' && <p className="mt-2 text-[15px] font-semibold text-danger" role="alert">That code doesn't match · {tries} {tries === 1 ? 'try' : 'tries'} left</p>}
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Button key={d} size="xl" variant="secondary" onClick={() => press(d)} className="!text-[24px] tabular-nums">{d}</Button>
        ))}
        <span />
        <Button size="xl" variant="secondary" onClick={() => press('0')} className="!text-[24px]">0</Button>
        <Button size="xl" variant="quiet" aria-label="Delete" icon={<Delete />} onClick={() => setDigits((v) => v.slice(0, -1))} />
      </div>
      <Button size="xl" className="mt-4 w-full" icon={<CircleCheck />} disabled={digits.length < 4} onClick={submit}>
        Handed over
      </Button>
      <p className="mt-2 text-center text-[13px] text-ink-2">Sample code for this preview: {SAMPLE_CODE}</p>
    </div>
  )
}

function Detail({ row }: { row: GateRow }) {
  return (
    <div>
      <p className="text-[14px] font-semibold text-ink-2">{row.direction === 'pickup' ? 'Pickup' : 'Drop-off'} · {row.time}</p>
      <h2 className="text-[28px] font-semibold leading-9 tracking-[-0.02em]">{row.child}</h2>
      <p className="text-[15px] text-ink-2">{row.group}</p>

      {row.freshness && row.section !== 'done' && (
        <div className="relative mt-4 h-60 overflow-hidden rounded-[20px] ring-1 ring-line">
          <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-sunken" />}>
            <TripMap className="absolute inset-0" route={SAMPLE_ROUTE} progressIndex={SAMPLE_PROGRESS_INDEX} position={SAMPLE_ROUTE[SAMPLE_PROGRESS_INDEX] ?? null}
              freshness={row.freshness} destination={SCHOOL.position} padding={{ top: 40, bottom: 40, left: 40, right: 40 }} />
          </Suspense>
          <div className="glass absolute left-3 top-3 flex items-center gap-2 rounded-full py-1 pl-1 pr-3">
            <FreshnessBadge state={row.freshness} age={row.ageText} />
            {row.eta && row.freshness !== 'stale' && <span className="text-[14px] font-semibold">{row.eta}</span>}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3.5 rounded-[20px] bg-surface p-4 ring-1 ring-line">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-sunken text-[18px] font-bold" aria-hidden>{row.person[0]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold">{row.person}</p>
          <p className="text-[14px] text-ink-2">{row.relation}{row.thirdPerson ? ' · sent by Sneha (Mother)' : ' · registered guardian'}</p>
        </div>
        <Button size="md" variant="secondary" icon={<Phone />}>Call</Button>
      </div>

      <div className="mt-5">
        {row.section === 'done' ? (
          <p className="rounded-[18px] bg-live-soft p-4 text-[17px] font-semibold text-live">{row.doneText}</p>
        ) : row.flag ? (
          <div className="rounded-[20px] bg-flag-soft p-5">
            <p className="text-[17px] font-semibold text-flag">Off-schedule pickup · {row.flag.note}</p>
            <p className="mt-1 text-[15px] text-ink">Outside the Nursery 360° pickup window. Tap Acknowledge so the school knows you've seen it.</p>
            <Button size="xl" className="mt-4 w-full" icon={<CircleCheck />}>Acknowledge</Button>
          </div>
        ) : row.thirdPerson ? (
          <CodeEntry key={row.id} person={row.person} />
        ) : (
          <div>
            <p className="text-[17px] font-semibold">Confirm who is collecting {row.child.split(' ')[0]}</p>
            <div className="mt-3 grid gap-2.5">
              {[row.person, 'Second guardian'].map((g) => (
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
    <div className="flex h-dvh flex-col bg-canvas">
      <PreviewRibbon />
      <header className="shrink-0 px-4 pt-[max(44px,calc(env(safe-area-inset-top)+36px))] sm:px-6">
        <div className="glass flex items-center gap-4 rounded-[22px] py-2.5 pl-5 pr-2.5">
          <span className="relative flex size-3" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-40" />
            <span className="relative inline-flex size-3 rounded-full bg-live" />
          </span>
          <div className="leading-tight">
            <p className="text-[17px] font-semibold">Priya · On duty</p>
            <p className="text-[13px] text-ink-2">Sunflowers, Tulips · since 8:55 AM</p>
          </div>
          <div className="ml-4 hidden min-w-0 flex-1 items-center gap-2.5 rounded-full bg-accent/10 px-4 py-2 text-accent lg:flex">
            <AudioLines className="size-5 shrink-0 animate-pulse" aria-hidden />
            <p className="truncate text-[15px] font-semibold">"Aarav Kulkarni's pickup is arriving. Ramesh, grandfather."</p>
          </div>
          <p className="ml-auto text-[26px] font-semibold tabular-nums tracking-[-0.02em]">12:44 PM</p>
          <Button size="md" variant="quiet" icon={<BellOff />}>Mute</Button>
          <Button size="md" variant="quiet" icon={<LogOut />}>End</Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 px-4 pb-4 pt-4 sm:px-6 lg:grid-cols-[minmax(400px,44%)_1fr]">
        <div className="min-h-0 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <div className="mb-3 flex gap-1 rounded-full bg-sunken p-1 text-[14px] font-semibold" role="tablist">
            <span role="tab" aria-selected="true" className="flex-1 rounded-full bg-surface py-2 text-center shadow-1">My classes</span>
            <span role="tab" aria-selected="false" className="flex-1 py-2 text-center text-ink-2">All classes</span>
          </div>
          {SECTIONS.map((s) => {
            const rows = GATE_ROWS.filter((r) => r.section === s.key)
            return (
              <section key={s.key} className="mb-5">
                <h2 className={`mb-2 px-1 text-[13px] font-bold uppercase tracking-[0.07em] ${s.key === 'attention' ? 'text-flag' : 'text-ink-2'}`}>
                  {s.title} · {rows.length}
                </h2>
                <div className="grid grid-cols-1 gap-2.5">
                  {rows.map((r) => <Row key={r.id} row={r} selected={r.id === selectedId} onSelect={() => setSelectedId(r.id)} />)}
                </div>
              </section>
            )
          })}
        </div>

        {wide ? (
          <aside className="min-h-0 overflow-y-auto rounded-[26px] bg-surface p-6 shadow-1 ring-1 ring-line">
            {selected ? <Detail row={selected} /> : <p className="text-ink-2">Choose a child to see the details.</p>}
          </aside>
        ) : (
          <Sheet open={!!selected} onClose={() => setSelectedId(null)} title={selected?.child ?? ''} wide>
            {selected && <Detail row={selected} />}
          </Sheet>
        )}
      </div>
    </div>
  )
}
