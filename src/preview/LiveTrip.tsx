import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, CircleCheck, Phone, XCircle } from '../ui/icons'
import type { Freshness } from '../domain/freshness'
import { Button } from '../ui/Button'
import { CodeTiles } from '../ui/CodeTiles'
import { FreshnessBadge } from '../ui/FreshnessBadge'
import { PreviewRibbon } from './PreviewShell'
import { SAMPLE_CODE, SAMPLE_PROGRESS_INDEX, SAMPLE_ROUTE, SAMPLE_TIMELINE, SCHOOL } from './sample'

const TripMap = lazy(() => import('../ui/TripMap'))

const STEPS = ['Requested', 'Confirmed', 'On the way', 'Arriving', 'Handed over', 'Home'] as const
const STEP_COLORS = ['var(--rb-red)', 'var(--rb-orange)', 'var(--rb-yellow)', 'var(--rb-green)', 'var(--rb-teal)', 'var(--rb-blue)']
const CURRENT_STEP = 2
const AGE: Record<Freshness, string | undefined> = { live: undefined, recent: '32s', stale: '4 min', unavailable: undefined }

function useWide() {
  const q = '(min-width: 768px)'
  const [wide, setWide] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

export function LiveTrip() {
  const [freshness, setFreshness] = useState<Freshness>('live')
  const [expanded, setExpanded] = useState(false)
  const wide = useWide()
  const position = SAMPLE_ROUTE[SAMPLE_PROGRESS_INDEX] ?? null
  const showEta = freshness === 'live' || freshness === 'recent'
  const showTimeline = wide || expanded

  return (
    <div className="fixed inset-0 overflow-hidden">
      <PreviewRibbon />
      <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-sunken" />}>
        <TripMap
          key={wide ? 'wide' : 'narrow'}
          className="absolute inset-0"
          route={SAMPLE_ROUTE}
          progressIndex={SAMPLE_PROGRESS_INDEX}
          position={position}
          freshness={freshness}
          destination={SCHOOL.position}
          padding={wide ? { top: 140, bottom: 60, left: 480, right: 60 } : { top: 150, bottom: Math.round(window.innerHeight * 0.52), left: 40, right: 40 }}
        />
      </Suspense>

      <header className="absolute left-0 top-0 z-10 flex items-center gap-3 px-4 pt-[max(48px,calc(env(safe-area-inset-top)+36px))] md:px-6">
        <Link to="/preview/parent" aria-label="Back to Today" className="glass grid size-12 place-items-center rounded-full text-ink transition-transform duration-200 ease-spring active:scale-90">
          <ChevronLeft className="size-6" aria-hidden />
        </Link>
        <div className="glass rounded-full px-5 py-2.5 tracking-[-0.02em] text-[18px] font-bold">Aarav's pickup</div>
      </header>

      {/* Preview only: switch the location state to review each design. */}
      <div
        className="glass absolute left-1/2 top-[max(108px,calc(env(safe-area-inset-top)+96px))] z-10 flex -translate-x-1/2 gap-1 rounded-full p-1.5 md:left-auto md:right-6 md:translate-x-0"
        role="radiogroup"
        aria-label="Preview location state"
      >
        {(['live', 'recent', 'stale', 'unavailable'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={freshness === f}
            onClick={() => setFreshness(f)}
            className={`h-9 rounded-full px-3.5 text-[13px] font-extrabold capitalize transition-colors ${freshness === f ? 'bg-ink text-canvas' : 'text-ink-2'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Trip panel: a bottom sheet on phones, a floating side panel on iPad. */}
      <section
        aria-label="Trip details"
        className={`card absolute z-10 overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 transition-[max-height] duration-300 ease-out md:bottom-6 md:left-6 md:top-[max(116px,calc(env(safe-area-inset-top)+104px))] md:w-[420px] md:rounded-2xl md:p-6 ${
          expanded ? 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[34px]' : 'inset-x-0 bottom-0 max-h-[54dvh] rounded-t-[34px]'
        } md:inset-x-auto md:max-h-none`}
      >
        {!wide && (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="mx-auto mb-1 block h-6 w-16" aria-label={expanded ? 'Show less' : 'Show the timeline'}>
            <span className="mx-auto block h-1.5 w-10 rounded-full bg-line-strong" />
          </button>
        )}

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-extrabold uppercase tracking-[0.07em] text-ink-2">On the way to school</p>
            {showEta ? (
              <p className="tracking-[-0.02em] text-[44px] font-bold leading-[48px] tabular-nums">3–5 min</p>
            ) : (
              <p className="mt-1 tracking-[-0.02em] text-[28px] font-bold leading-8">{freshness === 'stale' ? 'Location not updating' : 'Location not shared'}</p>
            )}
          </div>
          <FreshnessBadge state={freshness} age={AGE[freshness]} className="mt-1 shrink-0" />
        </div>
        <p className="mt-1 text-[15px] font-semibold leading-[22px] text-ink-2">
          {freshness === 'stale'
            ? "Ramesh's phone stopped sending its location 4 minutes ago. The ETA is hidden until it's back, and we'll alert you if it doesn't return."
            : freshness === 'unavailable'
              ? "Ramesh chose not to share his location. You'll still be told the moment Aarav is handed over."
              : 'Estimate · no live traffic'}
        </p>

        <ol className="mt-5 grid grid-cols-6 gap-1.5" aria-label="Trip progress">
          {STEPS.map((step, i) => (
            <li key={step} className="flex flex-col items-center gap-1.5 text-center" aria-current={i === CURRENT_STEP ? 'step' : undefined}>
              <span className="h-2 w-full rounded-full" style={{ background: i <= CURRENT_STEP ? STEP_COLORS[i] : 'var(--line-strong)' }} />
              <span className={`text-[11px] font-extrabold leading-3.5 ${i === CURRENT_STEP ? 'text-ink' : i < CURRENT_STEP ? 'text-ink-2' : 'text-ink-3'}`}>{step}</span>
            </li>
          ))}
        </ol>

        <p className="mt-5 flex items-center gap-2.5 rounded-lg bg-live-soft px-4 py-3 text-[16px] font-extrabold text-live">
          <CircleCheck className="size-5" aria-hidden /> Aarav is ready at the gate
        </p>

        <div className="mt-3 flex items-center gap-4 rounded-xl bg-sunken p-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-rb-teal tracking-[-0.02em] text-[24px] font-bold text-white" aria-hidden>R</span>
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-extrabold">Ramesh Kulkarni</p>
            <p className="text-[14px] font-semibold text-ink-2">Grandfather · chosen by you</p>
          </div>
          <Button size="md" variant="secondary" icon={<Phone />} aria-label="Call Ramesh">
            Call
          </Button>
        </div>

        <div className="mt-3 rounded-xl bg-sunken p-4 text-center">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-2">Handoff code · Ramesh shows this at the gate</p>
          <div className="mt-3"><CodeTiles code={SAMPLE_CODE} size="md" /></div>
        </div>

        {showTimeline && (
          <>
            <h3 className="mt-6 text-[20px] font-bold">Timeline</h3>
            <ol className="mt-2 border-l-[3px] border-line-strong pl-5">
              {SAMPLE_TIMELINE.map((e, i) => (
                <li key={e.time + e.text} className="relative py-2">
                  <span className="absolute -left-[29px] top-3.5 size-3.5 rounded-full ring-4 ring-[var(--surface)]" style={{ background: STEP_COLORS[i % STEP_COLORS.length] }} aria-hidden />
                  <p className="text-[13px] font-extrabold tabular-nums text-ink-2">{e.time}</p>
                  <p className="text-[16px] font-semibold">{e.text}</p>
                </li>
              ))}
            </ol>
            <Button variant="danger" className="mt-5 w-full" icon={<XCircle />}>
              Cancel pickup
            </Button>
          </>
        )}
      </section>
    </div>
  )
}
