import { CircleSlash, Clock3, History } from './icons'
import type { Freshness } from '../domain/freshness'

const styles: Record<Freshness, string> = {
  live: 'bg-live-soft text-live',
  recent: 'bg-recent-soft text-recent',
  stale: 'bg-stale-soft text-stale',
  unavailable: 'bg-stale-soft text-stale',
}

/**
 * LIVE / RECENT · 32s / STALE · 3 min / UNAVAILABLE (TRK-3). Colour, icon and text together,
 * so the state never depends on colour alone.
 */
export function FreshnessBadge({ state, age, className = '' }: { state: Freshness; age?: string; className?: string }) {
  const label = state === 'live' ? 'Live' : state === 'recent' ? 'Recent' : state === 'stale' ? 'Stale' : 'Unavailable'
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-bold uppercase tracking-[0.07em] ${styles[state]} ${className}`}
      aria-label={age ? `${label}, updated ${age} ago` : label}
    >
      {state === 'live' && (
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-50" />
          <span className="relative inline-flex size-2 rounded-full bg-live" />
        </span>
      )}
      {state === 'recent' && <Clock3 className="size-3.5" aria-hidden />}
      {state === 'stale' && <History className="size-3.5" aria-hidden />}
      {state === 'unavailable' && <CircleSlash className="size-3.5" aria-hidden />}
      {label}
      {age && state !== 'live' && state !== 'unavailable' && <span className="font-semibold normal-case tracking-normal">· {age}</span>}
    </span>
  )
}
