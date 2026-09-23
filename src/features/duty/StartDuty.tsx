import type { ReactNode } from 'react'
import { CircleCheck, Play, Power, RotateCcw, TriangleAlert, Volume2 } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Logo } from '../../ui/Logo'
import { isInstalled } from '../../ui/hooks'
import { formatTime, indiaClock } from '../../domain/time'
import type { Duty } from './useDuty'

type Tone = 'ok' | 'warn' | 'error' | 'info'

const toneStyle: Record<Tone, string> = {
  ok: 'bg-live-soft text-live',
  warn: 'bg-flag-soft text-flag',
  error: 'bg-danger-soft text-danger',
  info: 'bg-sunken text-ink-2',
}

function CheckRow({ tone, icon, title, children }: { tone: Tone; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 py-4 first:pt-0 last:pb-0">
      <span className={`grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-5 ${toneStyle[tone]}`} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[17px] font-semibold leading-6">{title}</p>
        <p className="mt-0.5 text-[15px] leading-[22px] text-ink-2">{children}</p>
      </div>
    </li>
  )
}

export function StartDuty({ duty, online }: { duty: Duty; online: boolean }) {
  const installed = isInstalled()

  if (duty.phase === 'check') {
    const struggling = duty.testsPlayed >= 2 && !duty.testing
    return (
      <Shell>
        <div className={`mx-auto grid size-20 place-items-center rounded-full bg-accent/10 text-accent ${duty.testing ? 'animate-pulse' : ''}`}>
          <Volume2 className="size-9" aria-hidden />
        </div>
        <h1 className="mt-6 text-center text-[30px] font-semibold leading-9 tracking-[-0.02em]">Did you hear the test?</h1>
        <p className="mt-2 text-center text-[17px] leading-6 text-ink-2" aria-live="polite">
          {duty.testing ? 'Playing a chime and "Sound check. Announcements are on."' : 'You should have heard a chime, then "Sound check. Announcements are on."'}
        </p>
        {struggling && (
          <ul className="mt-6 space-y-1.5 rounded-2xl bg-flag-soft p-5 text-[15px] leading-[22px] text-ink">
            <li>• Turn the volume up with the buttons on the side of the iPad.</li>
            <li>• Open Control Center and turn off Silent Mode.</li>
            <li>• If a Bluetooth speaker is connected, check that it's switched on.</li>
          </ul>
        )}
        <div className="mt-8 grid gap-3">
          <Button size="xl" icon={<CircleCheck />} onClick={duty.confirmHeard} disabled={duty.testing}>
            Yes, I heard it
          </Button>
          <Button size="lg" variant="secondary" icon={<RotateCcw />} loading={duty.testing} onClick={() => void duty.playTest()}>
            Play again
          </Button>
          <Button size="md" variant="quiet" onClick={duty.back}>
            Back
          </Button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="flex items-center gap-3 text-[15px] font-semibold text-ink-2">
        <Logo className="h-10" />
        <span className="h-6 w-px bg-line-strong" aria-hidden />
        Karve Road
      </div>
      <h1 className="mt-5 text-[34px] font-semibold leading-10 tracking-[-0.02em]">{duty.resumable ? 'Resume your duty' : 'Start your duty'}</h1>
      <p className="mt-2 text-[17px] leading-6 text-ink-2">
        {duty.resumable && duty.since
          ? `You've been on duty since ${formatTime(indiaClock(new Date(duty.since)).minutes)}. Tap below to turn announcements back on.`
          : 'Announcements will play on this iPad, and the screen will stay on until you end your duty.'}
      </p>

      <ul className="mt-8 divide-y divide-line rounded-[22px] bg-surface p-5 shadow-1 ring-1 ring-line">
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
          <CheckRow tone="ok" icon={<CircleCheck />} title="Connected">
            New requests will arrive the moment a parent makes them.
          </CheckRow>
        ) : (
          <CheckRow tone="error" icon={<TriangleAlert />} title="No internet connection">
            Announcements need Wi-Fi or mobile data. Check the connection.
          </CheckRow>
        )}
      </ul>

      <Button size="xl" className="mt-8 w-full" icon={duty.resumable ? <Play /> : <Power />} disabled={!duty.soundSupported} onClick={duty.start}>
        {duty.resumable ? 'Resume duty' : 'Start duty'}
      </Button>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 pt-[max(40px,env(safe-area-inset-top))] pb-[max(40px,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-[560px]">{children}</div>
    </main>
  )
}
