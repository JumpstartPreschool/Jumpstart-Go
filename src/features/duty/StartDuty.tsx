import type { ReactNode } from 'react'
import { CircleCheck, MapPin, Play, Power, RotateCcw, TriangleAlert, Volume2, Wifi } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Logo, Mascot } from '../../ui/Logo'
import { Pill } from '../../ui/Pill'
import { isInstalled } from '../../ui/hooks'
import { formatTime, indiaClock } from '../../domain/time'
import type { Duty } from './useDuty'

type Tone = 'ok' | 'warn' | 'error' | 'info'

const toneStyle: Record<Tone, string> = {
  ok: 'bg-live-soft text-live',
  warn: 'bg-warning-soft text-warning',
  error: 'bg-danger-soft text-danger',
  info: 'bg-accent-soft text-accent',
}

function CheckRow({ tone, icon, title, children }: { tone: Tone; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 py-4 first:pt-0 last:pb-0">
      <span className={`grid size-12 shrink-0 place-items-center rounded-md [&_svg]:size-6 ${toneStyle[tone]}`} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-h4">{title}</p>
        <p className="mt-0.5 text-body text-ink-2">{children}</p>
      </div>
    </li>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="gutter mx-auto grid min-h-dvh w-full max-w-[calc(1120px+2*var(--gutter))] items-center pt-[max(80px,calc(env(safe-area-inset-top)+72px))] pb-[max(28px,env(safe-area-inset-bottom))] lg:pt-[max(32px,calc(env(safe-area-inset-top)+20px))]">
      {children}
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
              <li>Turn the volume up with the buttons on the side of the iPad.</li>
              <li>Open Control Center and turn off Silent Mode.</li>
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

  return (
    <Shell>
      <div className="page-in grid items-center gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
        <section className="text-center lg:text-left">
          <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Logo className="h-12 sm:h-14" />
            <Pill icon={<MapPin />}>Karve Road</Pill>
          </div>
          <Mascot size={128} className="mx-auto mt-6 lg:mx-0 lg:mt-10" />
          <h1 className="mt-4 text-display">
            {duty.resumable ? 'Welcome back!' : 'Ready for the gate?'}
          </h1>
          <p className="mx-auto mt-3 max-w-[46ch] text-lead text-ink-2 lg:mx-0">
            {since
              ? `You've been on duty since ${since}. Tap below to turn announcements back on.`
              : 'Start your duty and this iPad will announce every pickup and drop-off, and keep its screen on until you finish.'}
          </p>
        </section>

        <section>
          <ul className="card divide-y divide-line rounded-2xl p-6 sm:p-7">
            {installed ? (
              <CheckRow tone="ok" icon={<CircleCheck />} title="Opened from the Home Screen">
                Alerts can reach this iPad even when it's locked.
              </CheckRow>
            ) : (
              <CheckRow tone="warn" icon={<TriangleAlert />} title="Add Jumpstart to the Home Screen">
                In Safari, tap Share, then Add to Home Screen, and open Jumpstart from there. It keeps the screen on reliably and lets alerts reach a locked iPad.
              </CheckRow>
            )}
            {duty.wakeSupported ? (
              <CheckRow tone="ok" icon={<CircleCheck />} title="The screen stays on">
                While you're on duty, this iPad won't go to sleep.
              </CheckRow>
            ) : (
              <CheckRow tone="warn" icon={<TriangleAlert />} title="Set the screen to stay on">
                This iPad can't keep the screen on by itself. Go to Settings → Display &amp; Brightness → Auto-Lock → Never.
              </CheckRow>
            )}
            {duty.soundSupported ? (
              <CheckRow tone="info" icon={<Volume2 />} title="Sound check">
                A short test plays when you start. Turn the volume up.
              </CheckRow>
            ) : (
              <CheckRow tone="error" icon={<TriangleAlert />} title="This browser can't play announcements">
                Open Jumpstart in Safari on the iPad.
              </CheckRow>
            )}
            {online ? (
              <CheckRow tone="ok" icon={<Wifi />} title="Connected">
                New requests arrive the moment a parent makes them.
              </CheckRow>
            ) : (
              <CheckRow tone="error" icon={<TriangleAlert />} title="No internet connection">
                Announcements need Wi-Fi or mobile data. Check the connection.
              </CheckRow>
            )}
          </ul>
          <Button size="xl" className="mt-6 w-full" icon={duty.resumable ? <Play /> : <Power />} disabled={!duty.soundSupported} onClick={duty.start}>
            {duty.resumable ? 'Resume duty' : 'Start duty'}
          </Button>
        </section>
      </div>
    </Shell>
  )
}
