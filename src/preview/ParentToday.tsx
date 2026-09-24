import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  Bell, CalendarHeart, ChevronRight, CircleCheck, Clock, Copy, House, Mail, Megaphone, MessageCircle,
  MessagesSquare, Star, Timer, User, UserPlus, UserRound, Users,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Logo } from '../ui/Logo'
import { AppNav } from '../ui/AppNav'
import { CodeTiles } from '../ui/CodeTiles'
import { FreshnessBadge } from '../ui/FreshnessBadge'
import { Sheet } from '../ui/Sheet'
import { childColor } from '../ui/childColor'
import { PreviewRibbon } from './PreviewShell'
import { BUSY_FROM, PICKUP_SLOTS, SAMPLE_CODE, SAVED_PEOPLE } from './sample'

type SheetName = 'time' | 'late' | 'who' | null

/** Each child gets a colour from the logo's rainbow, used for their avatar. */
function ChildCard({ name, group, color, status, children }: { name: string; group: string; color: string; status: ReactNode; children: ReactNode }) {
  return (
    <section className="card relative overflow-hidden rounded-2xl p-5 sm:p-6">
      <div className="relative flex items-center gap-4">
        <span
          className="relative grid size-16 shrink-0 place-items-center rounded-full tracking-[-0.02em] text-[30px] font-bold text-white ring-4 ring-white/70"
          style={{ background: color }}
          aria-hidden
        >
          {name[0]}
          <Star className="absolute -right-1 -top-1 size-6 fill-[var(--rb-yellow)] text-[var(--rb-yellow)] drop-shadow" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[28px] font-bold leading-8">{name}</h2>
          <p className="text-[15px] font-semibold text-ink-2">{group}</p>
          <div className="mt-2 flex sm:hidden">{status}</div>
        </div>
        <div className="hidden sm:block">{status}</div>
      </div>
      <div className="relative">{children}</div>
    </section>
  )
}

function TripLine({ icon, label, time, detail, color }: { icon: ReactNode; label: string; time: string; detail: ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-3.5 py-3.5">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl [&_svg]:size-5" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-ink-2">{label}</p>
        <p className="tracking-[-0.02em] text-[22px] font-bold leading-7 tabular-nums">{time}</p>
      </div>
      <div className="text-right text-[15px] font-bold text-ink-2">{detail}</div>
    </div>
  )
}

/** A square-ish action with the icon above the label: fits two across even on a small phone. */
function ActionTile({ icon, label, tone, onClick }: { icon: ReactNode; label: string; tone: 'glass' | 'sunshine'; onClick: () => void }) {
  const look =
    tone === 'sunshine'
      ? 'bg-[var(--sun)] text-[var(--sun-ink)] shadow-[0_4px_0_var(--sun-lip)]'
      : 'card text-ink'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl text-[16px] font-extrabold transition-transform duration-200 ease-spring active:scale-95 [&_svg]:size-7 ${look}`}
    >
      {icon}
      {label}
    </button>
  )
}

function PersonOption({ icon, name, detail, onClick }: { icon: ReactNode; name: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card flex min-h-[72px] items-center gap-4 rounded-xl px-4 py-3 text-left transition-transform duration-200 ease-spring active:scale-[0.98]"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-ink [&_svg]:size-6" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-extrabold">{name}</span>
        <span className="block text-[14px] font-semibold text-ink-2">{detail}</span>
      </span>
      <ChevronRight className="size-5 text-ink-3" aria-hidden />
    </button>
  )
}

export function ParentToday() {
  const [sheet, setSheet] = useState<SheetName>(null)
  const [pickupTime, setPickupTime] = useState('5:30 PM')
  const [chosenTime, setChosenTime] = useState('5:30 PM')
  const [who, setWho] = useState<(typeof SAVED_PEOPLE)[number] | null>(null)

  return (
    <div className="min-h-dvh">
      <PreviewRibbon />
      <AppNav
        items={[
          { label: 'Today', icon: <CalendarHeart />, active: true },
          { label: 'Updates', icon: <Bell />, badge: true },
          { label: 'Messages', icon: <MessagesSquare /> },
          { label: 'Account', icon: <UserRound /> },
        ]}
      />

      <main className="mx-auto w-full max-w-[1180px] px-5 pb-36 pt-[max(52px,calc(env(safe-area-inset-top)+40px))] md:pb-12 md:pl-[136px] md:pr-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <Logo className="h-11 md:h-14" />
            <p className="mt-5 text-[15px] font-extrabold uppercase tracking-[0.08em] text-ink-2">Thursday, 24 September</p>
            <h1 className="text-[36px] font-bold leading-[40px] md:text-[48px] md:leading-[52px]">Good afternoon, Sneha</h1>
          </div>
          <button type="button" aria-label="Notifications, 1 new" className="glass relative mt-1 grid size-12 shrink-0 place-items-center rounded-full">
            <Bell className="size-6" aria-hidden />
            <span className="absolute right-2.5 top-2.5 size-3 rounded-full ring-2 ring-white" style={{ background: 'var(--rb-red)' }} />
          </button>
        </header>

        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          {/* Aarav: pickup on the way with a third person (the live state). */}
          <ChildCard
            name="Aarav"
            group="Jr KG · Sunflowers"
            color={childColor('aarav')}
            status={<span className="rounded-full bg-accent-soft px-3.5 py-1.5 text-[14px] font-extrabold text-accent-ink">On the way</span>}
          >
            <Link to="/preview/trip" className="mt-5 block rounded-2xl bg-accent-soft p-5 ring-1 ring-inset ring-[color-mix(in_oklab,var(--rb-blue)_22%,transparent)] transition-transform duration-200 ease-spring active:scale-[0.98]">
              <div className="flex items-center justify-between gap-3">
                <FreshnessBadge state="live" />
                <span className="flex items-center gap-1 rounded-full bg-accent py-1.5 pl-3.5 pr-2.5 text-[14px] font-extrabold text-white shadow-[0_3px_0_var(--accent-lip)]">
                  Track <ChevronRight className="size-4" aria-hidden />
                </span>
              </div>
              <p className="mt-3 tracking-[-0.02em] text-[34px] font-bold leading-10 tabular-nums">about 3–5 min</p>
              <p className="text-[16px] font-semibold text-ink-2">Ramesh (Grandfather) is on the way · Aarav is ready at the gate</p>
              <div className="relative mt-4 h-3 rounded-full bg-sunken" aria-hidden>
                <div className="rainbow-bar h-full w-[70%] rounded-full" />
                <Star className="absolute left-[70%] top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 fill-[var(--rb-yellow)] text-[var(--rb-orange)] drop-shadow" />
              </div>
            </Link>
            <div className="mt-2 divide-y divide-line">
              <TripLine icon={<CircleCheck />} label="Drop-off" time="9:15 AM" color="var(--rb-green)" detail={<span className="text-live">Checked in 9:17</span>} />
            </div>
          </ChildCard>

          {/* Meera: at school, pickup later today by the parent (the planning state). */}
          <ChildCard
            name="Meera"
            group="Learning Center"
            color={childColor('meera')}
            status={
              <span className="flex items-center gap-1.5 rounded-full bg-live-soft px-3.5 py-1.5 text-[14px] font-extrabold text-live">
                <CircleCheck className="size-4" aria-hidden /> At school
              </span>
            }
          >
            <div className="mt-3 divide-y divide-line">
              <TripLine icon={<CircleCheck />} label="Drop-off" time="9:30 AM" color="var(--rb-green)" detail={<span className="text-live">Checked in 9:26</span>} />
              <TripLine icon={<House />} label="Pickup" time={pickupTime} color="var(--rb-orange)" detail={who ? `${who.name.split(' ')[0]} · ${who.relation}` : 'You'} />
            </div>
            <Button size="xl" className="mt-4 w-full" icon={<Users />} onClick={() => setSheet('who')}>
              Who's picking up?
            </Button>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ActionTile icon={<Clock />} label="Change time" tone="glass" onClick={() => { setChosenTime(pickupTime); setSheet('time') }} />
              <ActionTile icon={<Timer />} label="Running late" tone="sunshine" onClick={() => setSheet('late')} />
            </div>
          </ChildCard>

          <section className="card relative flex items-start gap-4 overflow-hidden rounded-2xl p-5 sm:p-6 lg:col-span-2">
            <span className="rainbow-bar absolute inset-x-0 top-0 h-1.5" aria-hidden />
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--sun)] text-white shadow-[0_10px_20px_-8px_var(--rb-orange)]" aria-hidden>
              <Megaphone className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-ink-2">From Jumpstart · 10:05 AM</p>
              <p className="mt-0.5 tracking-[-0.02em] text-[22px] font-bold leading-7">Early closing on Friday at 12:00</p>
              <p className="mt-1 text-[16px] leading-6 text-ink-2">Please plan pickups before noon. The Learning Center stays open as usual.</p>
            </div>
            <span className="mt-2 size-3 shrink-0 rounded-full" style={{ background: 'var(--rb-red)' }} aria-label="Unread" />
          </section>
        </div>
      </main>

      <Sheet open={sheet === 'time'} onClose={() => setSheet(null)} title="Meera's pickup time">
        <p className="text-[16px] leading-6 text-ink-2">Learning Center: collect any time until 7 PM. Busy slots are shown so you can skip the rush.</p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Pickup time">
          {PICKUP_SLOTS.map((slot) => {
            const busy = slot.load >= BUSY_FROM
            const selected = slot.time === chosenTime
            return (
              <button
                key={slot.time}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChosenTime(slot.time)}
                className={`flex h-[76px] flex-col items-center justify-center rounded-xl transition-transform duration-200 ease-spring active:scale-95 ${
                  selected ? 'bg-accent text-white shadow-[0_3px_0_var(--accent-lip)]' : 'card'
                }`}
              >
                <span className="tracking-[-0.02em] text-[22px] font-bold leading-7 tabular-nums">{slot.time.replace(' PM', '')}</span>
                <span className={`text-[12px] font-extrabold ${selected ? 'text-white/90' : busy ? 'text-warning' : 'text-ink-2'}`}>
                  {busy ? `Busy · ${slot.load}` : slot.load <= 2 ? 'Quiet' : `${slot.load} pickups`}
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-4 text-[14px] font-semibold text-ink-2">The school hears about the change straight away.</p>
        <Button size="xl" className="mt-3 w-full" onClick={() => { setPickupTime(chosenTime); setSheet(null) }}>
          Save {chosenTime}
        </Button>
      </Sheet>

      <Sheet open={sheet === 'late'} onClose={() => setSheet(null)} title="Running late?">
        <p className="text-[16px] leading-6 text-ink-2">We'll tell Meera's coordinator right away, so she isn't waiting at the gate.</p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[10, 20, 30].map((min) => (
            <Button key={min} size="xl" variant="sunshine" onClick={() => setSheet(null)}>
              +{min} min
            </Button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === 'who'} onClose={() => setSheet(null)} title={who ? 'Send the pickup link' : "Who's picking up Meera?"}>
        {!who ? (
          <div className="grid gap-2.5">
            <PersonOption icon={<User />} name="Me" detail="Sneha · Mother" onClick={() => setSheet(null)} />
            {SAVED_PEOPLE.map((p) => (
              <PersonOption key={p.name} icon={<UserRound />} name={p.name} detail={`${p.relation} · saved`} onClick={() => setWho(p)} />
            ))}
            <PersonOption icon={<UserPlus />} name="Someone new" detail="Name, phone and relation. No photo needed." onClick={() => undefined} />
          </div>
        ) : (
          <div>
            <p className="text-[18px] leading-7">
              <span className="font-extrabold">{who.name}</span> ({who.relation}) will pick up Meera at <span className="font-extrabold">{pickupTime}</span>.
            </p>
            <div className="card mt-5 rounded-2xl p-5 text-center">
              <p className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-2">Handoff code</p>
              <div className="mt-3"><CodeTiles code={SAMPLE_CODE} /></div>
              <p className="mt-3 text-[14px] font-semibold text-ink-2">{who.name.split(' ')[0]} shows this at the gate. It's in the link too.</p>
            </div>
            {who.email && (
              <p className="mt-4 flex items-center gap-2 text-[15px] font-bold text-live">
                <Mail className="size-5" aria-hidden /> Link emailed to {who.email}
              </p>
            )}
            <Button size="xl" className="mt-4 w-full" icon={<MessageCircle />} onClick={() => setSheet(null)}>
              Send on WhatsApp
            </Button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button size="md" variant="quiet" icon={<Copy />}>
                Copy link
              </Button>
              <Button size="md" variant="quiet" onClick={() => setWho(null)}>
                Someone else
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
