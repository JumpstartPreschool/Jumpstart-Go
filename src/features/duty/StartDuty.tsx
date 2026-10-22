import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, BellRing, CircleCheck, Clock, MapPin, PowerLine, RotateCcw, TriangleAlert, Volume2, Wifi } from '../../ui/icons'
import { DeviceReadiness } from '../notifications/DeviceReadiness'
import { pushState, pushTurnedOff, turnOffPush, turnOnPush, type PushState } from '../notifications/push'
import { isNativeAndroid } from '../../native/duty'
import { ScreenOffSwitch, type Platform } from './ScreenOffSwitch'
import { useToast } from '../../ui/Toast'
import { Button } from '../../ui/Button'
import { Notice } from '../../ui/States'
import { Logo, Mascot } from '../../ui/Logo'
import { Pill } from '../../ui/Pill'
import { isInstalled } from '../../ui/hooks'
import { formatTime, indiaClock } from '../../domain/time'
import type { Duty, SoundResult } from './useDuty'
import { useTodayTrips } from '../trips/api'
import { now } from '../../lib/clock'
import { SOUND_CHECK } from '../../../supabase/functions/_shared/gateAnnounce.ts'

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

/** Nothing could play at all: the chime didn't sound and neither voice spoke. Duty can't start on a silent device. */
const nothingPlayed = (r: SoundResult | null) => !!r && !r.chime && r.voice === 'silent'

/** What the sound check really played, said plainly, so a silent device is never reported as working. */
export function SoundResultLine({ result }: { result: SoundResult }) {
  const [tone, text] = nothingPlayed(result)
    ? ['bg-danger-soft text-danger', "No sound could play. Tap Play again; if it stays silent, turn the volume up, switch off silent mode, and reopen Jumpstart Go from the Home Screen."]
    : result.voice === 'cut' ? ['bg-danger-soft text-danger', "The test sentence was cut off before the end. Tap Play again. If it keeps stopping, close other apps playing sound, then reopen Jumpstart Go from the Home Screen."]
    : result.voice === 'school' ? ['bg-live-soft text-live', `Played: ${result.chime ? 'the chime and ' : ''}the school's voice.`]
    : result.voice === 'device' ? ['bg-warning-soft text-warning', `Played: ${result.chime ? 'the chime and ' : ''}this tablet's own voice. The school's voice wasn't ready; announcements still play.`]
    : ['bg-warning-soft text-warning', 'Played: the chime only. No voice is available on this tablet, so names show on screen.']
  return <p className={`mt-4 rounded-lg px-4 py-3 text-left text-small font-bold ${tone}`} role="status">{text}</p>
}

const platform = (): Platform =>
  isNativeAndroid() ? 'android-app'
    : /iPhone|iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? 'apple' : 'web'

/** Alerts reach a locked screen only through push, so duty starts with it on (or a deliberate choice to go without). */
const PUSH_BLOCKS: PushState[] = ['off', 'denied', 'needs-install']

function PushGate({ state, onTurnOn, busy, onSkip }: { state: PushState; onTurnOn: () => void; busy: boolean; onSkip: () => void }) {
  const steps = state === 'denied'
    ? 'Notifications are blocked for Jumpstart Go. Open this device\'s Settings, find Jumpstart Go (or the browser), choose Notifications and allow them. Then come back to this screen.'
    : state === 'needs-install'
      ? 'On an iPhone or iPad, alerts only work from the Home Screen app. Tap Share, then Add to Home Screen, then open Jumpstart Go from the Home Screen and sign in again.'
      : 'Without notifications, a locked or sleeping screen will not tell you when a parent is on the way. Turn them on for this device.'
  return (
    <li className="card flex flex-col gap-3 rounded-xl border-2 border-warning p-5 sm:col-span-2 short:p-4" role="alert">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-warning-soft text-warning [&_svg]:size-[22px]" aria-hidden><BellRing /></span>
        <p className="text-h4">Turn on notifications to start duty</p>
      </div>
      <p className="text-body text-ink-2 short:text-small">{steps}</p>
      {state === 'off' && <Button size="lg" variant="primary" icon={<BellRing />} loading={busy} onClick={onTurnOn}>Turn on notifications</Button>}
      <Button size="md" variant="quiet" onClick={onSkip}>Start without notifications</Button>
    </li>
  )
}

export function StartDuty({ duty, online }: { duty: Duty; online: boolean }) {
  const installed = isInstalled()
  const toast = useToast()
  const [push, setPush] = useState<PushState | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [withoutPush, setWithoutPush] = useState(false)
  // Switched off on purpose (the switch below): duty starts without asking, and announcements play only on screen.
  const [chosenOff, setChosenOff] = useState(pushTurnedOff)
  useEffect(() => { void pushState().then(setPush, () => setPush('unsupported')) }, [])
  const pushBlocked = !withoutPush && !chosenOff && (push === null || PUSH_BLOCKS.includes(push))
  async function turnOn() {
    setPushBusy(true)
    try { setPush(await turnOnPush()); setChosenOff(false) } catch { toast("Couldn't turn on notifications. Try again.") } finally { setPushBusy(false) }
  }
  async function screenOff(on: boolean) {
    if (on) return turnOn()
    setPushBusy(true)
    try { setPush(await turnOffPush(true)); setChosenOff(true) } catch { toast("Couldn't turn it off. Try again.") } finally { setPushBusy(false) }
  }

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
            {duty.testing ? `Playing a chime and "${SOUND_CHECK}"` : `You should have heard a chime, then "${SOUND_CHECK}"`}
          </p>
          {!duty.testing && duty.result && <SoundResultLine result={duty.result} />}
          {struggling && (
            <ul className="mt-6 grid list-disc gap-1.5 rounded-lg bg-warning-soft p-5 pl-9 text-left text-body text-ink marker:text-warning">
              <li>Turn the volume up with the device's volume buttons.</li>
              <li>Turn off silent or Do Not Disturb mode.</li>
              <li>If a Bluetooth speaker is connected, check that it's switched on.</li>
            </ul>
          )}
          <div className="mt-8 grid gap-3">
            {duty.error && <Notice tone="danger">{duty.error}</Notice>}
            <Button size="xl" variant="success" icon={<CircleCheck />} onClick={() => void duty.confirmHeard()} loading={duty.changing} disabled={duty.testing || nothingPlayed(duty.result)}>
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

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })
  const start = (
    <div className="mx-auto w-full max-w-[760px] landscape:lg:max-w-none">
      <button type="button" className="dutybtn" disabled={!duty.soundSupported || pushBlocked} onClick={duty.start}>
        <span className="dutybtn-icon" aria-hidden><PowerLine /></span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[19px] font-extrabold leading-tight tracking-[-0.01em]">Start duty</span>
          <span className="block text-small font-semibold">Stays on when you switch apps or lock the screen, until you pause or end it</span>
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
          <h1 className="mt-2 text-display">Ready for the gate?</h1>
          <p className="mx-auto mt-3 max-w-[44ch] text-lead text-ink-2 shorter:mt-2 shorter:text-body landscape:lg:mx-0">
            This device will announce every pickup and drop-off, and keep its screen on until you finish.
          </p>
        </section>

        <div className="landscape:lg:col-start-1 landscape:lg:row-start-2 landscape:lg:self-start"><TodayStrip /></div>
        <section aria-labelledby="checks-title" className="landscape:lg:col-start-2 landscape:lg:row-span-2 landscape:lg:row-start-1 landscape:lg:self-center">
          <h2 id="checks-title" className="kicker mb-3">Before you start</h2>
          <ul className="grid gap-4 short:gap-3 sm:grid-cols-2">
            {(push === 'on' || (push === 'off' && (chosenOff || withoutPush))) && <ScreenOffSwitch state={push} platform={platform()} busy={pushBusy} onChange={(v) => void screenOff(v)} />}
            {push && PUSH_BLOCKS.includes(push) && !withoutPush && !chosenOff && <PushGate state={push} busy={pushBusy} onTurnOn={() => void turnOn()} onSkip={() => setWithoutPush(true)} />}
            {/* Only once notifications are on: proof they reach this device, never a prompt every morning. */}
            {push === 'on' && <li className="card rounded-xl p-5 sm:col-span-2 short:p-4"><DeviceReadiness /></li>}
            {(push === 'unsupported' || push === 'not-configured') && (
              <Tile tone="warn" icon={<TriangleAlert />} title="Notifications are not available">
                This device cannot receive alerts while it is locked, so keep Jumpstart Go open and the screen on. Updates still show in the app.
              </Tile>
            )}
            {installed ? (
              <Tile tone="ok" icon={<CircleCheck />} title="On the Home Screen">
                Opened from the Home Screen, so alerts can reach this device when it's locked.
              </Tile>
            ) : (
              <Tile tone="warn" icon={<TriangleAlert />} title="Add to the Home Screen">
                Choose Add to Home Screen in the browser's menu (on an iPad: Share), then open Jumpstart Go from there.
              </Tile>
            )}
            {duty.wakeSupported ? (
              <Tile tone="ok" icon={<CircleCheck />} title="Screen stays on">While you're on duty, this screen won't go to sleep.</Tile>
            ) : (
              <Tile tone="warn" icon={<TriangleAlert />} title="Keep the screen on">Otherwise it locks and announcements stop. On an iPhone or iPad: Settings → Display &amp; Brightness → Auto-Lock → Never.</Tile>
            )}
            {duty.soundSupported ? (
              <Tile tone="info" icon={<Volume2 />} title="Sound check">
                A short test plays when you start. Turn the volume up.
              </Tile>
            ) : (
              <Tile tone="error" icon={<TriangleAlert />} title="Can't play sound here">Open Jumpstart Go in Chrome or Safari on the gate tablet.</Tile>
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
