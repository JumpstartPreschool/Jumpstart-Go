import { useState } from 'react'
import { AudioLines, Bell, BellOff, LogOut, Sun, TriangleAlert, Volume2, WifiOff } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Logo } from '../../ui/Logo'
import { Pill } from '../../ui/Pill'
import { Sheet } from '../../ui/Sheet'
import { useNow } from '../../ui/hooks'
import { formatTime, indiaClock } from '../../domain/time'
import type { Duty } from './useDuty'
import { VoicePicker } from './VoicePicker'
import { GateQueue } from './GateQueue'

const clock = (ms: number) => formatTime(indiaClock(new Date(ms)).minutes)

export function OnDuty({ duty, online }: { duty: Duty; online: boolean }) {
  const now = useNow(1000)
  const [ending, setEnding] = useState(false)
  const [voicesOpen, setVoicesOpen] = useState(false)
  const { speaking, waiting, mutedUntil } = duty.ann

  return (
    <div className="screen-h pb-[env(safe-area-inset-bottom)]">
      {/* Floating bar: duty status, clock and the controls a coordinator needs mid-shift. */}
      <header className="gutter sticky top-0 z-10 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="glass flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl py-2.5 pl-4 pr-2.5 sm:pl-5">
          <Logo className="hidden h-9 md:block" />
          <span className="flex items-center gap-2.5 rounded-full bg-live-soft py-2 pl-3 pr-4 text-live">
            <span className="relative flex size-3" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-50" />
              <span className="relative inline-flex size-3 rounded-full bg-live" />
            </span>
            <span className="leading-tight">
              <span className="block text-small font-extrabold">On duty</span>
              <span className="block text-label font-bold opacity-85">since {duty.since ? clock(duty.since) : 'now'}</span>
            </span>
          </span>
          <p className="ml-auto text-[32px] font-extrabold leading-none tracking-[-0.03em] tabular-nums" aria-label={`Time ${clock(now)}`}>
            {clock(now)}
          </p>
          <div className="flex items-center gap-2">
            {mutedUntil ? (
              <Button size="md" variant="sunshine" icon={<Bell />} onClick={duty.unmute}>
                Unmute
              </Button>
            ) : (
              <Button size="md" variant="secondary" icon={<BellOff />} onClick={duty.mute}>
                Mute 5 min
              </Button>
            )}
            <Button size="md" variant="quiet" icon={<LogOut />} onClick={() => setEnding(true)}>
              End duty
            </Button>
          </div>
        </div>

        {!online && (
          <div role="alert" className="mt-3 flex items-center gap-3 rounded-lg bg-danger-strong px-5 py-4 text-h4 text-white shadow-float">
            <WifiOff className="size-6 shrink-0" aria-hidden />
            Offline. Announcements are paused until the connection is back.
          </div>
        )}
        {online && duty.wakeSupported && !duty.screenHeld && (
          <button
            type="button"
            onClick={() => void duty.retryWake()}
            className="mt-3 flex w-full items-center gap-3 rounded-lg bg-warning-soft px-5 py-4 text-left text-h4 text-warning shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--warning)_25%,transparent)]"
          >
            <TriangleAlert className="size-6 shrink-0" aria-hidden />
            The screen may turn off. Tap here to keep it on.
          </button>
        )}

        {/* Now playing: what the iPad is saying, so a coordinator who missed it can read it. */}
        <div className="glass relative mt-3 flex min-h-[72px] items-center gap-4 overflow-hidden rounded-xl px-4 py-3 sm:px-5" aria-live="polite">
          {speaking ? (
            <>
              <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-accent text-on-accent shadow-[0_3px_0_var(--accent-lip)]">
                <AudioLines className="size-6 animate-pulse" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="kicker text-accent-ink!">Now announcing</p>
                <p className="truncate text-h4">{speaking.text}</p>
              </div>
              {waiting > 0 && <Pill className="ml-auto">{waiting} waiting</Pill>}
              <span className="rainbow-bar absolute inset-x-0 bottom-0 h-1 animate-pulse" aria-hidden />
            </>
          ) : mutedUntil ? (
            <>
              <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-warning-soft text-warning"><BellOff className="size-6" aria-hidden /></span>
              <p className="text-h4">
                Muted until {clock(mutedUntil)}
                {waiting > 0 && <span className="text-ink-2"> · {waiting} waiting</span>}
              </p>
            </>
          ) : (
            <>
              <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-sunken text-ink-3"><Bell className="size-6" aria-hidden /></span>
              <p className="text-body font-semibold text-ink-2">Announcements will play here.</p>
              {duty.screenHeld && <Pill className="ml-auto" icon={<Sun />}>Screen on</Pill>}
            </>
          )}
        </div>
      </header>

      <main className="gutter pt-6">
        <GateQueue announcer={duty.announcer} />
        <section className="mt-8 flex flex-wrap items-center gap-2.5 border-t border-line pt-5" aria-label="Sound">
          <Button size="md" variant="secondary" icon={<Volume2 />} loading={duty.testing} disabled={!!speaking} onClick={() => void duty.playTest()}>
            Test the speaker
          </Button>
          <Button size="md" variant="quiet" icon={<AudioLines />} disabled={!!speaking || duty.testing} onClick={() => setVoicesOpen(true)}>
            Change voice
          </Button>
          <p className="text-caption font-semibold text-ink-3">Sound plays through the iPad's speaker, or a Bluetooth speaker when one is connected.</p>
        </section>
      </main>

      <VoicePicker open={voicesOpen} onClose={() => setVoicesOpen(false)} />
      <Sheet open={ending} onClose={() => setEnding(false)} title="End your duty?" description="Announcements will stop on this iPad. Coordinators still on duty will keep hearing them.">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Button variant="secondary" autoFocus onClick={() => setEnding(false)}>
            Stay on duty
          </Button>
          <Button variant="danger" icon={<LogOut />} onClick={() => { setEnding(false); duty.end() }}>
            End duty
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
