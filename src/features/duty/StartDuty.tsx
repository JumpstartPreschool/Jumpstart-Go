import type { ReactNode } from 'react'
import { ArrowRight, CircleCheck, Clock, MapPin, PlayLine, PowerLine, RotateCcw, TriangleAlert, Volume2, Wifi } from '../../ui/icons'
import { PushSwitch } from '../notifications/PushSwitch'
import { Button } from '../../ui/Button'
import { Logo, Mascot } from '../../ui/Logo'
import { Pill } from '../../ui/Pill'
import { isInstalled } from '../../ui/hooks'
import { formatTime, indiaClock } from '../../domain/time'
import type { Duty } from './useDuty'
import { useTodayTrips } from '../trips/api'
import { now } from '../../lib/clock'

type Tone = 'ok' | 'warn' | 'error' | 'info'

const toneStyle: Record<Tone, string> = {
  ok: 'bg-live-soft text-live',
  warn: 'bg-warning-soft text-warning',
  error: 'bg-danger-soft text-danger',
  info: 'bg-accent-soft text-accent',
}

/** One thing to check before duty, as a tile: its state, what it means, and anything to do about it. */
function Tile({ tone, icon, title, children, extra }: { tone: Tone; icon: ReactNode; title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <li className="card flex flex-col gap-3 rounded-xl p-5 short:gap-2 short:p-4">
      <div className="flex items-center gap-3">
        <span className={`grid size-11 shrink-0 place-items-center rounded-md [&_svg]:size-[22px] ${toneStyle[tone]}`} aria-hidden>{icon}</span>
        <p className="text-h4">{title}</p>
      </div>
      <p className="text-body text-ink-2 short:text-small">{children}</p>
      {extra && <div className="mt-auto">{extra}</div>}
    </li>
  )
}

/** Today at the gate, from the same live trips as the queue: who's on the way now, the day's totals and the next arrival. */
function TodayStrip() {
  const { trips, error } = useTodayTrips()
  const live = (trips ?? []).filter((t) => t.status !== 'cancelled')
  const coming = live.filter((t) => t.status === 'en_route')
  const next = coming.find((t) => Date.parse(t.arrive_at) >= now() - 5 * 60_000)
  const stat = (label: string, value: number) => (
    <div className="grid gap-0.5 px-4 py-3 text-center short:py-2">
      <span className="text-h2 tabular-nums">{trips ? value : '–'}</span>
      <span className="text-caption font-bold text-ink-2">{label}</span>
    </div>
  )
  return (
    <section aria-label="Today at the gate" className="card overflow-hidden rounded-xl">
      <div className="grid grid-cols-3 divide-x divide-line">
        {stat('On the way now', coming.length)}
        {stat('Drop-offs today', live.filter((t) => t.direction === 'dropoff').length)}
        {stat('Pickups today', live.filter((t) => t.direction === 'pickup').length)}
      </div>
      <p className="flex items-center justify-center gap-2 border-t border-line bg-sunken px-4 py-2.5 text-small font-semibold text-ink-2 [&_svg]:size-4 [&_svg]:shrink-0" aria-live="polite">
        <Clock aria-hidden />
        {error ? "Couldn't load today's trips. They'll appear when the connection is back."
          : !trips ? 'Loading today…'
          : next ? <span>Next: <b className="text-ink">{next.traveller_name.split(' ')[0]}</b> about <b className="tabular-nums text-ink">{formatTime(indiaClock(new Date(next.arrive_at)).minutes)}</b></span>
          : 'Nobody is on the way yet.'}
      </p>
    </section>
  )
}

/**
 * The duty screens fill the iPad: the logo at the top (the account button floats top right), the content in the middle,
 * and the main action at the bottom within thumb reach. Portrait is one column; landscape puts the welcome beside it.
 */
function Shell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="gutter screen-h mx-auto flex w-full max-w-[calc(1120px+2*var(--gutter))] flex-col pt-[max(16px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="flex h-12 items-center gap-3 pr-36">
        <Logo className="h-9 sm:h-10" />
        <Pill icon={<MapPin />}>Karve Road</Pill>
      </header>
      <div className="flex flex-1 flex-col justify-center py-8 sm:py-12 short:py-5 shorter:py-3">{children}</div>
      {/* The main action stays in reach at the bottom of the screen, over a soft fade, however far the checks scroll. */}
      {footer && <div className="duty-dock landscape:lg:hidden sticky bottom-0 z-20 -mx-[var(--gutter)] -mb-[max(24px,env(safe-area-inset-bottom))] px-[var(--gutter)] pt-8 pb-[max(16px,env(safe-area-inset-bottom))]">{footer}</div>}
    </main>
  )
}

export function StartDuty({ duty, online }: { duty: Duty; online: boolean }) {
  const installed = isInstalled()

  if (duty.phase === 'check') {
    const struggling = duty.testsPlayed >= 2 && !duty.testing
    return (
      <Shell>
        <div className="card page-in mx-auto w-full max-w-[580px] rounded-2xl p-7 text-center sm:p-10">
          <div className="relative mx-auto grid size-24 place-items-center">
            {duty.testing && <span className="absolute inset-0 animate-ping rounded-full bg-accent-soft" aria-hidden />}
            <span className="relative grid size-24 place-items-center rounded-full bg-accent-soft text-accent">
              <Volume2 className="size-11" aria-hidden />
            </span>
          </div>
          <h1 className="mt-6 text-h1">Did you hear the test?</h1>
          <p className="mt-2 text-lead text-ink-2" aria-live="polite">
            {duty.testing ? 'Playing a chime and "Sound check. Announcements are on."' : 'You should have heard a chime, then "Sound check. Announcements are on."'}
          </p>
          {struggling && (
            <ul className="mt-6 grid list-disc gap-1.5 rounded-lg bg-warning-soft p-5 pl-9 text-left text-body text-ink marker:text-warning">
              <li>Turn the volume up with the device's volume buttons.</li>
              <li>Turn off silent or Do Not Disturb mode.</li>
              <li>If a Bluetooth speaker is connected, check that it's switched on.</li>
            </ul>
          )}
          <div className="mt-8 grid gap-3">
            <Button size="xl" variant="success" icon={<CircleCheck />} onClick={duty.confirmHeard} disabled={duty.testing}>
              Yes, I heard it
            </Button>
            <Button size="lg" variant="secondary" icon={<RotateCcw />} loading={duty.testing} onClick={() => void duty.playTest()}>
              Play again
            </Button>
            <Button size="md" variant="quiet" onClick={duty.back}>
              Back
            </Button>
          </div>
        </div>
      </Shell>
    )
  }

  const since = duty.resumable && duty.since ? formatTime(indiaClock(new Date(duty.since)).minutes) : null
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })
  const start = (
    <div className="mx-auto w-full max-w-[760px] landscape:lg:max-w-none">
      <button type="button" className="dutybtn" disabled={!duty.soundSupported} onClick={duty.start}>
        <span className="dutybtn-icon" aria-hidden>{duty.resumable ? <PlayLine /> : <PowerLine />}</span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[19px] font-extrabold leading-tight tracking-[-0.01em]">{duty.resumable ? 'Resume duty' : 'Start duty'}</span>
          <span className="block truncate text-small font-semibold opacity-85">Announcements stay on until you tap End duty</span>
        </span>
        <ArrowRight className="dutybtn-arrow" aria-hidden />
      </button>
    </div>
  )

  return (
    <Shell footer={start}>
      {/* Portrait: welcome, today, checks. Landscape: welcome and today on the left, checks and Start on the right. */}
      <div className="page-in mx-auto grid w-full max-w-[760px] gap-10 short:gap-6 landscape:lg:max-w-none landscape:lg:grid-cols-[0.85fr_1.15fr] landscape:lg:grid-rows-[auto_auto] landscape:lg:content-center landscape:lg:gap-x-14">
        <section className="text-center landscape:lg:self-end landscape:lg:text-left">
          <Mascot size={144} className="mx-auto short:hidden landscape:lg:mx-0" />
          <Mascot size={84} className="mx-auto hidden short:block landscape:lg:mx-0" />
          <p className="mt-6 short:mt-3 text-small font-bold uppercase tracking-[0.08em] text-ink-3">{today}</p>
          <h1 className="mt-2 text-display">{duty.resumable ? 'Welcome back!' : 'Ready for the gate?'}</h1>
          <p className="mx-auto mt-3 max-w-[44ch] text-lead text-ink-2 shorter:mt-2 shorter:text-body landscape:lg:mx-0">
            {since
              ? `You've been on duty since ${since}. Tap Resume to turn announcements back on.`
              : 'This device will announce every pickup and drop-off, and keep its screen on until you finish.'}
          </p>
        </section>

        <div className="landscape:lg:col-start-1 landscape:lg:row-start-2 landscape:lg:self-start"><TodayStrip /></div>
        <section aria-labelledby="checks-title" className="landscape:lg:col-start-2 landscape:lg:row-span-2 landscape:lg:row-start-1 landscape:lg:self-center">
          <h2 id="checks-title" className="kicker mb-3">Before you start</h2>
          <ul className="grid gap-4 short:gap-3 sm:grid-cols-2">
            {installed ? (
              <Tile tone="ok" icon={<CircleCheck />} title="On the Home Screen" extra={<div className="rounded-lg bg-sunken px-3.5"><PushSwitch label="Alerts when locked" /></div>}>
                Opened from the Home Screen, so alerts can reach this device when it's locked.
              </Tile>
            ) : (
              <Tile tone="warn" icon={<TriangleAlert />} title="Add to the Home Screen">
                Choose Add to Home Screen in the browser's menu (on an iPad: Share), then open Jumpstart from there.
              </Tile>
            )}
            {duty.wakeSupported ? (
              <Tile tone="ok" icon={<CircleCheck />} title="Screen stays on">While you're on duty, this screen won't go to sleep.</Tile>
            ) : (
              <Tile tone="warn" icon={<TriangleAlert />} title="Keep the screen on">In the device's settings, set the screen to never turn off (on an iPad: Display &amp; Brightness → Auto-Lock → Never).</Tile>
            )}
            {duty.soundSupported ? (
              <Tile tone="info" icon={<Volume2 />} title="Sound check">
                A short test plays when you start. Turn the volume up.
              </Tile>
            ) : (
              <Tile tone="error" icon={<TriangleAlert />} title="Can't play sound here">Open Jumpstart in Chrome or Safari on the gate tablet.</Tile>
            )}
            {online ? (
              <Tile tone="ok" icon={<Wifi />} title="Connected">New requests arrive the moment a parent makes them.</Tile>
            ) : (
              <Tile tone="error" icon={<TriangleAlert />} title="No internet">Announcements need Wi-Fi or mobile data. Check the connection.</Tile>
            )}
          </ul>
          <div className="mt-8 hidden short:mt-5 landscape:lg:block">{start}</div>
        </section>
      </div>
    </Shell>
  )
}
