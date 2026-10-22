import { useEffect, useState } from 'react'
import { AudioLines, Bell, BellOff, PauseLine, PlayLine, PowerLine, Sun, TriangleAlert, Volume2, WifiOff } from '../../ui/icons'
import { Button, LuxButton } from '../../ui/Button'
import { Logo } from '../../ui/Logo'
import { Pill } from '../../ui/Pill'
import { Sheet } from '../../ui/Sheet'
import { useNow } from '../../ui/hooks'
import { formatTime, indiaClock } from '../../domain/time'
import type { Duty } from './useDuty'
import { GateQueue } from './GateQueue'
import { SpeakerSheet } from './SpeakerSheet'
import { DeliverySheet } from './DeliverySheet'
import { SoundResultLine } from './StartDuty'
import { NativeHealth } from '../../native/NativeHealth'
import { isNativeAndroid } from '../../native/duty'
import { onVoiceUsed, type VoiceUsed } from './sound'
import { DutyStatus } from './DutyStatus'
import { Notice } from '../../ui/States'

const clock = (ms: number) => formatTime(indiaClock(new Date(ms)).minutes)
const hours = (ms: number) => { const m = Math.max(1, Math.round(ms / 60_000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min` }

export function OnDuty({ duty, online }: { duty: Duty; online: boolean }) {
  const now = useNow(1000)
  const [ending, setEnding] = useState(false)
  const [speaker, setSpeaker] = useState(false)
  const [delivery, setDelivery] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const { speaking, waiting, mutedUntil } = duty.ann
  const paused = duty.phase === 'paused'
  // Which voice the last announcement used, and why when it wasn't the school's Indian voice.
  const [used, setUsed] = useState<VoiceUsed | null>(null)
  useEffect(() => onVoiceUsed(setUsed), [])

  return (
    <div className="screen-h">
      {/* Floating bar: duty status, clock and the controls a coordinator needs mid-shift. */}
      <header className="gutter sticky top-0 z-10 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="glass flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl p-3 sm:gap-y-2 sm:py-2.5 sm:pl-5 sm:pr-2.5">
          <Logo className="hidden h-9 md:block" />
          {paused ? (
            <span className="flex items-center gap-2.5 rounded-full bg-warning-soft py-2 pl-3 pr-4 text-warning" role="status">
              <PauseLine className="size-4" aria-hidden />
              <span className="leading-tight">
                <span className="block text-small font-extrabold">Duty paused</span>
                <span className="block text-label font-bold opacity-85">since {duty.duty?.paused_at ? clock(Date.parse(duty.duty.paused_at)) : 'now'}</span>
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-2.5 rounded-full bg-live-soft py-2 pl-3 pr-4 text-live" role="status">
              <span className="relative flex size-3" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-50 motion-reduce:animate-none" />
                <span className="relative inline-flex size-3 rounded-full bg-live" />
              </span>
              <span className="leading-tight">
                <span className="block text-small font-extrabold">On duty</span>
                <span className="block text-label font-bold opacity-85">since {duty.since ? clock(duty.since) : 'now'}</span>
              </span>
            </span>
          )}
          <p className="ml-auto text-[32px] font-extrabold leading-none tracking-[-0.03em] tabular-nums" aria-label={`Time ${clock(now)}`}>
            {clock(now)}
          </p>
          {/* Phones: an even row of three below the status (duty-actions in app.css); wider screens: inline at the right. */}
          <div className="duty-actions flex items-center gap-2">
            <LuxButton size="sm" icon={<Volume2 />} onClick={() => setSpeaker(true)} aria-haspopup="dialog">
              Speaker
            </LuxButton>
            {paused ? null : mutedUntil ? (
              <LuxButton size="sm" tone="sun" icon={<Bell />} onClick={duty.unmute}>
                Unmute
              </LuxButton>
            ) : (
              <LuxButton size="sm" icon={<BellOff />} onClick={duty.mute}>
                Mute 5 min
              </LuxButton>
            )}
            {paused ? (
              <LuxButton size="sm" tone="sun" icon={<PlayLine />} loading={duty.changing} onClick={() => void duty.resume()}>
                Resume duty
              </LuxButton>
            ) : (
              <LuxButton size="sm" icon={<PauseLine />} onClick={() => setPausing(true)} aria-haspopup="dialog">
                Pause duty
              </LuxButton>
            )}
            <button type="button" className="endduty" onClick={() => setEnding(true)}>
              <span aria-hidden><PowerLine /></span>
              End duty
            </button>
          </div>
        </div>

        {!online && (
          <div role="alert" className="mt-3 flex items-center gap-3 rounded-lg bg-danger-strong px-5 py-4 text-h4 text-white shadow-float">
            <WifiOff className="size-6 shrink-0" aria-hidden />
            Offline. You're still on duty; new requests arrive once the connection is back.
          </div>
        )}
        {online && !paused && duty.soundBlocked && (
          <button type="button" onClick={duty.resumeSound}
            className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-lg bg-danger-strong px-5 py-4 text-left text-h4 text-white shadow-float">
            <Volume2 className="size-6 shrink-0" aria-hidden />
            You're on duty, but this device needs one tap to play sound. Tap here to turn sound on.
          </button>
        )}
        {/* The Android app keeps announcing with the screen off (its duty service), so these screen warnings are for the web app only. */}
        {!duty.wakeSupported && !isNativeAndroid() && (
          <p role="status" className="mt-3 flex items-center gap-3 rounded-lg bg-warning-soft px-5 py-4 text-h4 text-warning shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--warning)_25%,transparent)]">
            <TriangleAlert className="size-6 shrink-0" aria-hidden />
            This device can't keep its screen on by itself. If it locks, announcements stop: set Auto-Lock to Never.
          </p>
        )}
        {online && duty.wakeSupported && !duty.screenHeld && !isNativeAndroid() && (
          <button
            type="button"
            onClick={() => void duty.retryWake()}
            className="mt-3 flex w-full items-center gap-3 rounded-lg bg-warning-soft px-5 py-4 text-left text-h4 text-warning shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--warning)_25%,transparent)]"
          >
            <TriangleAlert className="size-6 shrink-0" aria-hidden />
            The screen may turn off. Tap here to keep it on.
          </button>
        )}

        {duty.error && (
          <div className="mt-3" role="alert">
            <Notice tone="danger">{duty.error} <button type="button" className="ml-1 font-extrabold underline" onClick={duty.clearError}>Dismiss</button></Notice>
          </div>
        )}
        {paused && (
          <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-warning-soft px-5 py-4 text-warning shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--warning)_25%,transparent)]">
            <PauseLine className="size-6 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 text-h4">
              Your duty is paused. Requests stay on screen; alerts go to the rest of the gate team until you resume.
            </p>
            <Button icon={<PlayLine />} loading={duty.changing} onClick={() => void duty.resume()}>Resume duty</Button>
          </div>
        )}
        {duty.duty && <DutyStatus duty={duty.duty} unconfirmed={duty.unconfirmed} connectivity={duty.connectivity} used={used} />}

        <NativeHealth />

        {/* Now playing: what the iPad is saying, so a coordinator who missed it can read it. */}
        <div className={`relative mt-3 flex min-h-[72px] items-center gap-4 overflow-hidden rounded-xl px-4 py-3 sm:px-5 ${speaking?.urgent ? 'bg-danger-strong text-white shadow-float' : 'glass'}`} aria-live="polite">
          {speaking ? (
            <>
              <span className={`grid size-11 shrink-0 place-items-center rounded-sm ${speaking.urgent ? 'bg-white text-danger' : 'bg-accent text-on-accent shadow-[0_3px_0_var(--accent-lip)]'}`}>
                {speaking.urgent ? <TriangleAlert className="size-6" aria-hidden /> : <AudioLines className="size-6 animate-pulse" aria-hidden />}
              </span>
              <div className="min-w-0">
                <p className={`kicker ${speaking.urgent ? 'text-white!' : 'text-accent-ink!'}`}>{speaking.urgent ? 'Urgent · now announcing' : 'Now announcing'}</p>
                <p className="truncate text-h4">{typeof speaking.text === 'function' ? speaking.text() : speaking.text}</p>
              </div>
              {waiting > 0 && <Pill className="ml-auto">{waiting} waiting</Pill>}
              <span className="rainbow-bar absolute inset-x-0 bottom-0 h-1 animate-pulse" aria-hidden />
            </>
          ) : paused ? (
            <>
              <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-warning-soft text-warning"><PauseLine className="size-6" aria-hidden /></span>
              <p className="text-h4">
                Paused: announcements are held
                {waiting > 0 && <span className="text-ink-2"> · {waiting} waiting</span>}
              </p>
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
        {used && (
          <p className={`mt-2 px-1 text-caption font-bold ${used.voice === 'school' ? 'text-live' : 'text-warning'}`} aria-live="polite">
            {used.voice === 'school' ? `Last announcement at ${clock(used.at)}: the school's Indian voice.`
              : used.voice === 'device' ? `Last announcement at ${clock(used.at)}: this phone's own voice, because ${used.why}.`
              : `Last announcement at ${clock(used.at)} wasn't heard, because ${used.why}. It plays again shortly.`}
          </p>
        )}
      </header>

      <main className="gutter pt-6 pb-[max(32px,calc(env(safe-area-inset-bottom)+16px))]">
        <GateQueue announcer={duty.announcer} audible={!mutedUntil && !duty.soundBlocked} />
        <section className="mt-8 flex flex-wrap items-center gap-2.5 border-t border-line pt-5" aria-label="Sound">
          <LuxButton size="sm" icon={<Volume2 />} loading={duty.testing} disabled={!!speaking} onClick={() => void duty.playTest()}>
            Test the speaker
          </LuxButton>
          <LuxButton size="sm" icon={<Bell />} onClick={() => setDelivery(true)} aria-haspopup="dialog">
            Who gets alerts
          </LuxButton>
          <p className="text-caption font-semibold text-ink-3">Sound plays through this device's speaker, or a Bluetooth speaker when one is connected.</p>
          {!duty.testing && duty.result && <div className="basis-full"><SoundResultLine result={duty.result} /></div>}
        </section>
      </main>

      <DeliverySheet open={delivery} onClose={() => setDelivery(false)} />
      <SpeakerSheet open={speaker} onClose={() => setSpeaker(false)} onTest={() => void duty.playTest()} testing={duty.testing} />
      <Sheet open={pausing} onClose={() => setPausing(false)} title="Pause your duty?"
        description="Announcements stop on this device and alerts go to the rest of the gate team. Switching apps or locking the screen never pauses duty: only this does.">
        <fieldset className="mb-5">
          <legend className="kicker mb-2.5">Reason (optional)</legend>
          <div className="flex flex-wrap gap-2">
            {['Break', 'Away from the gate', 'Another task'].map((r) => (
              <button key={r} type="button" className="choice px-4 py-2.5 text-small font-bold" aria-pressed={reason === r} onClick={() => setReason(reason === r ? null : r)}>{r}</button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Button variant="secondary" autoFocus onClick={() => setPausing(false)}>Stay on duty</Button>
          <Button icon={<PauseLine />} loading={duty.changing} onClick={() => void duty.pause(reason ?? undefined).then((ok) => { if (ok) { setPausing(false); setReason(null) } })}>
            Pause duty
          </Button>
        </div>
      </Sheet>
      <Sheet open={ending} onClose={() => setEnding(false)} title="End your duty?" description="Announcements stop on this tablet. Other tablets on duty keep going.">
        <div className="mb-5 flex items-center gap-3.5 rounded-xl bg-sunken p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-live-soft text-live [&_svg]:size-5" aria-hidden><Sun /></span>
          <div>
            <p className="text-h4">On duty since {duty.since ? clock(duty.since) : 'now'}</p>
            <p className="text-small font-semibold text-ink-2">{duty.since ? hours(now - duty.since) : 'Just started'}{waiting > 0 ? ` · ${waiting} announcement${waiting === 1 ? '' : 's'} still waiting` : ''}</p>
          </div>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Button variant="secondary" autoFocus onClick={() => setEnding(false)}>
            Stay on duty
          </Button>
          <Button variant="danger" icon={<PowerLine />} loading={duty.changing} onClick={() => void duty.end().then(() => setEnding(false))}>
            End duty
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
