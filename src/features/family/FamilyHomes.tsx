import { useEffect, useState } from 'react'
import { CalendarClock, House, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Mascot } from '../../ui/Backdrop'
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

const t = (v: string | null) => (v ? formatTime(toMinutes(v.slice(0, 5))) : '—')

/** Today's drop-off and pickup for a child: their regular times, or the programme's windows until those are set. */
function todayLine(c: ChildToday, weekday: number): { dropoff: string; pickup: string; fromWindows: boolean } {
  const s = c.child_schedules.find((x) => x.weekday === weekday)
  if (s) return { dropoff: t(s.dropoff), pickup: t(s.pickup), fromWindows: false }
  const p = c.programmes
  if (!p) return { dropoff: '—', pickup: '—', fromWindows: true }
  return p.flexible
    ? { dropoff: `from ${t(p.starts)}`, pickup: `by ${t(p.ends)}`, fromWindows: true }
    : { dropoff: `${t(p.dropoff_from)}–${t(p.dropoff_to)}`, pickup: `${t(p.pickup_from)}–${t(p.pickup_to)}`, fromWindows: true }
}

function useChildrenToday() {
  const [rows, setRows] = useState<ChildToday[] | null>(null)
  const [error, setError] = useState(false)
  const load = () => {
    setError(false)
    // Row-level security decides whose children come back: a parent's own, or everyone's for staff.
    void supabase
      .from('children')
      .select('id, full_name, preferred_name, programmes(name, flexible, starts, ends, dropoff_from, dropoff_to, pickup_from, pickup_to), classes(name), child_schedules(weekday, dropoff, pickup)')
      .eq('active', true)
      .order('full_name')
      .then(({ data, error: e }) => (e ? setError(true) : setRows((data ?? []) as unknown as ChildToday[])))
  }
  useEffect(load, [])
  return { rows, error, reload: load }
}

function ChildrenToday({ area, title, empty }: { area: Area; title: string; empty: string }) {
  const { rows, error, reload } = useChildrenToday()
  const { weekday } = indiaClock(new Date())
  return (
    <AreaShell area={area} title={title}>
      <p className="mt-1 px-1 text-[16px] font-semibold text-ink-2">
        {weekday === 7 ? 'Sunday: the school is closed today.' : "Today's regular drop-off and pickup times."}
      </p>
      <section className="mt-5" aria-live="polite">
        {error ? (
          <div className="card rounded-[30px] p-6 text-center">
            <p className="text-[16px] font-bold text-danger">Couldn't load the children. Check your connection.</p>
            <Button className="mt-4" variant="secondary" icon={<RotateCcw />} onClick={reload}>Try again</Button>
          </div>
        ) : !rows ? (
          <ul className="grid gap-4 md:grid-cols-2" aria-label="Loading">{[0, 1].map((i) => <li key={i} className="card h-40 animate-pulse rounded-[30px]" />)}</ul>
        ) : rows.length === 0 ? (
          <div className="card flex flex-col items-center rounded-[30px] p-8 text-center"><Mascot size={96} /><p className="mt-2 text-[16px] font-semibold text-ink-2">{empty}</p></div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {rows.map((c) => {
              const color = childColor(c.id)
              const today = todayLine(c, weekday)
              return (
                <li key={c.id} className="card relative overflow-hidden rounded-[32px] p-5 sm:p-6">
                  <span className="pointer-events-none absolute -right-20 -top-24 size-60 rounded-full opacity-35 blur-3xl" style={{ background: color }} aria-hidden />
                  <div className="relative flex items-center gap-4">
                    <span className="grid size-14 shrink-0 place-items-center rounded-full font-display text-[26px] font-bold text-white ring-4 ring-white/70"
                      style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 62%, white))`, boxShadow: `0 12px 24px -10px ${color}` }} aria-hidden>
                      {(c.preferred_name ?? c.full_name)[0]}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-[26px] font-bold leading-8">{c.preferred_name ?? c.full_name}</h2>
                      <p className="truncate text-[14px] font-semibold text-ink-2">{c.programmes?.name ?? '—'} · {c.classes?.name ?? '—'}</p>
                    </div>
                  </div>
                  <div className="relative mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-[20px] bg-sunken p-3.5">
                      <p className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink-2"><CalendarClock className="size-4" aria-hidden />Drop-off</p>
                      <p className="mt-0.5 font-display text-[20px] font-bold tabular-nums">{today.dropoff}</p>
                    </div>
                    <div className="rounded-[20px] bg-sunken p-3.5">
                      <p className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink-2"><House className="size-4" aria-hidden />Pickup</p>
                      <p className="mt-0.5 font-display text-[20px] font-bold tabular-nums">{today.pickup}</p>
                    </div>
                  </div>
                  {today.fromWindows && (
                    <p className="relative mt-3 text-[13px] font-semibold text-ink-2">These are the programme's windows; the core team hasn't set regular times yet.</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <p className="mt-6 flex items-center gap-2 px-1 text-[14px] font-semibold text-ink-2">
        <Sparkles className="size-4 text-rb-orange" aria-hidden /> Changing today's time, pickups and live tracking arrive in the next updates.
      </p>
    </AreaShell>
  )
}

export function ParentHome() {
  return <ChildrenToday area="parent" title="Today" empty="No children are linked to your account yet. Please contact the school." />
}

export function CoreHome() {
  return <ChildrenToday area="core" title="Today" empty="No children yet. The admin adds children from People." />
}
