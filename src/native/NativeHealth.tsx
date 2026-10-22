import { useEffect, useState } from 'react'
import { AudioLines, BellOff, TriangleAlert, Volume2 } from '../ui/icons'
import { Switch } from '../ui/Switch'
import { formatTime, indiaClock } from '../domain/time'
import { pushTurnedOff } from '../features/notifications/push'
import { isNativeAndroid, nativeDutyStart, nativeStatus, openBatterySettings, openNotificationSettings, setSpeakAloud, type NativeStatus } from './duty'

// From dontkillmyapp.com: the extra switch these makers hide behind the standard battery setting.
function makerAdvice(maker: string): string | null {
  const m = maker.toLowerCase()
  if (/xiaomi|redmi|poco/.test(m)) return 'On Xiaomi, Redmi and Poco: Settings, Apps, Jumpstart Go, Autostart on, and Battery saver set to No restrictions.'
  if (/vivo|iqoo/.test(m)) return 'On Vivo and iQOO: Settings, Battery, Background power consumption, Jumpstart Go, Allow high background power.'
  if (/oppo|realme|oneplus/.test(m)) return 'On Oppo, Realme and OnePlus: Settings, Battery, Jumpstart Go, Allow background activity and Allow auto launch.'
  if (/samsung/.test(m)) return 'On Samsung: Settings, Battery, Background usage limits, Never sleeping apps, add Jumpstart Go.'
  return null
}

const row = 'mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-warning-soft px-5 py-4 text-h4 text-warning shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--warning)_25%,transparent)]'
const fix = 'min-h-11 rounded-full bg-warning px-4 text-small font-extrabold text-white'

/**
 * What the phone's own announcer (GateVoice) does when this page can't speak, said from what the phone reports: off, push
 * not set up, an app too old for the school's voice, or when it last spoke and in which voice. Never a success it hasn't seen.
 */
export function backgroundVoiceSays(s: NativeStatus): string {
  if (s.speakAloud === undefined) return "This version of the app says alerts in the phone's own voice with the screen off. Install the latest Jumpstart Go for the school's voice."
  if (!s.speakAloud) return 'Off: with the screen off, alerts show with a sound but are not spoken.'
  if (!s.firebase) return "Push isn't set up in this app, so nothing is spoken once the app is closed. Ask the admin."
  const at = s.lastSpokenAt ? formatTime(indiaClock(new Date(s.lastSpokenAt)).minutes) : null
  if (at && s.lastVoice === 'school') return `Last spoken with the screen off at ${at}, in the school's voice.`
  if (at) return `Last spoken with the screen off at ${at}, in this phone's own voice: the school's recording couldn't be fetched in time.`
  return "When the duty screen can't speak, this phone plays the chime and the school's voice. Send a test alert and lock the screen to hear it."
}

/** Android app only: lists what would stop announcements with the screen off, each with its fix, and the background voice's state. */
export function NativeHealth() {
  const [s, setS] = useState<NativeStatus | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!isNativeAndroid()) return
    const load = () => void nativeStatus().then((v) => v && setS(v))
    load()
    const every = setInterval(load, 30_000)
    return () => clearInterval(every)
  }, [])
  if (!s) return null

  const advice = makerAdvice(s.manufacturer)
  // Below half is too quiet for a busy gate. The web voice follows the media volume; the phone's own voice (screen off)
  // turns the alarm volume up itself while it speaks.
  const low = (v: number, max: number) => max > 0 && v < max / 2
  const quiet = low(s.mediaVolume, s.mediaMax)
  const speak = s.speakAloud !== false
  const toggle = (on: boolean) => {
    setSaving(true)
    void setSpeakAloud(on).then(() => nativeStatus()).then((v) => v && setS(v)).finally(() => setSaving(false))
  }
  return (
    <>
      <section aria-label="Background voice" className="card mt-3 flex items-center gap-3 rounded-lg py-2 pl-5 pr-2">
        <AudioLines className={`size-6 shrink-0 ${speak ? 'text-accent' : 'text-ink-3'}`} aria-hidden />
        <div className="min-w-0 flex-1 py-1.5">
          <p className="text-h4">Speak alerts with the screen off</p>
          <p className="text-small font-semibold text-ink-2" aria-live="polite">{backgroundVoiceSays(s)}</p>
        </div>
        {s.speakAloud !== undefined && <Switch on={speak} busy={saving} label="Speak alerts with the screen off" onChange={toggle} />}
      </section>
      {!s.running && !pushTurnedOff() && (
        <div role="status" className={row}>
          <TriangleAlert className="size-6 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">The duty voice is not running, so announcements stop when the screen turns off.</span>
          <button type="button" className={fix} onClick={() => void nativeDutyStart().then(() => nativeStatus()).then((v) => v && setS(v))}>Restart duty voice</button>
        </div>
      )}
      {!s.ignoringBatteryOptimizations && (
        <div role="status" className={row}>
          <TriangleAlert className="size-6 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            This phone may stop the app after a while with the screen off.
            {advice && <span className="mt-1 block text-small font-semibold">{advice}</span>}
          </span>
          <button type="button" className={fix} onClick={() => void openBatterySettings()}>Allow running in background</button>
        </div>
      )}
      {!s.notificationsAllowed && (
        <div role="status" className={row}>
          <BellOff className="size-6 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">Notifications are off, so the duty voice cannot stay on and updates cannot show.</span>
          <button type="button" className={fix} onClick={() => void openNotificationSettings()}>Open settings</button>
        </div>
      )}
      {quiet && (
        <p role="status" className={row}>
          <Volume2 className="size-6 shrink-0" aria-hidden />
          Turn the media volume up with the volume buttons: it is below half, so announcements may be hard to hear.
        </p>
      )}
    </>
  )
}
