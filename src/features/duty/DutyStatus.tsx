import { useEffect, useState, type ReactNode } from 'react'
import { Bell, BellOff, PauseLine, Sun, Wifi, WifiOff, AudioLines } from '../../ui/icons'
import { formatTime, indiaClock } from '../../domain/time'
import { pushState, type PushState } from '../notifications/push'
import { dutyTime, notificationReadiness, type Connectivity, type DutyState, type NotificationReadiness } from './dutyState'
import type { VoiceUsed } from './sound'

const clock = (ms: number) => formatTime(indiaClock(new Date(ms)).minutes)

type Tone = 'ok' | 'warn' | 'bad' | 'quiet'
const TONE: Record<Tone, string> = {
  ok: 'bg-live-soft text-live',
  warn: 'bg-warning-soft text-warning',
  bad: 'bg-danger-soft text-danger',
  quiet: 'bg-sunken text-ink-2',
}

function Chip({ tone, icon, label, value, detail }: { tone: Tone; icon: ReactNode; label: string; value: string; detail?: string | null }) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-lg bg-surface px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${TONE[tone]} [&_svg]:size-[18px]`} aria-hidden>{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className="block text-label font-bold uppercase tracking-[0.06em] text-ink-2">{label}</span>
        <span className="block truncate text-small font-extrabold text-ink">{value}</span>
        {detail && <span className="block truncate text-caption font-semibold text-ink-2">{detail}</span>}
      </span>
    </li>
  )
}

export const CONNECTIVITY: Record<Connectivity, { tone: Tone; value: string }> = {
  online: { tone: 'ok', value: 'Online' },
  offline: { tone: 'bad', value: 'Offline' },
  reconnecting: { tone: 'warn', value: 'Reconnecting' },
  unknown: { tone: 'quiet', value: 'Checking' },
}
export const READINESS: Record<NotificationReadiness, { tone: Tone; value: string; detail: string }> = {
  ready: { tone: 'ok', value: 'Ready', detail: 'Alerts reach this device when locked' },
  permission: { tone: 'warn', value: 'Permission required', detail: 'Turn notifications on in Start duty' },
  unavailable: { tone: 'warn', value: 'Temporarily unavailable', detail: "The school's alerts aren't set up" },
  unsupported: { tone: 'quiet', value: 'Unsupported', detail: 'Keep this screen open to hear requests' },
}

/** The duty's last change in words: "Paused at 12:40 · Lunch", "Resumed at 13:10", "Started at 08:52". */
export function lastChange(d: DutyState): string {
  const t = dutyTime(Date.parse(d.changed_at))
  const at = t.includes(',') ? t : `at ${t}`
  const what = d.status === 'paused' ? 'Paused' : d.resumed_at && d.changed_at === d.resumed_at ? 'Resumed' : 'Started'
  const why = d.change_reason && !['started', 'paused', 'resumed'].includes(d.change_reason) ? ` · ${d.change_reason}` : ''
  return `${what} ${at}${why}`
}

/**
 * Duty, connection, alerts and the last announcement, side by side and never mixed: being offline or unable to receive
 * alerts is shown as that, never as a paused duty.
 */
export function DutyStatus({ duty, unconfirmed, connectivity, used }: { duty: DutyState; unconfirmed: boolean; connectivity: Connectivity; used: VoiceUsed | null }) {
  const [push, setPush] = useState<PushState | null>(null)
  useEffect(() => {
    const read = () => void pushState().then(setPush, () => setPush('unsupported'))
    read()
    // Checked again when the person comes back (they may have changed it in Settings); never a prompt.
    const again = () => { if (document.visibilityState === 'visible') read() }
    document.addEventListener('visibilitychange', again)
    return () => document.removeEventListener('visibilitychange', again)
  }, [])
  const ready = notificationReadiness(push)
  const net = CONNECTIVITY[connectivity]
  const paused = duty.status === 'paused'
  return (
    <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Status">
      <Chip tone={paused ? 'warn' : 'ok'} icon={paused ? <PauseLine /> : <Sun />} label="Duty" value={paused ? 'Paused' : 'Active'}
        detail={unconfirmed ? 'Last confirmed state, checking…' : lastChange(duty)} />
      <Chip tone={net.tone} icon={connectivity === 'offline' ? <WifiOff /> : <Wifi />} label="Connection" value={net.value}
        detail={connectivity === 'online' ? null : 'Duty is unchanged'} />
      <Chip tone={ready ? READINESS[ready].tone : 'quiet'} icon={ready === 'ready' ? <Bell /> : <BellOff />} label="Alerts"
        value={ready ? READINESS[ready].value : 'Checking'} detail={ready ? READINESS[ready].detail : null} />
      <Chip tone={used ? (used.voice === 'school' ? 'ok' : 'warn') : 'quiet'} icon={<AudioLines />} label="Last announcement"
        value={used ? clock(used.at) : 'None yet'}
        detail={used ? (used.voice === 'school' ? "School's voice" : used.voice === 'device' ? "This device's voice" : 'Not heard, retrying') : 'On this device, this session'} />
    </ul>
  )
}
