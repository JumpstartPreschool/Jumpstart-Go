import { useEffect, useState } from 'react'
import { BellRing } from '../../ui/icons'
import { Switch } from '../../ui/Switch'
import { useToast } from '../../ui/Toast'
import { explainDbError } from '../admin/api'
import { pushState, turnOffPush, turnOnPush, type PushState } from './push'

const SAYS: Record<PushState, string> = {
  on: 'On. Alerts arrive even when the app is closed.',
  off: 'Off. Turn on to hear about pickups, check-ins and school news.',
  denied: 'Blocked in the browser settings for this site. Allow notifications there, then come back.',
  'needs-install': 'On iPhone and iPad, add Jumpstart to the Home Screen first (Share, then Add to Home Screen), then open it from there.',
  unsupported: "This browser can't receive notifications. Updates still show in the app.",
  'not-configured': "Notifications aren't set up for the school yet. Updates still show in the app.",
}

/** "Notifications on this device": its state in words, and a switch when it can be changed. */
export function PushSwitch({ label = 'Notifications on this device' }: { label?: string }) {
  const toast = useToast()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void pushState().then(setState, () => setState('unsupported')) }, [])
  const can = state === 'on' || state === 'off'
  async function change(on: boolean) {
    setBusy(true)
    try {
      const next = on ? await turnOnPush() : await turnOffPush()
      setState(next)
      toast(next === 'on' ? 'Notifications are on for this device.' : next === 'denied' ? 'Notifications are blocked in the browser settings.' : 'Notifications are off for this device.')
    } catch (e) {
      toast(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-center gap-3 py-3">
      <BellRing className="size-5 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-h4">{label}</p>
        <p className="text-small font-semibold text-ink-2">{state ? SAYS[state] : 'Checking…'}</p>
      </div>
      {can && <Switch on={state === 'on'} busy={busy} label={label} onChange={(v) => void change(v)} />}
    </div>
  )
}
