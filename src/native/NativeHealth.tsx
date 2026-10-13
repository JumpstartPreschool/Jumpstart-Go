import { useEffect, useState } from 'react'
import { BellOff, TriangleAlert, Volume2 } from '../ui/icons'
import { isNativeAndroid, nativeDutyStart, nativeStatus, openBatterySettings, openNotificationSettings, type NativeStatus } from './duty'

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

/** Android app only: lists what would stop announcements with the screen off, each with its fix. Shows nothing when all is well. */
export function NativeHealth() {
  const [s, setS] = useState<NativeStatus | null>(null)
  useEffect(() => {
    if (!isNativeAndroid()) return
    const load = () => void nativeStatus().then((v) => v && setS(v))
    load()
    const every = setInterval(load, 30_000)
    return () => clearInterval(every)
  }, [])
  if (!s) return null

  const advice = makerAdvice(s.manufacturer)
  const quiet = s.mediaVolume === 0 || (s.alarmMax > 0 && s.alarmVolume === 0)
  return (
    <>
      {!s.running && (
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
          Turn the volume up: {s.mediaVolume === 0 ? 'the media volume' : 'the alarm volume'} is at zero on this phone.
        </p>
      )}
    </>
  )
}
