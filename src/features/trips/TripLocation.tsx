import { lazy, Suspense } from 'react'
import { Lock, MapPinOff, Phone } from '../../ui/icons'
import { Avatar } from '../../ui/Avatar'
import { FreshnessBadge } from '../../ui/FreshnessBadge'
import { formatAge } from '../../domain/freshness'
import { formatMobile } from '../../domain/contact'
import type { Trip } from './api'
import { formatDistance, SCHOOL, type Position } from './geo'
import { useTripPosition, useTripTrail } from './tracking'

const TripMap = lazy(() => import('../../ui/TripMap'))

/** Where they are, in two short lines: "1.2 km away" / "Updated just now". Never makes old data look live. */
function whereText(pos: Position): { headline: string; detail: string } {
  const where = pos.away === null ? 'Nearby' : pos.away < 150 ? 'At the school' : `${formatDistance(pos.away)} away`
  const age = pos.ageMs !== null ? formatAge(pos.ageMs) : null
  if (pos.state === 'live') return { headline: where, detail: 'Updated just now' }
  if (pos.state === 'recent') return { headline: where, detail: `Updated ${age} ago` }
  return { headline: where, detail: `Last seen ${age} ago · phone not sending` }
}

/**
 * Following someone collecting with a one-time link (D38): only the parent who sent the link sees this; the school never
 * does. A live map with the person and the school, how far they are and how fresh that is, and a way to call them.
 * Parents and family never share their own location, so there's nothing like this on their trips.
 */
export function CollectorTracker({ trip, child, afterHandover = false }: { trip: Trip; child: string; afterHandover?: boolean }) {
  const pos = useTripPosition(trip.id, true)
  const trail = useTripTrail(trip.id, !!pos.point)
  const name = trip.traveller_name
  const first = name.split(' ')[0]!
  const at: [number, number] | null = pos.point ? [pos.point.lng, pos.point.lat] : null
  const text = pos.point ? whereText(pos) : null

  return (
    <section aria-label={`Where ${first} is`} className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex items-center gap-3 px-4 py-3.5">
        <Avatar name={name} color="var(--rb-violet)" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-h4 [overflow-wrap:anywhere]">{name}</p>
          <p className="text-small font-semibold text-ink-2">{trip.traveller_relation ?? 'Collecting'} · {afterHandover ? `taking ${child} home` : `collecting ${child}`}</p>
        </div>
        {trip.traveller_phone && (
          <a href={`tel:${trip.traveller_phone}`} className="btn btn--secondary btn--md" aria-label={`Call ${first}, ${formatMobile(trip.traveller_phone)}`}>
            <Phone aria-hidden />Call
          </a>
        )}
      </header>

      {pos.point && text ? (
        <div className="relative h-[300px] overflow-hidden border-y border-line md:h-[360px]">
          <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-sunken" />}>
            <TripMap className="absolute inset-0" route={trail} progressIndex={Math.max(0, trail.length - 1)} position={at} freshness={pos.state}
              destination={[SCHOOL.lng, SCHOOL.lat]} padding={{ top: 84, bottom: 36, left: 36, right: 36 }} />
          </Suspense>
          <div className="glass pointer-events-none absolute left-3 right-3 top-3 flex items-center justify-between gap-3 rounded-lg px-3.5 py-2" aria-live="polite">
            <span className="min-w-0">
              <span className="block text-body font-extrabold tabular-nums">{text.headline}</span>
              <span className="block truncate text-caption font-semibold text-ink-2">{text.detail}</span>
            </span>
            <FreshnessBadge state={pos.state} age={pos.state === 'unavailable' || pos.ageMs === null ? undefined : formatAge(pos.ageMs)} />
          </div>
        </div>
      ) : (
        <div className="grid justify-items-center gap-2 border-y border-line bg-sunken px-5 py-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-surface text-ink-2 ring-1 ring-line" aria-hidden><MapPinOff className="size-6" /></span>
          <p className="text-h4">{afterHandover ? `${first} isn't sharing the way home` : `${first} hasn't shared their location`}</p>
          <p className="max-w-[36ch] text-small font-semibold text-ink-2">
            {afterHandover ? 'You can call them to check.' : 'They can still collect with the code.'}
          </p>
        </div>
      )}

      <footer className="flex items-center gap-1.5 px-4 py-2.5 text-caption font-semibold text-ink-2">
        <Lock className="size-3.5 shrink-0" aria-hidden />Only you can see this. The school can't.
      </footer>
    </section>
  )
}
