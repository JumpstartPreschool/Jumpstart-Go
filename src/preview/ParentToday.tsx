import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  Bell, CalendarClock, ChevronRight, CircleCheck, Clock, Copy, House, KeyRound, Mail, Megaphone, MessageCircle,
  MessagesSquare, Timer, User, UserPlus, UserRound, Users,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Logo } from '../ui/Logo'
import { FreshnessBadge } from '../ui/FreshnessBadge'
import { Sheet } from '../ui/Sheet'
import { PhoneColumn } from './PreviewShell'
import { BUSY_FROM, PICKUP_SLOTS, SAMPLE_CODE, SAVED_PEOPLE } from './sample'

type SheetName = 'time' | 'late' | 'who' | null

function Avatar({ initial, tone }: { initial: string; tone: 'sky' | 'orange' }) {
  const bg = tone === 'sky' ? 'bg-[color-mix(in_oklab,var(--brand-sky)_45%,var(--surface))]' : 'bg-[color-mix(in_oklab,var(--brand-yellow)_40%,var(--surface))]'
  return <span className={`grid size-12 shrink-0 place-items-center rounded-full text-[20px] font-bold text-ink ${bg}`} aria-hidden>{initial}</span>
}

function TripLine({ icon, label, time, detail }: { icon: ReactNode; label: string; time: string; detail: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-ink-2 [&_svg]:size-[18px]" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink-2">{label}</p>
        <p className="text-[17px] font-semibold tabular-nums">{time}</p>
      </div>
      <div className="text-right text-[15px] text-ink-2">{detail}</div>
    </div>
  )
}

export function ParentToday() {
  const [sheet, setSheet] = useState<SheetName>(null)
  const [pickupTime, setPickupTime] = useState('5:30 PM')
  const [chosenTime, setChosenTime] = useState('5:30 PM')
  const [who, setWho] = useState<(typeof SAVED_PEOPLE)[number] | null>(null)

  return (
    <PhoneColumn>
      <div className="px-5 pb-32 pt-[max(56px,calc(env(safe-area-inset-top)+44px))]">
        <header className="flex items-start justify-between">
          <div>
            <Logo className="mb-4 h-8" />
            <p className="text-[15px] font-medium text-ink-2">Thursday, 24 September</p>
            <h1 className="mt-0.5 text-[30px] font-semibold leading-9 tracking-[-0.02em]">Good afternoon, Sneha</h1>
          </div>
          <button type="button" aria-label="Notifications, 1 new" className="relative mt-0.5 grid size-11 place-items-center rounded-full bg-surface shadow-1 ring-1 ring-line">
            <Bell className="size-5" aria-hidden />
            <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full ring-2 ring-surface" style={{ background: 'var(--brand-red)' }} />
          </button>
        </header>

        {/* Aarav: pickup on the way with a third person (the live state). */}
        <section className="mt-6 rounded-[26px] bg-surface p-5 shadow-1 ring-1 ring-line">
          <div className="flex items-center gap-3.5">
            <Avatar initial="A" tone="sky" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[20px] font-semibold leading-6">Aarav</h2>
              <p className="text-[14px] text-ink-2">Jr KG · Sunflowers</p>
            </div>
            <span className="rounded-full bg-accent/10 px-3 py-1.5 text-[13px] font-semibold text-accent">On the way</span>
          </div>
          <Link to="/preview/trip" className="mt-4 block rounded-[20px] bg-sunken p-4 transition-transform duration-200 ease-spring active:scale-[0.98]">
            <div className="flex items-center justify-between gap-3">
              <FreshnessBadge state="live" />
              <span className="flex items-center gap-1 text-[15px] font-semibold text-accent">Track <ChevronRight className="size-4" aria-hidden /></span>
            </div>
            <p className="mt-3 text-[26px] font-semibold tabular-nums tracking-[-0.02em]">about 3–5 min</p>
            <p className="text-[15px] text-ink-2">Ramesh (Grandfather) is on the way · Aarav is ready at the gate</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <div className="h-full w-[70%] rounded-full bg-accent" />
            </div>
          </Link>
          <div className="mt-1 divide-y divide-line">
            <TripLine icon={<CircleCheck />} label="Drop-off" time="9:15 AM" detail={<span className="text-live">Checked in 9:17</span>} />
          </div>
        </section>

        {/* Meera: at school, pickup later today by the parent (the planning state). */}
        <section className="mt-4 rounded-[26px] bg-surface p-5 shadow-1 ring-1 ring-line">
          <div className="flex items-center gap-3.5">
            <Avatar initial="M" tone="orange" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[20px] font-semibold leading-6">Meera</h2>
              <p className="text-[14px] text-ink-2">Learning Center</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-live-soft px-3 py-1.5 text-[13px] font-semibold text-live">
              <CircleCheck className="size-4" aria-hidden /> At school
            </span>
          </div>
          <div className="mt-2 divide-y divide-line">
            <TripLine icon={<CircleCheck />} label="Drop-off" time="9:30 AM" detail={<span className="text-live">Checked in 9:26</span>} />
            <TripLine icon={<House />} label="Pickup" time={pickupTime} detail={who ? `${who.name.split(' ')[0]} · ${who.relation}` : 'You'} />
          </div>
          <Button size="lg" className="mt-3 w-full" icon={<Users />} onClick={() => setSheet('who')}>
            Who's picking up?
          </Button>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <Button size="lg" variant="secondary" icon={<Clock />} onClick={() => { setChosenTime(pickupTime); setSheet('time') }}>
              Change time
            </Button>
            <Button size="lg" variant="secondary" icon={<Timer />} onClick={() => setSheet('late')}>
              Running late
            </Button>
          </div>
        </section>

        <section className="mt-4 flex items-start gap-3.5 rounded-[22px] bg-surface p-4 shadow-1 ring-1 ring-line">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-flag-soft text-flag" aria-hidden><Megaphone className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink-2">From Jumpstart · 10:05 AM</p>
            <p className="mt-0.5 text-[17px] font-semibold leading-6">Early closing on Friday at 12:00</p>
            <p className="mt-0.5 text-[15px] leading-[22px] text-ink-2">Please plan pickups before noon. The Learning Center stays open as usual.</p>
          </div>
          <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />
        </section>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px] px-4 pb-[max(12px,env(safe-area-inset-bottom))] md:absolute">
        <div className="glass grid grid-cols-4 rounded-[26px] p-1.5">
          {[
            { label: 'Today', icon: <CalendarClock />, active: true },
            { label: 'Updates', icon: <Bell />, badge: true },
            { label: 'Messages', icon: <MessagesSquare /> },
            { label: 'Account', icon: <UserRound /> },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              aria-current={item.active ? 'page' : undefined}
              className={`relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[12px] font-semibold transition-colors [&_svg]:size-[22px] ${item.active ? 'bg-accent/10 text-accent' : 'text-ink-2'}`}
            >
              {item.icon}
              {item.label}
              {item.badge && <span className="absolute right-[30%] top-2.5 size-2 rounded-full bg-accent" aria-label="New" />}
            </button>
          ))}
        </div>
      </nav>

      <Sheet open={sheet === 'time'} onClose={() => setSheet(null)} title="Meera's pickup time">
        <p className="text-[15px] leading-[22px] text-ink-2">Learning Center: any time from 9 AM to 7 PM. Busy slots are shown so you can avoid the rush.</p>
        <div className="mt-4 grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Pickup time">
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
                className={`flex h-[68px] flex-col items-center justify-center rounded-[16px] ring-1 transition-[transform,background-color] duration-200 ease-spring active:scale-95 ${
                  selected ? 'bg-accent text-on-accent ring-accent' : 'bg-surface ring-line-strong'
                }`}
              >
                <span className="text-[17px] font-semibold tabular-nums">{slot.time.replace(' PM', '')}</span>
                <span className={`text-[12px] font-medium ${selected ? 'text-on-accent/85' : busy ? 'text-flag' : 'text-ink-2'}`}>
                  {busy ? `Busy · ${slot.load}` : slot.load <= 2 ? 'Quiet' : `${slot.load} pickups`}
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-4 text-[13px] text-ink-2">The school hears about the change straight away.</p>
        <Button size="xl" className="mt-3 w-full" onClick={() => { setPickupTime(chosenTime); setSheet(null) }}>
          Save {chosenTime}
        </Button>
      </Sheet>

      <Sheet open={sheet === 'late'} onClose={() => setSheet(null)} title="Running late?">
        <p className="text-[15px] leading-[22px] text-ink-2">We'll tell Meera's coordinator right away, so she isn't waiting at the gate.</p>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {[10, 20, 30].map((min) => (
            <Button key={min} size="xl" variant="secondary" onClick={() => setSheet(null)}>
              +{min} min
            </Button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === 'who'} onClose={() => { setSheet(null) }} title={who ? 'Send the pickup link' : "Who's picking up Meera?"}>
        {!who ? (
          <div className="grid gap-2">
            <PersonOption icon={<User />} name="Me" detail="Sneha · Mother" onClick={() => setSheet(null)} />
            {SAVED_PEOPLE.map((p) => (
              <PersonOption key={p.name} icon={<UserRound />} name={p.name} detail={`${p.relation} · saved`} onClick={() => setWho(p)} />
            ))}
            <PersonOption icon={<UserPlus />} name="Someone new" detail="Name, phone and relation. No photo needed." onClick={() => undefined} />
          </div>
        ) : (
          <div>
            <p className="text-[17px] leading-6">
              <span className="font-semibold">{who.name}</span> ({who.relation}) will pick up Meera at <span className="font-semibold">{pickupTime}</span>.
            </p>
            <div className="mt-4 rounded-[20px] bg-sunken p-4 text-center">
              <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-2">
                <KeyRound className="size-4" aria-hidden /> Handoff code
              </p>
              <p className="mt-1 font-semibold tabular-nums tracking-[0.3em] text-[40px] leading-[48px]">{SAMPLE_CODE}</p>
              <p className="text-[13px] text-ink-2">{who.name.split(' ')[0]} shows this at the gate. It's in the link too.</p>
            </div>
            {who.email && (
              <p className="mt-4 flex items-center gap-2 text-[15px] text-live">
                <Mail className="size-4" aria-hidden /> Link emailed to {who.email}
              </p>
            )}
            <Button size="xl" className="mt-4 w-full" icon={<MessageCircle />} onClick={() => { setSheet(null) }}>
              Send on WhatsApp
            </Button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button size="md" variant="quiet" icon={<Copy />}>
                Copy link
              </Button>
              <Button size="md" variant="quiet" onClick={() => setWho(null)}>
                Choose someone else
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </PhoneColumn>
  )
}

function PersonOption({ icon, name, detail, onClick }: { icon: ReactNode; name: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 items-center gap-3.5 rounded-[18px] bg-surface px-4 py-3 text-left ring-1 ring-line transition-[transform,background-color] duration-200 ease-spring hover:bg-sunken active:scale-[0.98]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sunken text-ink-2 [&_svg]:size-5" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold">{name}</span>
        <span className="block text-[14px] text-ink-2">{detail}</span>
      </span>
      <ChevronRight className="size-5 text-ink-3" aria-hidden />
    </button>
  )
}

