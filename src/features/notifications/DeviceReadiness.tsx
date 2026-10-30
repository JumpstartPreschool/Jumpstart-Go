import { useEffect, useRef, useState } from 'react'
import { BellRing, CircleCheck, Send, TriangleAlert } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { useToast } from '../../ui/Toast'
import { supabase } from '../../lib/supabase'
import { isNativeAndroid } from '../../native/duty'
import { explainDbError } from '../admin/api'
import { currentEndpoint, pushState, turnOnPush, type PushState } from './push'
import { readinessOf, type DeviceEvidence, type ReadinessStatus } from './readiness'

const TONE: Record<ReadinessStatus, 'live' | 'warning' | 'danger' | undefined> = { ready: 'live', attention: 'warning', setup: 'warning', blocked: 'danger', unsupported: 'danger' }
const POLL_MS = 3000
const GIVE_UP_MS = 90_000

/** What the test alert has done so far on this device, from the server's record (never assumed). */
type Test =
  | { step: 'idle' }
  | { step: 'waiting'; tag: string; since: number; accepted: boolean }
  | { step: 'shown' }
  | { step: 'not-shown'; accepted: boolean }
  | { step: 'not-heard' }

/**
 * This device's readiness for alerts while locked (0059): what is set up, what is proven, and the next step. The test
 * alert goes through the real pipeline; the device reports when it displayed it, and the person says whether they heard it.
 */
export function DeviceReadiness() {
  const toast = useToast()
  const native = isNativeAndroid()
  const [push, setPush] = useState<PushState | null>(null)
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [evidence, setEvidence] = useState<DeviceEvidence | null>(null)
  const [test, setTest] = useState<Test>({ step: 'idle' })
  const [busy, setBusy] = useState(false)
  const stopped = useRef(false)

  const refresh = async () => {
    const state = await pushState().catch((): PushState => 'unsupported')
    const ep = state === 'on' ? await currentEndpoint().catch(() => null) : null
    setPush(state)
    setEndpoint(ep)
    if (!ep) return setEvidence(null)
    const { data } = await supabase.from('push_subscriptions').select('last_test_at, test_heard_at').eq('endpoint', ep).maybeSingle()
    const row = data as { last_test_at: string | null; test_heard_at: string | null } | null
    setEvidence(row ? { lastTestAt: row.last_test_at, testHeardAt: row.test_heard_at } : null)
  }
  useEffect(() => { void refresh(); return () => { stopped.current = true } }, [])

  // Follows the test alert until this device reports it displayed, or 90 seconds pass. Paused while the device is locked
  // (the page is suspended), it picks up again on return.
  useEffect(() => {
    if (test.step !== 'waiting') return
    const timer = setInterval(async () => {
      const { data } = await supabase.rpc('test_push_status', { p_tag: test.tag })
      if (stopped.current) return
      const rows = (data ?? []) as Array<{ platform: string; endpoint: string | null; result: string | null; displayed_at: string | null }>
      const mine = native ? rows.find((r) => r.platform === 'phone') : rows.find((r) => r.endpoint === endpoint)
      const accepted = mine?.result === 'sent'
      if (mine?.displayed_at || (native && accepted)) { setTest({ step: 'shown' }); return }
      if (Date.now() - test.since > GIVE_UP_MS) setTest({ step: 'not-shown', accepted })
      else if (accepted !== test.accepted) setTest({ ...test, accepted })
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [test, endpoint, native])

  async function turnOn() {
    setBusy(true)
    try { setPush(await turnOnPush()); await refresh() } catch (e) { toast(explainDbError(e as { code?: string; message?: string })) } finally { setBusy(false) }
  }
  async function sendTest() {
    setBusy(true)
    const { data, error } = await supabase.rpc('send_test_push')
    setBusy(false)
    if (error) return toast(explainDbError(error))
    setTest({ step: 'waiting', tag: data as string, since: Date.now(), accepted: false })
  }
  async function heard(yes: boolean) {
    if (!yes) return setTest({ step: 'not-heard' })
    if (endpoint) await supabase.rpc('confirm_test_heard', { p_endpoint: endpoint })
    setTest({ step: 'idle' })
    await refresh()
  }

  if (!push) return <p className="text-small font-semibold text-ink-2">Checking this device…</p>
  const r = readinessOf(push, evidence, Date.now(), native)
  const canTest = push === 'on'
  return (
    <div className="grid gap-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <BellRing className="size-5 shrink-0 text-accent" aria-hidden />
        <p className="text-h4">Alerts on this device</p>
        <Pill tone={TONE[r.status]} className="ml-auto">{r.label}</Pill>
      </div>
      <p className="text-body text-ink-2">{r.detail}</p>
      {push === 'off' && <Button size="md" variant="primary" icon={<BellRing />} loading={busy} onClick={() => void turnOn()}>Turn on notifications</Button>}

      {canTest && test.step === 'idle' && (
        <Button size="md" variant="secondary" icon={<Send />} loading={busy} onClick={() => void sendTest()}>Send a test alert</Button>
      )}
      {test.step === 'waiting' && (
        <p className="rounded-lg bg-accent-soft px-4 py-3 text-small font-bold text-accent">
          Lock the screen now. The test alert comes in about 10 seconds; listen for its sound, then unlock.
          {test.accepted ? ' The push service has accepted it.' : ''}
        </p>
      )}
      {test.step === 'shown' && (
        <div className="grid gap-2 rounded-lg bg-sunken p-4">
          <p className="text-small font-bold">{native ? 'The test alert was sent to this phone.' : 'This device displayed the test alert.'} Did you hear its sound?</p>
          <div className="flex flex-wrap gap-2">
            <Button size="md" variant="success" icon={<CircleCheck />} onClick={() => void heard(true)}>Yes, I heard it</Button>
            <Button size="md" variant="secondary" onClick={() => void heard(false)}>No sound</Button>
          </div>
        </div>
      )}
      {(test.step === 'not-heard' || test.step === 'not-shown') && (
        <div className="grid gap-2 rounded-lg bg-warning-soft p-4 text-warning">
          <p className="flex items-center gap-2 text-small font-bold"><TriangleAlert className="size-4 shrink-0" aria-hidden />
            {test.step === 'not-heard' ? 'The alert arrived without a sound you could hear.'
              : test.accepted ? 'The push service accepted it, but this device has not shown it.' : 'The test alert did not reach this device.'}
          </p>
          <ul className="grid list-disc gap-1 pl-5 text-small text-ink">
            <li>Turn the volume up, and turn off Silent mode, Focus and Do Not Disturb.</li>
            <li>In Settings, Notifications, Jumpstart Go: allow notifications and turn Sounds on (Android: the "Pickup updates" category too).</li>
            {test.step === 'not-shown' && <li>Open Jumpstart Go from the Home Screen icon, not the browser, and check this device is online.</li>}
            {test.step === 'not-shown' && <li>Android: Settings, Apps, the browser or Jumpstart Go, Battery: Unrestricted.</li>}
          </ul>
          <Button size="md" variant="secondary" icon={<Send />} onClick={() => setTest({ step: 'idle' })}>Try again</Button>
        </div>
      )}
    </div>
  )
}
