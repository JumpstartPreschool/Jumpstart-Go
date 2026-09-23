import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, CircleCheck, KeyRound, Phone, XCircle } from 'lucide-react'
import type { Freshness } from '../domain/freshness'
import { Button } from '../ui/Button'
import { FreshnessBadge } from '../ui/FreshnessBadge'
import { PreviewRibbon } from './PreviewShell'
import { SAMPLE_CODE, SAMPLE_PROGRESS_INDEX, SAMPLE_ROUTE, SAMPLE_TIMELINE, SCHOOL } from './sample'

const TripMap = lazy(() => import('../ui/TripMap'))

const STEPS = ['Requested', 'Confirmed', 'On the way', 'Arriving', 'Handed over', 'Home'] as const
const CURRENT_STEP = 2

const AGE: Record<Freshness, string | undefined> = { live: undefined, recent: '32s', stale: '4 min', unavailable: undefined }

export function LiveTrip() {
  const [freshness, setFreshness] = useState<Freshness>('live')
  const [expanded, setExpanded] = useState(false)
  const position = SAMPLE_ROUTE[SAMPLE_PROGRESS_INDEX] ?? null
  const showEta = freshness === 'live' || freshness === 'recent'

  return (
    <div className="fixed inset-0 overflow-hidden bg-sunken">
      <PreviewRibbon />
      <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-sunken" />}>
        <TripMap
          className="absolute inset-0"
          route={SAMPLE_ROUTE}
          progressIndex={SAMPLE_PROGRESS_INDEX}
          position={position}
          freshness={freshness}
          destination={SCHOOL.position}
          padding={{ top: 120, bottom: Math.round(window.innerHeight * 0.5), left: 40, right: 40 }}
        />
      </Suspense>

      <header className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-4 pt-[max(48px,calc(env(safe-area-inset-top)+40px))]">
        <Link to="/preview/parent" aria-label="Back to Today" className="glass grid size-11 place-items-center rounded-full text-ink transition-transform duration-200 ease-spring active:scale-90">
          <ChevronLeft className="size-6" aria-hidden />
        </Link>
        <div className="glass rounded-full px-4 py-2 text-[15px] font-semibold">Aarav's pickup</div>
      </header>

      {/* Preview only: switch the location state to review each design. */}
      <div className="glass absolute left-1/2 top-[max(104px,calc(env(safe-area-inset-top)+96px))] z-10 flex -translate-x-1/2 gap-1 rounded-full p-1" role="radiogroup" aria-label="Preview location state">
        {(['live', 'recent', 'stale', 'unavailable'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={freshness === f}
            onClick={() => setFreshness(f)}
            className={`h-8 rounded-full px-3 text-[12px] font-semibold capitalize ${freshness === f ? 'bg-ink text-canvas' : 'text-ink-2'}`}
          >
            {f}
          </button>
        ))}
      </div>

      <section
        className={`glass absolute inset-x-0 bottom-0 z-10 mx-auto max-w-[560px] overflow-y-auto rounded-t-[30px] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2.5 transition-[max-height] duration-300 ease-out ${expanded ? 'max-h-[88dvh]' : 'max-h-[52dvh]'}`}
        aria-label="Trip details"
      >
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mx-auto block h-6 w-16" aria-label={expanded ? 'Show less' : 'Show the timeline'}>
          <span className="mx-auto block h-1.5 w-10 rounded-full bg-line-strong" />
        </button>

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-medium text-ink-2">On the way to school</p>
            {showEta ? (
              <p className="text-[34px] font-semibold leading-10 tabular-nums tracking-[-0.02em]">3–5 min</p>
            ) : (
              <p className="mt-1 text-[22px] font-semibold leading-7">{freshness === 'stale' ? 'Location not updating' : 'Location not shared'}</p>
            )}
          </div>
          <FreshnessBadge state={freshness} age={AGE[freshness]} className="mt-1 shrink-0" />
        </div>
        <p className="mt-1 text-[14px] leading-5 text-ink-2">
          {freshness === 'stale'
            ? "Ramesh's phone stopped sending its location 4 minutes ago. The ETA is hidden until it's back, and we'll alert you if it doesn't return."
            : freshness === 'unavailable'
              ? "Ramesh chose not to share his location. You'll still be told the moment Aarav is handed over."
              : 'Estimate · no live traffic'}
        </p>

        <ol className="mt-5 grid grid-cols-6 gap-1" aria-label="Trip progress">
          {STEPS.map((step, i) => (
            <li key={step} className="flex flex-col items-center gap-1.5 text-center" aria-current={i === CURRENT_STEP ? 'step' : undefined}>
              <span className={`h-1.5 w-full rounded-full ${i <= CURRENT_STEP ? 'bg-accent' : 'bg-line-strong'}`} />
              <span className={`text-[11px] font-semibold leading-3.5 ${i === CURRENT_STEP ? 'text-accent' : i < CURRENT_STEP ? 'text-ink' : 'text-ink-3'}`}>{step}</span>
            </li>
          ))}
        </ol>

        <p className="mt-4 flex items-center gap-2 rounded-[14px] bg-live-soft px-3.5 py-2.5 text-[15px] font-semibold text-live">
          <CircleCheck className="size-5" aria-hidden /> Aarav is ready at the gate
        </p>

        <div className="mt-4 flex items-center gap-3.5 rounded-[20px] bg-surface p-4 ring-1 ring-line">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-sunken text-[18px] font-bold" aria-hidden>R</span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold">Ramesh Kulkarni</p>
            <p className="text-[14px] text-ink-2">Grandfather · chosen by you</p>
          </div>
          <Button size="md" variant="secondary" icon={<Phone />} aria-label="Call Ramesh">
            Call
          </Button>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-[20px] bg-surface p-4 ring-1 ring-line">
          <div>
            <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-2">
              <KeyRound className="size-4" aria-hidden /> Handoff code
            </p>
            <p className="text-[13px] text-ink-2">Ramesh shows this at the gate</p>
          </div>
          <p className="text-[30px] font-semibold tabular-nums tracking-[0.25em]">{SAMPLE_CODE}</p>
        </div>

        {expanded && (
          <>
            <h3 className="mt-6 text-[17px] font-semibold">Timeline</h3>
            <ol className="mt-2 border-l-2 border-line-strong pl-4">
              {SAMPLE_TIMELINE.map((e) => (
                <li key={e.time + e.text} className="relative py-2">
                  <span className="absolute -left-[23px] top-3.5 size-3 rounded-full bg-accent ring-4 ring-[var(--glass)]" aria-hidden />
                  <p className="text-[13px] font-semibold tabular-nums text-ink-2">{e.time}</p>
                  <p className="text-[15px]">{e.text}</p>
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
