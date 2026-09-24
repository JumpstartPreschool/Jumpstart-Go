import { useState } from 'react'
import { Bell, CircleCheck, Timer, TriangleAlert, X } from 'lucide-react'
import { Button } from '../../ui/Button'
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

function CheckLine({ arrival, state, first, direction, programme }: { arrival: Minutes; state: Arrival; first: string; direction: Direction; programme: Programme }) {
  const win = formatRange(windowFor(programme, direction))
  if (state === 'inside') return <Notice tone="success">Arriving about {formatTime(arrival)}, inside {first}'s {WORD[direction]} window ({win}).</Notice>
  if (state === 'closed') return <Notice tone="danger">{formatTime(arrival)} is outside school hours. Please call the school.</Notice>
  return (
    <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
      {formatTime(arrival)} is {state === 'early' ? 'before' : 'after'} {first}'s {WORD[direction]} window ({win}). Tell the school why, and a coordinator will acknowledge it.
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
  const nearest = (m: number) => MINUTE_CHOICES.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a))
  const [minutes, setMinutes] = useState<number>(trip ? nearest(minutesUntil(trip.arrive_at, nowMs)) : 20)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const arrival = nowMin + minutes
  const state = checkArrival(programme, direction, arrival)
  const needsReason = state === 'early' || state === 'late'
  const canSend = state !== 'closed' && (!needsReason || reason.trim().length > 0)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await startTrip(childId, direction, minutes, needsReason ? reason.trim() : null)
      toast(trip ? `New time sent: about ${formatTime(arrival)}.` : `The school knows you're coming, about ${formatTime(arrival)}.`)
      onClose()
    } catch (e) {
      setError(explainTripError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`On my way to ${direction === 'pickup' ? 'pick up' : 'drop off'} ${first}`}>
      <p className="kicker">I'll reach the school in</p>
      <div className="mt-3 grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Minutes until you arrive">
        {MINUTE_CHOICES.map((n) => {
          const closed = checkArrival(programme, direction, nowMin + n) === 'closed'
          return (
            <button key={n} type="button" role="radio" aria-checked={n === minutes} disabled={closed} onClick={() => setMinutes(n)}
              className="choice grid justify-items-center gap-0.5 px-2 py-2.5 text-center">
              <span className="text-[22px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{n}<span className="ml-0.5 text-small font-bold">min</span></span>
              <span className="text-caption font-semibold text-ink-2 tabular-nums">{formatTime(nowMin + n)}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-4 grid gap-4">
        <CheckLine arrival={arrival} state={state} first={first} direction={direction} programme={programme} />
        {needsReason && <ReasonPicker onChange={setReason} />}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
      <SheetFooter>
        <Button size="xl" className="w-full" icon={<Bell />} loading={busy} disabled={!canSend} onClick={() => void send()}>
          {trip ? 'Update the school' : 'Tell the school'}
        </Button>
        <p className="mt-2.5 text-center text-caption font-semibold text-ink-3">The coordinators hear it straight away. You can change or cancel it.</p>
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
          : <Notice tone="warning">{formatTime(arrival)} is past the window, so it's flagged and a coordinator acknowledges it.</Notice>}
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
      description={trip.direction === 'pickup' ? `The coordinators hear that it's cancelled. ${first} stays at school until the usual time.` : "The coordinators hear that it's cancelled."}>
      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Button variant="secondary" icon={<CircleCheck />} onClick={onClose}>Keep it</Button>
        <Button variant="danger" icon={<X />} loading={busy} onClick={() => void cancel()}>Cancel {WORD[trip.direction]}</Button>
      </div>
    </Sheet>
  )
}
