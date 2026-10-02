import { useState } from 'react'
import { Bell, CircleCheck, Clock, Timer, TriangleAlert, X } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { SelectField } from '../../ui/Field'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatTime, indiaClock, type Minutes } from '../../domain/time'
import { windowFor, type Direction, type Programme } from '../../domain/programme'
import { cancelTrip, explainTripError, startTrip, type Trip } from './api'
import { checkArrival, formatRange, MINUTE_CHOICES, REASONS, type Arrival } from './rules'

const WORD: Record<Direction, string> = { dropoff: 'drop-off', pickup: 'pickup' }

/** The time as the gate sees it: whole minutes after now. */
const minutesUntil = (iso: string, nowMs: number) => Math.max(0, Math.ceil((Date.parse(iso) - nowMs) / 60_000))

/** Where the chosen time falls against the child's window, said plainly: on time, early or late. Never blocks sending. */
function CheckLine({ now, arrival, state, first, direction, programme }: { now: Minutes; arrival: Minutes; state: Arrival; first: string; direction: Direction; programme: Programme }) {
  const win = formatRange(windowFor(programme, direction))
  if (state === 'inside') return <Notice tone="success">Arriving about {formatTime(arrival)}, inside {first}'s {WORD[direction]} window ({win}).</Notice>
  if (state === 'closed') return <Notice tone="danger">{formatTime(arrival)} is after midnight. Please call the school.</Notice>
  return (
    <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
      <b>{state === 'late' ? "You're running late." : "You're early."}</b> It's {formatTime(now)} now and {first}'s {WORD[direction]} window is {win}. The school will see that you'll arrive about {formatTime(arrival)}.
    </Notice>
  )
}

export function ReasonPicker({ onChange }: { onChange: (v: string) => void }) {
  const [choice, setChoice] = useState<string | null>(null)
  const [other, setOther] = useState('')
  const pick = (r: string) => { setChoice(r); onChange(r === 'Other' ? other : r) }
  return (
    <fieldset className="grid gap-2.5">
      <legend className="kicker mb-2">Why?</legend>
      <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Reason">
        {REASONS.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={choice === r} className="choice h-12 px-3.5 text-small font-bold" onClick={() => pick(r)}>
            {r}
          </button>
        ))}
      </div>
      {choice === 'Other' && (
        <label className="input input--sm">
          <input autoFocus value={other} maxLength={200} placeholder="A few words for the school" aria-label="Other reason"
            onChange={(e) => { setOther(e.target.value); onChange(e.target.value) }} />
        </label>
      )}
    </fieldset>
  )
}

/**
 * "I'm on my way" (TRIP-1, TRIP-2): minutes until arrival, checked against the child's window; a reason when it's outside.
 * Sending again while on the way changes the time, and the gate hears it again.
 */
export function OnMyWaySheet({ open, onClose, childId, first, direction, programme, trip, nowMs }: {
  open: boolean; onClose: () => void; childId: string; first: string; direction: Direction; programme: Programme; trip: Trip | null; nowMs: number
}) {
  const toast = useToast()
  const nowMin = indiaClock(new Date(nowMs)).minutes
  // A trip already on the way opens on its own time: one of the quick choices, or that clock time under Custom time.
  const already = trip ? minutesUntil(trip.arrive_at, nowMs) : null
  const quick = already === null ? 10 : (MINUTE_CHOICES as readonly number[]).includes(already) ? already : null
  const [minutes, setMinutes] = useState<number>(quick ?? 10)
  const [custom, setCustom] = useState<Minutes | null>(quick === null && already !== null ? nowMin + already : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Custom time: any 5-minute clock time from 5 minutes from now, up to 3 hours ahead (the server's limit) and before midnight.
  const customFrom = Math.ceil((nowMin + 5) / 5) * 5
  const customTimes = Array.from({ length: Math.max(0, Math.floor((Math.min(nowMin + 180, 23 * 60 + 55) - customFrom) / 5) + 1) }, (_, i) => customFrom + i * 5)
  const sendMinutes = custom === null ? minutes : Math.max(0, custom - nowMin)
  const arrival = nowMin + sendMinutes
  const state = checkArrival(programme, direction, arrival)
  // Outside the window the trip is still flagged for the gate team to acknowledge; the reason is said for the parent.
  const reason = state === 'late' ? 'Running late' : state === 'early' ? 'Arriving early' : null
  const canSend = state !== 'closed'

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await startTrip(childId, direction, sendMinutes, reason)
      toast(trip ? `New time sent: about ${formatTime(arrival)}.` : `The school knows you're coming, about ${formatTime(arrival)}.`)
      onClose()
    } catch (e) {
      setError(explainTripError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`On my way to ${direction === 'pickup' ? 'pick up' : 'drop off'} ${first}`}
      description={`It's ${formatTime(nowMin)} now. ${first}'s ${WORD[direction]} window is ${formatRange(windowFor(programme, direction))}.`}>
      <p className="kicker">I'll reach the school in</p>
      <div className="mt-3 grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Minutes until you arrive">
        {MINUTE_CHOICES.map((n) => {
          const closed = checkArrival(programme, direction, nowMin + n) === 'closed'
          return (
            <button key={n} type="button" role="radio" aria-checked={custom === null && n === minutes} disabled={closed} onClick={() => { setMinutes(n); setCustom(null) }}
              className="choice grid min-h-[200px] justify-items-center content-center gap-2 px-2 py-6 text-center sm:min-h-[228px]">
              <span className="text-[64px] font-extrabold leading-none tracking-[-0.04em] tabular-nums sm:text-[78px]">{n}</span>
              <span className="text-h3 font-extrabold">min</span>
              <span className="text-small font-bold text-ink-2 tabular-nums">{formatTime(nowMin + n)}</span>
            </button>
          )
        })}
        <button type="button" role="radio" aria-checked={custom !== null} disabled={!customTimes.length}
          onClick={() => custom === null && customTimes.length && setCustom(customTimes.find((t) => t >= nowMin + 20) ?? customTimes[0]!)}
          className="choice col-span-3 flex min-h-14 items-center justify-center gap-2.5 px-4 text-h4 [&_svg]:size-5">
          <Clock aria-hidden />{custom === null ? 'Custom time' : <>Custom time<span className="tabular-nums text-accent-ink">· {formatTime(custom)}</span></>}
        </button>
      </div>
      {custom !== null && (
        <div className="mt-4">
          <SelectField label="Arriving at about" value={custom} onValue={(v) => setCustom(Number(v))}>
            {(customTimes.includes(custom) ? customTimes : [custom, ...customTimes]).map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
          </SelectField>
        </div>
      )}
      <div className="mt-4 grid gap-4">
        <CheckLine now={nowMin} arrival={arrival} state={state} first={first} direction={direction} programme={programme} />
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
      <SheetFooter>
        <Button size="xl" className="w-full" icon={<Bell />} loading={busy} disabled={!canSend} onClick={() => void send()}>
          {trip ? 'Update the school' : 'Tell the school'}
        </Button>
        <p className="mt-2.5 text-center text-caption font-semibold text-ink-3">The gate team hears it straight away. You can change or cancel it.</p>
      </SheetFooter>
    </Sheet>
  )
}

/** Running late: push the arrival back by 10, 20 or 30 minutes. */
export function LateSheet({ open, onClose, trip, first, programme, nowMs }: { open: boolean; onClose: () => void; trip: Trip; first: string; programme: Programme; nowMs: number }) {
  const toast = useToast()
  const [extra, setExtra] = useState(10)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nowMin = indiaClock(new Date(nowMs)).minutes
  const current = minutesUntil(trip.arrive_at, nowMs)
  const arrival = nowMin + current + extra
  const state = checkArrival(programme, trip.direction, arrival)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await startTrip(trip.child_id, trip.direction, current + extra, state === 'inside' ? null : 'Running late')
      toast(`The school knows: about ${formatTime(arrival)}.`)
      onClose()
    } catch (e) {
      setError(explainTripError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Running late" description={`Now about ${formatTime(nowMin + current)}. How much later?`}>
      <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Minutes late">
        {[10, 20, 30].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={n === extra} disabled={checkArrival(programme, trip.direction, nowMin + current + n) === 'closed'}
            onClick={() => setExtra(n)} className="choice grid justify-items-center gap-0.5 px-2 py-2.5 text-center">
            <span className="text-[22px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">+{n}<span className="ml-0.5 text-small font-bold">min</span></span>
            <span className="text-caption font-semibold text-ink-2 tabular-nums">{formatTime(nowMin + current + n)}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4">
        {state === 'inside' ? <Notice tone="success">{formatTime(arrival)} is still inside {first}'s window.</Notice>
          : state === 'closed' ? <Notice tone="danger">That is outside school hours. Please call the school.</Notice>
          : <Notice tone="warning">{formatTime(arrival)} is past the window, so it's flagged and the gate team acknowledges it.</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
      <SheetFooter>
        <Button size="xl" variant="sunshine" className="w-full" icon={<Timer />} loading={busy} disabled={state === 'closed'} onClick={() => void send()}>
          Tell the school
        </Button>
      </SheetFooter>
    </Sheet>
  )
}

/** Cancel a trip on the way. The gate hears that it's cancelled. */
export function CancelSheet({ open, onClose, trip, first }: { open: boolean; onClose: () => void; trip: Trip; first: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      await cancelTrip(trip.id)
      toast('Cancelled. The gate has been told.')
      onClose()
    } catch (e) {
      setError(explainTripError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Cancel ${first}'s ${WORD[trip.direction]}?`}
      description={trip.direction === 'pickup' ? `The gate team hears that it's cancelled. ${first} stays at school until the usual time.` : "The gate team hears that it's cancelled."}>
      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Button variant="secondary" icon={<CircleCheck />} onClick={onClose}>Keep it</Button>
        <Button variant="danger" icon={<X />} loading={busy} onClick={() => void cancel()}>Cancel {WORD[trip.direction]}</Button>
      </div>
    </Sheet>
  )
}
