import { useEffect, useState, type ReactNode } from 'react'
import { House, School, Sparkles, Sunrise } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'
import { EmptyState, ErrorState, Notice } from '../../ui/States'
import { childColor } from '../../ui/childColor'
import { formatTime, indiaClock, toMinutes } from '../../domain/time'
import { supabase } from '../../lib/supabase'
import { AreaShell } from '../auth/AreaShell'
import type { Area } from '../auth/session'

interface ChildToday {
  id: string
  full_name: string
  preferred_name: string | null
  programmes: { name: string; flexible: boolean; starts: string; ends: string; dropoff_from: string | null; dropoff_to: string | null; pickup_from: string | null; pickup_to: string | null } | null
  classes: { name: string } | null
  child_schedules: Array<{ weekday: number; dropoff: string; pickup: string }>
}

const t = (v: string | null) => (v ? formatTime(toMinutes(v.slice(0, 5))) : 'Not set')

/** Today's drop-off and pickup for a child: their regular times, or the programme's windows until those are set. */
function todayLine(c: ChildToday, weekday: number): { dropoff: string; pickup: string; fromWindows: boolean } {
  const s = c.child_schedules.find((x) => x.weekday === weekday)
  if (s) return { dropoff: t(s.dropoff), pickup: t(s.pickup), fromWindows: false }
  const p = c.programmes
  if (!p) return { dropoff: 'Not set', pickup: 'Not set', fromWindows: true }
  return p.flexible
    ? { dropoff: `From ${t(p.starts)}`, pickup: `By ${t(p.ends)}`, fromWindows: true }
    : { dropoff: `${t(p.dropoff_from)} to ${t(p.dropoff_to)}`, pickup: `${t(p.pickup_from)} to ${t(p.pickup_to)}`, fromWindows: true }
}

const CHILD_FIELDS = 'id, full_name, preferred_name, programmes(name, flexible, starts, ends, dropoff_from, dropoff_to, pickup_from, pickup_to), classes(name), child_schedules(weekday, dropoff, pickup)'

/**
 * Row-level security already limits a parent to their own children, but staff can read everyone's;
 * so the parent page also filters to the signed-in person's own children (a staff member may be a parent too).
 */
function useChildrenToday(guardianId: string | null) {
  const [rows, setRows] = useState<ChildToday[] | null>(null)
  const [error, setError] = useState(false)
  const load = () => {
    setError(false)
    let query = supabase
      .from('children')
      .select(guardianId ? `${CHILD_FIELDS}, guardianships!inner(guardian_id)` : CHILD_FIELDS)
      .eq('active', true)
    if (guardianId) query = query.eq('guardianships.guardian_id', guardianId)
    void query.order('full_name').then(({ data, error: e }) => (e ? setError(true) : setRows((data ?? []) as unknown as ChildToday[])))
  }
  useEffect(load, [guardianId])
  return { rows, error, reload: load }
}

function TimeTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-sunken p-3.5">
      <p className="kicker flex items-center gap-1.5 [&_svg]:size-4">{icon}{label}</p>
      <p className="mt-1.5 text-numeral tabular-nums">{value}</p>
    </div>
  )
}

function ChildrenToday({ area, title, empty, guardianId }: { area: Area; title: string; empty: string; guardianId: string | null }) {
  const { rows, error, reload } = useChildrenToday(guardianId)
  const { weekday } = indiaClock(new Date())
  return (
    <AreaShell area={area} title={title} subtitle={weekday === 7 ? 'Sunday: the school is closed today.' : "Today's regular drop-off and pickup times."}>
      <section className="mt-6" aria-live="polite" aria-busy={!rows && !error}>
        {error ? (
          <ErrorState title="Couldn't load the children" onRetry={reload}>Check your connection and try again.</ErrorState>
        ) : !rows ? (
          <ul className="grid gap-4 md:grid-cols-2" aria-label="Loading">
            {[0, 1].map((i) => <li key={i} className="card h-[212px] animate-pulse rounded-2xl" />)}
          </ul>
        ) : rows.length === 0 ? (
          <EmptyState title="No children yet">{empty}</EmptyState>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {rows.map((c) => {
              const today = todayLine(c, weekday)
              return (
                <li key={c.id} className="card rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center gap-4">
                    <Avatar name={c.preferred_name ?? c.full_name} color={childColor(c.id)} size="lg" />
                    <div className="min-w-0">
                      <h2 className="truncate text-h2">{c.preferred_name ?? c.full_name}</h2>
                      <p className="flex items-center gap-1.5 truncate text-small font-semibold text-ink-2">
                        <School className="size-4 shrink-0 text-ink-3" aria-hidden />
                        {[c.programmes?.name, c.classes?.name].filter(Boolean).join(' · ') || 'No programme yet'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <TimeTile icon={<Sunrise />} label="Drop-off" value={today.dropoff} />
                    <TimeTile icon={<House />} label="Pickup" value={today.pickup} />
                  </div>
                  {today.fromWindows && (
                    <p className="mt-3 text-caption font-semibold text-ink-2">These are the programme's windows. The core team hasn't set regular times yet.</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <Notice className="mt-6" icon={<Sparkles aria-hidden />}>Changing today's time, pickups and live tracking arrive in the next updates.</Notice>
    </AreaShell>
  )
}

export { ParentToday as ParentHome } from './ParentToday'

export function CoreHome() {
  return <ChildrenToday area="core" title="Today" guardianId={null} empty="The admin adds children from People." />
}
