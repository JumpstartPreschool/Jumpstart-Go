import { BellRing } from '../../ui/icons'
import { Switch } from '../../ui/Switch'
import type { PushState } from '../notifications/push'

export type Platform = 'android-app' | 'apple' | 'web'

/**
 * What "Announce when the screen is off" really does on this device, said plainly: only the Android app can speak with
 * the screen off; iPhone, iPad and browsers show an alert with the system sound, and the full announcement plays on opening.
 */
export function screenOffSays(on: boolean, platform: Platform): string {
  if (!on) return 'Off. Announcements play only while Jumpstart Go is open on screen. The screen stays on during duty.'
  if (platform === 'android-app') return 'On. With the screen off or the app in the background, this phone speaks every announcement aloud at full alarm volume, even in silent mode.'
  if (platform === 'apple') return 'On. With the screen locked, each request arrives as an alert with the notification sound. iPhone and iPad cannot speak it aloud while locked; the full announcement plays when you open the alert.'
  return 'On. With the screen off, each request arrives as an alert with the notification sound and vibration. The full announcement plays when you open it.'
}

/** The switch on Start duty for Center Coordinators and Center Leaders. Shown when alerts can be turned on or off here. */
export function ScreenOffSwitch({ state, platform, busy, onChange }: { state: PushState; platform: Platform; busy: boolean; onChange: (on: boolean) => void }) {
  const on = state === 'on'
  const label = 'Announce when the screen is off'
  return (
    <li className={`card flex flex-col gap-3 rounded-xl p-5 sm:col-span-2 short:p-4 ${on ? '' : 'border-2 border-warning'}`}>
      <div className="flex items-center gap-3">
        <span className={`grid size-11 shrink-0 place-items-center rounded-md [&_svg]:size-[22px] ${on ? 'bg-live-soft text-live' : 'bg-warning-soft text-warning'}`} aria-hidden><BellRing /></span>
        <p className="min-w-0 flex-1 text-h4">{label}</p>
        <Switch on={on} busy={busy} label={label} onChange={onChange} />
      </div>
      <p className="text-body text-ink-2 short:text-small" aria-live="polite">{screenOffSays(on, platform)}</p>
    </li>
  )
}
