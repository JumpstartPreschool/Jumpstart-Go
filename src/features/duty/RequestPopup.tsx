import { Eye, MapPin, Timer, TriangleAlert } from '../../ui/icons'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { Sheet } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { childColor } from '../../ui/childColor'
import type { Trip } from '../trips/api'
import { clockTime } from '../trips/rules'
import { isLate } from './gate'

/**
 * A new request, popped up the moment this phone announces it, for Center Coordinators and Center Leaders alike: who,
 * for which child, when, and one big Acknowledge. Later hides it here; the announcements keep repeating until someone
 * acknowledges (on any phone).
 */
export function RequestPopup({ trip, child, more, busy, error, onAcknowledge, onLater }: {
  trip: Trip
  child: { name: string; fullName: string; className: string }
  more: number
  busy: boolean
  error: string | null
  onAcknowledge: () => void
  onLater: () => void
}) {
  const arrived = !!trip.arrived_at
  const what = trip.direction === 'pickup' ? 'pickup' : 'drop-off'
  const first = trip.traveller_name.split(' ')[0]
  const who = first && trip.traveller_relation ? `${first} (${trip.traveller_relation.toLowerCase()})` : first || trip.traveller_relation
  const title = arrived ? `At the gate for ${what}` : `New ${what}`
  return (
    <Sheet open onClose={onLater} title={title} description={more > 0 ? `${more} more waiting after this one.` : 'Acknowledge so the gate team knows it is being handled.'}>
      <div className={`grid gap-4 rounded-2xl p-4 sm:p-5 ${arrived || trip.off_schedule ? 'bg-danger-soft' : 'bg-sunken'}`} role="alert">
        <div className="flex items-center gap-4">
          <Avatar name={child.name} color={childColor(trip.child_id)} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-h2">{child.fullName}</p>
            <p className="truncate text-small font-semibold text-ink-2">{child.className || 'Class not set'}</p>
          </div>
        </div>
        <p className="text-h4">
          {who || 'A parent'} {arrived ? 'has arrived' : `is coming, about ${clockTime(trip.arrive_at)}`}
        </p>
        <div className="flex flex-wrap gap-1.5 empty:hidden">
          {arrived && <Pill tone="danger" icon={<MapPin />}>At the gate</Pill>}
          {isLate(trip) && <Pill tone="warning" icon={<Timer />}>Running late · {clockTime(trip.arrive_at)}</Pill>}
          {trip.off_schedule && !isLate(trip) && <Pill tone="warning" icon={<TriangleAlert />}>{trip.reason ?? 'Outside the usual time'}</Pill>}
        </div>
      </div>
      {error && <Notice tone="danger" className="mt-4">{error}</Notice>}
      <div className="mt-5 grid gap-2.5 sm:grid-cols-[1fr_auto]">
        <Button size="xl" variant="sunshine" icon={<Eye />} loading={busy} onClick={onAcknowledge} autoFocus>Acknowledge</Button>
        <Button size="xl" variant="secondary" onClick={onLater}>Later</Button>
      </div>
    </Sheet>
  )
}
