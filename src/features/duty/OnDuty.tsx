import { useRef } from 'react'
import { AudioLines, Bell, BellOff, LogOut, Sun, TriangleAlert, Volume2, WifiOff } from 'lucide-react'
import { Button } from '../../ui/Button'
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
        <div className="glass flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[22px] py-2.5 pl-5 pr-2.5">
          <div className="flex items-center gap-3">
            <span className="relative flex size-3" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-40" />
              <span className="relative inline-flex size-3 rounded-full bg-live" />
            </span>
            <div className="leading-tight">
              <p className="text-[17px] font-semibold">On duty</p>
              <p className="text-[13px] text-ink-2">since {duty.since ? clock(duty.since) : '—'}</p>
            </div>
          </div>
          <p className="ml-auto text-[28px] font-semibold tabular-nums tracking-[-0.02em]" aria-label={`Time ${clock(now)}`}>
            {clock(now)}
          </p>
          <div className="flex items-center gap-1.5">
            {mutedUntil ? (
              <Button size="md" variant="secondary" icon={<Bell />} onClick={duty.unmute}>
                Unmute
              </Button>
            ) : (
              <Button size="md" variant="quiet" icon={<BellOff />} onClick={duty.mute}>
                Mute 5 min
              </Button>
            )}
            <Button size="md" variant="quiet" icon={<LogOut />} onClick={() => endDialog.current?.showModal()}>
              End duty
            </Button>
          </div>
        </div>

        {!online && (
          <div role="alert" className="mt-3 flex items-center gap-3 rounded-[18px] bg-danger-strong px-5 py-4 text-[17px] font-semibold text-white shadow-2">
            <WifiOff className="size-6 shrink-0" aria-hidden />
            Offline. Announcements are paused until the connection is back.
          </div>
        )}
        {online && duty.wakeSupported && !duty.screenHeld && (
          <button
            type="button"
            onClick={() => void duty.retryWake()}
            className="mt-3 flex w-full items-center gap-3 rounded-[18px] bg-flag-soft px-5 py-4 text-left text-[17px] font-semibold text-flag ring-1 ring-flag/20"
          >
            <TriangleAlert className="size-6 shrink-0" aria-hidden />
            The screen may turn off. Tap here to keep it on.
          </button>
        )}

        {/* Now playing: what the iPad is saying, so a coordinator who missed it can read it. */}
        <div className="glass mt-3 flex min-h-16 items-center gap-4 rounded-[20px] px-5 py-3" aria-live="polite">
          {speaking ? (
            <>
              <AudioLines className="size-6 shrink-0 animate-pulse text-accent" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-accent">Now announcing</p>
                <p className="truncate text-[17px] font-medium">{speaking.text}</p>
              </div>
              {waiting > 0 && <p className="ml-auto shrink-0 text-[15px] text-ink-2">{waiting} waiting</p>}
            </>
          ) : mutedUntil ? (
            <>
              <BellOff className="size-6 shrink-0 text-flag" aria-hidden />
              <p className="text-[17px] font-medium">
                Muted until {clock(mutedUntil)}
                {waiting > 0 && <span className="text-ink-2"> · {waiting} waiting</span>}
              </p>
            </>
          ) : (
            <>
              <Bell className="size-6 shrink-0 text-ink-3" aria-hidden />
              <p className="text-[17px] text-ink-2">Announcements will play here.</p>
              {duty.screenHeld && (
                <span className="ml-auto flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
                  <Sun className="size-4" aria-hidden /> Screen on
                </span>
              )}
            </>
          )}
        </div>
      </header>

      <main className="px-4 pt-6 sm:px-6">
        <section className="rounded-[22px] bg-surface p-6 shadow-1 ring-1 ring-line">
          <h2 className="text-[22px] font-semibold tracking-[-0.01em]">Gate queue</h2>
          {import.meta.env.DEV && (
            <p className="mt-2 text-[15px] text-ink-2">Development build: the live queue connects to the school server in milestone M3.</p>
          )}
          <Button className="mt-5" size="lg" variant="secondary" icon={<Volume2 />} loading={duty.testing} disabled={!!speaking} onClick={() => void duty.playTest()}>
            Test the speaker
          </Button>
        </section>
      </main>

      <dialog
        ref={endDialog}
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[26px] bg-surface p-0 text-ink shadow-2 ring-1 ring-line"
        onClick={(e) => e.target === e.currentTarget && endDialog.current?.close()}
      >
        <div className="p-7">
          <h2 className="text-[22px] font-semibold tracking-[-0.01em]">End your duty?</h2>
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
