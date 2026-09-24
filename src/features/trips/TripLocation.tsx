import { lazy, Suspense, useEffect, useState } from 'react'
import { FlaskConical, Map as MapIcon, MapPin, MapPinOff, RotateCcw } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Switch } from '../../ui/Switch'
import { FreshnessBadge } from '../../ui/FreshnessBadge'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatAge } from '../../domain/freshness'
import { isDemo } from '../../demo/demo'
import type { Trip } from './api'
import { formatDistance, SCHOOL, type Point, type Position } from './geo'
import { locationHelp, locationPermission, shareLocation, stopSharing, useSendLocation, useSimulatedTrip, useTripPosition, useTripTrail, type LocationPermission } from './tracking'

const TripMap = lazy(() => import('../../ui/TripMap'))

/** "Live · 1.2 km from school", "Last seen 3 min ago, 1.2 km away", or "No location". Never makes old data look live. */
export function PositionLine({ pos, who, simulated }: { pos: Position; who: string; simulated?: boolean }) {
  const age = pos.ageMs !== null ? formatAge(pos.ageMs) : undefined
  const where = pos.away === null ? (pos.point ? 'approximate location' : null) : pos.away < 150 ? 'at the school' : `${formatDistance(pos.away)} from school`
  const text = pos.state === 'unavailable' ? `${who} isn't sharing their location. The gate still knows they're coming.`
    : pos.state === 'live' ? `${who} is ${where}.`
    : `Last seen ${age} ago, ${where}.`
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <FreshnessBadge state={pos.state} age={pos.state === 'unavailable' ? undefined : age} />
      {simulated && pos.state !== 'unavailable' && <span className="inline-flex h-7 items-center gap-1 rounded-full bg-warning-soft px-2.5 text-caption font-bold text-warning"><FlaskConical className="size-3.5" aria-hidden />Simulated</span>}
      <span className={`text-small font-semibold ${pos.state === 'live' ? 'text-ink' : 'text-ink-2'}`}>{text}</span>
    </div>
  )
}

/** Someone else is on the way (the other parent, or the person collecting): where they are, and a map on request. */
export function TravellerPosition({ trip, who }: { trip: Trip; who: string }) {
  const pos = useTripPosition(trip.id, true)
  const [map, setMap] = useState(false)
  const trail = useTripTrail(trip.id, map)
  const at: [number, number] | null = pos.point ? [pos.point.lng, pos.point.lat] : null
  return (
    <div className="mt-4 grid gap-3 rounded-lg bg-sunken p-3.5">
      <PositionLine pos={pos} who={who} />
      {pos.point && (
        map ? (
          <div className="relative h-[260px] overflow-hidden rounded-md ring-1 ring-line md:h-[300px]">
            <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-surface" />}>
              <TripMap className="absolute inset-0" route={trail} progressIndex={Math.max(0, trail.length - 1)} position={at} freshness={pos.state}
                destination={[SCHOOL.lng, SCHOOL.lat]} padding={{ top: 48, bottom: 64, left: 48, right: 48 }} />
            </Suspense>
          </div>
        ) : (
          <Button size="md" variant="secondary" icon={<MapIcon />} className="justify-self-start" onClick={() => setMap(true)}>Show on map</Button>
        )
      )}
    </div>
  )
}

/**
 * The parent on the way shares their own location (TRK-1): off until they turn it on, a short explainer before the
 * browser asks, help if it was refused, and it stops by itself when the trip ends. Keep the page open while it's on.
 */
export function ShareMyLocation({ trip }: { trip: Trip }) {
  const toast = useToast()
  const [perm, setPerm] = useState<LocationPermission | null>(null)
  const [on, setOn] = useState(false)
  const [simulate, setSimulate] = useState(false)
  const [explain, setExplain] = useState(false)
  const [busy, setBusy] = useState(false)
  const send = (points: Point[]) => shareLocation(trip.id, points)
  const { error, lastSent } = useSendLocation(on && !simulate, send)
  useSimulatedTrip(on && simulate, send)
  const pos = useTripPosition(trip.id, on)

  // Carry on after a reload if this phone was already sharing and the browser still allows it.
  useEffect(() => {
    void locationPermission().then((p) => {
      setPerm(p)
      if (p === 'granted' && trip.sharing) setOn(true)
    })
  }, [trip.id, trip.sharing])

  const start = () => { setExplain(false); setSimulate(false); setOn(true) }
  async function toggle(next: boolean) {
    if (next) return perm === 'granted' ? start() : setExplain(true)
    setBusy(true)
    setOn(false)
    setSimulate(false)
    try {
      await stopSharing(trip.id)
      toast('Location sharing is off.')
    } catch {
      toast("Stopped on this phone. The school's copy updates when you're back online.")
    } finally {
      setBusy(false)
    }
  }

  const denied = error === 'denied' || perm === 'denied'
  return (
    <div className="mt-4 rounded-lg bg-sunken p-3.5">
      <div className="flex items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${on ? 'bg-live-soft text-live' : 'bg-surface text-ink-2'}`} aria-hidden>
          {on ? <MapPin className="size-5" /> : <MapPinOff className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-h4">Share my location</p>
          <p className="text-caption font-semibold text-ink-2">{on ? 'The school and your family see you coming. Keep this page open.' : 'Off. Only for this trip, and it stops by itself.'}</p>
        </div>
        <Switch on={on} busy={busy} label="Share my location for this trip" onChange={(v) => void toggle(v)} />
      </div>
      {on && !denied && <div className="mt-3"><PositionLine pos={pos} who="You" simulated={simulate} /></div>}
      {on && lastSent === null && !error && !simulate && <p className="mt-2 text-caption font-semibold text-ink-3">Waiting for your phone's location…</p>}
      {denied && (
        <Notice tone="warning" className="mt-3">
          Location is blocked for this site. {locationHelp()}
          <Button size="md" variant="secondary" icon={<RotateCcw />} className="mt-2.5" onClick={() => { setOn(false); setPerm(null); setTimeout(start, 0) }}>Try again</Button>
        </Notice>
      )}
      {error === 'unavailable' && <Notice tone="info" className="mt-3">Your phone can't find its location right now. It keeps trying; the school still knows you're coming.</Notice>}
      {error === 'unsupported' && <Notice tone="info" className="mt-3">This browser can't share location. The school still knows you're coming.</Notice>}
      {isDemo() && !simulate && (
        <Button size="md" variant="quiet" icon={<FlaskConical />} className="mt-2" onClick={() => { setSimulate(true); setOn(true) }}>Demo: simulate the drive</Button>
      )}

      <Sheet open={explain} onClose={() => setExplain(false)} title="Share your location for this trip?">
        <ul className="grid gap-3 text-body">
          <li className="flex gap-3"><MapPin className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />The coordinators at the gate see how close you are, so your child is ready when you arrive.</li>
          <li className="flex gap-3"><MapPin className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />Your child's other guardians can see it too. Nobody else can.</li>
          <li className="flex gap-3"><MapPin className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />It's only while this trip is open, and it stops by itself at the gate. Points are deleted after 30 days.</li>
        </ul>
        <p className="mt-4 text-small font-semibold text-ink-2">Your browser asks next. Choose Allow.</p>
        <SheetFooter>
          <Button size="xl" className="w-full" icon={<MapPin />} onClick={start}>Allow location</Button>
          <Button variant="quiet" className="mt-2 w-full" onClick={() => setExplain(false)}>Not now</Button>
        </SheetFooter>
      </Sheet>
    </div>
  )
}
