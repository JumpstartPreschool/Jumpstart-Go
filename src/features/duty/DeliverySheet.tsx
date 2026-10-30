import { useEffect, useState } from 'react'
import { BellOff, Bell, Smartphone, TriangleAlert } from '../../ui/icons'
import { Pill } from '../../ui/Pill'
import { Sheet } from '../../ui/Sheet'
import { ErrorState, Notice, SkeletonList } from '../../ui/States'
import { supabase } from '../../lib/supabase'
import { clockTime } from '../trips/rules'
import { DeviceReadiness } from '../notifications/DeviceReadiness'

/** "iPad", "iPhone", "Android", or the browser: enough to tell someone's devices apart. */
const deviceName = (ua: string) => /iPad|Macintosh.*Mobile/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Browser'
const when = (iso: string | null) => (iso ? `${new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })} ${clockTime(iso)}` : null)

interface WebDevice { kind: 'web'; label: string; added: string; last_displayed: string | null; last_test: string | null; test_heard: string | null }
interface PhoneDevice { kind: string; added: string; last_seen: string | null }
interface StaffReach { id: string; name: string; roles: string[]; on_duty: boolean; last_displayed: string | null; failed_today: number; last_error: string | null; web: WebDevice[]; phones: PhoneDevice[] }
interface TripReach {
  id: string; child: string; direction: 'pickup' | 'dropoff'; arrive_at: string; arrived_at: string | null; acknowledged_at: string | null
  queued: number; dispatched: number; accepted: number; displayed: number; opened: number; failed: number; expired: number; heard: number; reminders: number; escalated: boolean
}
interface Report { staff: StaffReach[]; trips: TripReach[] }

/**
 * Who on the gate team can be reached, and how today's open requests got through (0059): accepted by the push service,
 * shown on a device, opened, spoken aloud, acknowledged. Each is only what a device or person actually reported.
 */
export function DeliverySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [report, setReport] = useState<Report | null>(null)
  const [failed, setFailed] = useState(false)
  const load = async () => {
    setFailed(false)
    const { data, error } = await supabase.rpc('gate_delivery_report')
    if (error) return setFailed(true)
    setReport(data as Report)
  }
  useEffect(() => { if (open) void load() }, [open])

  const devices = (s: StaffReach) => s.web.length + s.phones.length
  const unreachable = report?.staff.filter((s) => devices(s) === 0) ?? []
  return (
    <Sheet open={open} onClose={onClose} title="Who gets alerts" description="Each line is only what a device or person reported. Shown is not the same as heard: Silent mode, Focus or volume can mute an alert.">
      {failed ? <ErrorState title="Couldn't load delivery" onRetry={() => void load()}>Check this device's connection.</ErrorState>
        : !report ? <SkeletonList count={3} className="grid gap-2.5" />
        : (
          <div className="grid gap-5">
            <section className="grid gap-2 rounded-lg bg-sunken p-4"><DeviceReadiness /></section>
            {unreachable.length > 0 && (
              <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
                {unreachable.map((s) => s.name.split(' ')[0]).join(', ')} {unreachable.length === 1 ? 'has' : 'have'} no device with notifications on. They hear nothing while the app is closed or locked.
              </Notice>
            )}
            <section className="grid gap-2">
              <h3 className="kicker">Gate team</h3>
              <ul className="grid gap-2">
                {report.staff.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-sunken px-3.5 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-h4">{s.name}</span>
                    {s.on_duty && <Pill tone="live">On duty</Pill>}
                    {devices(s) === 0
                      ? <Pill tone="warning" icon={<BellOff />}>No device</Pill>
                      : <Pill icon={s.phones.length ? <Smartphone /> : <Bell />}>{devices(s)} device{devices(s) === 1 ? '' : 's'}</Pill>}
                    {s.failed_today > 0 && <Pill tone="danger">{s.failed_today} failed today</Pill>}
                    <ul className="grid basis-full gap-0.5 text-caption font-semibold text-ink-3">
                      {s.web.map((d) => (
                        <li key={d.added}>
                          {deviceName(d.label)}: {d.last_test ? `test shown ${when(d.last_test)}` : 'no test yet'}
                          {d.test_heard ? `, heard ${when(d.test_heard)}` : d.last_test ? ', not confirmed heard' : ''}
                          {d.last_displayed ? `; last alert shown ${when(d.last_displayed)}` : ''}
                        </li>
                      ))}
                      {s.phones.map((d) => <li key={d.added}>Android app: last opened {when(d.last_seen) ?? 'never'}</li>)}
                      {s.last_error && <li className="text-danger">Last error: {s.last_error.slice(0, 80)}</li>}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
            <section className="grid gap-2">
              <h3 className="kicker">Open requests</h3>
              {report.trips.length === 0 ? <p className="rounded-lg bg-sunken px-4 py-3 text-small font-semibold text-ink-2">Nobody is on the way right now.</p> : (
                <ul className="grid gap-2">
                  {report.trips.map((t) => (
                    <li key={t.id} className="grid gap-1 rounded-lg bg-sunken px-3.5 py-2.5">
                      <span className="text-h4">{t.child}, {t.direction === 'pickup' ? 'pickup' : 'drop-off'} at {clockTime(t.arrive_at)}</span>
                      <span className="text-small font-semibold text-ink-2 tabular-nums">
                        Queued {t.queued} · sent {t.dispatched} · accepted {t.accepted} · shown {t.displayed} · opened {t.opened} · spoken on {t.heard} device{t.heard === 1 ? '' : 's'}
                        {t.failed > 0 ? ` · ${t.failed} failed` : ''}{t.expired > 0 ? ` · ${t.expired} expired or no longer needed` : ''}
                      </span>
                      <span className="text-small font-bold">
                        {t.acknowledged_at && !(t.arrived_at && Date.parse(t.arrived_at) > Date.parse(t.acknowledged_at)) ? `Acknowledged at ${clockTime(t.acknowledged_at)}` : 'Not acknowledged'}
                        {t.reminders > 0 ? ` · ${t.reminders} reminder${t.reminders === 1 ? '' : 's'}` : ''}{t.escalated ? ' · escalated to everyone covering' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
    </Sheet>
  )
}
