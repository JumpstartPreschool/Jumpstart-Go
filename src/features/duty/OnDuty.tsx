import { useRef } from 'react'
import { AudioLines, Bell, BellOff, LogOut, Sun, TriangleAlert, Volume2, WifiOff } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Logo } from '../../ui/Logo'
import { useNow } from '../../ui/hooks'
import { formatTime, indiaClock } from '../../domain/time'
import type { Duty } from './useDuty'

const clock = (ms: number) => formatTime(indiaClock(new Date(ms)).minutes)

export function OnDuty({ duty, online }: { duty: Duty; online: boolean }) {
  const now = useNow(1000)
  const endDialog = useRef<HTMLDialogElement>(null)
  const { speaking, waiting, mutedUntil } = duty.ann

  return (
    <div className="min-h-dvh pb-[env(safe-area-inset-bottom)]">
      {/* Floating glass bar: duty status, clock and the controls a coordinator needs mid-shift. */}
      <header className="sticky top-0 z-10 px-4 pt-[max(12px,env(safe-area-inset-top))] sm:px-6">
        <div className="glass flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[30px] py-3 pl-5 pr-3">
          <Logo className="hidden h-10 md:block" />
          <span className="flex items-center gap-2.5 rounded-full bg-live-soft py-2 pl-3 pr-4 text-live">
            <span className="relative flex size-3" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-50" />
              <span className="relative inline-flex size-3 rounded-full bg-live" />
            </span>
            <span className="leading-tight">
              <span className="block text-[16px] font-extrabold">On duty</span>
              <span className="block text-[12px] font-bold opacity-80">since {duty.since ? clock(duty.since) : '—'}</span>
            </span>
          </span>
          <p className="ml-auto font-display text-[34px] font-bold leading-none tabular-nums" aria-label={`Time ${clock(now)}`}>
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
            <Button size="md" variant="quiet" icon={<LogOut />} onClick={() => endDialog.current?.showModal()}>
              End duty
            </Button>
          </div>
        </div>

        {!online && (
          <div role="alert" className="mt-3 flex items-center gap-3 rounded-[24px] bg-danger-strong px-5 py-4 text-[17px] font-extrabold text-white shadow-2">
            <WifiOff className="size-6 shrink-0" aria-hidden />
            Offline. Announcements are paused until the connection is back.
          </div>
        )}
        {online && duty.wakeSupported && !duty.screenHeld && (
          <button
            type="button"
            onClick={() => void duty.retryWake()}
            className="mt-3 flex w-full items-center gap-3 rounded-[24px] bg-flag-soft px-5 py-4 text-left text-[17px] font-extrabold text-flag ring-1 ring-inset ring-flag/20"
          >
            <TriangleAlert className="size-6 shrink-0" aria-hidden />
            The screen may turn off. Tap here to keep it on.
          </button>
        )}

        {/* Now playing: what the iPad is saying, so a coordinator who missed it can read it. */}
        <div className="glass relative mt-3 flex min-h-[72px] items-center gap-4 overflow-hidden rounded-[26px] px-5 py-3" aria-live="polite">
          {speaking ? (
            <>
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[var(--accent-glow)]">
                <AudioLines className="size-6 animate-pulse" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-accent-ink">Now announcing</p>
                <p className="truncate text-[18px] font-bold">{speaking.text}</p>
              </div>
              {waiting > 0 && <p className="ml-auto shrink-0 rounded-full bg-sunken px-3 py-1 text-[14px] font-bold text-ink-2">{waiting} waiting</p>}
              <span className="rainbow-bar absolute inset-x-0 bottom-0 h-1 animate-pulse" aria-hidden />
            </>
          ) : mutedUntil ? (
            <>
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-flag-soft text-flag"><BellOff className="size-6" aria-hidden /></span>
              <p className="text-[17px] font-bold">
                Muted until {clock(mutedUntil)}
                {waiting > 0 && <span className="text-ink-2"> · {waiting} waiting</span>}
              </p>
            </>
          ) : (
            <>
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sunken text-ink-3"><Bell className="size-6" aria-hidden /></span>
              <p className="text-[17px] font-semibold text-ink-2">Announcements will play here.</p>
              {duty.screenHeld && (
                <span className="ml-auto flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1 text-[13px] font-bold text-ink-2">
                  <Sun className="size-4" aria-hidden /> Screen on
                </span>
              )}
            </>
          )}
        </div>
      </header>

      <main className="px-4 pt-6 sm:px-6">
        <section className="card rounded-[30px] p-6 sm:p-8">
          <h2 className="text-[26px] font-bold">Gate queue</h2>
          {import.meta.env.DEV && (
            <p className="mt-1 text-[15px] text-ink-2">Development build: the live queue connects to the school server in milestone M3.</p>
          )}
          <Button className="mt-5" size="lg" variant="secondary" icon={<Volume2 />} loading={duty.testing} disabled={!!speaking} onClick={() => void duty.playTest()}>
            Test the speaker
          </Button>
        </section>
      </main>

      <dialog
        ref={endDialog}
        className="card m-auto w-[min(460px,calc(100vw-32px))] rounded-[32px] p-0 text-ink"
        onClick={(e) => e.target === e.currentTarget && endDialog.current?.close()}
      >
        <div className="p-7 sm:p-8">
          <h2 className="text-[26px] font-bold">End your duty?</h2>
          <p className="mt-2 text-[17px] leading-6 text-ink-2">Announcements will stop on this iPad. Coordinators still on duty will keep hearing them.</p>
          <div className="mt-7 grid gap-3">
            <Button
              variant="danger"
              icon={<LogOut />}
              onClick={() => {
                endDialog.current?.close()
                duty.end()
              }}
            >
              End duty
            </Button>
            <Button variant="secondary" autoFocus onClick={() => endDialog.current?.close()}>
              Stay on duty
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
