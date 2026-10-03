import { useState } from 'react'
import { Bell, CircleCheck, Clock, MessageSquareText, Timer, TriangleAlert, X } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { SelectField } from '../../ui/Field'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatTime, indiaClock, type Minutes } from '../../domain/time'
import { windowFor, type Direction, type Programme } from '../../domain/programme'
import { cancelTrip, explainTripError, runningLate, startTrip, type Trip } from './api'
import { checkArrival, clockTime, formatRange, MINUTE_CHOICES, REASONS, type Arrival } from './rules'

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
export function OnMyWaySheet({ open, onClose, onChanged, childId, first, direction, programme, trip, nowMs }: {
  open: boolean; onClose: () => void; onChanged?: () => void; childId: string; first: string; direction: Direction; programme: Programme; trip: Trip | null; nowMs: number
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
      onChanged?.()
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
              className="choice grid min-h-[200px] min-w-0 justify-items-center content-center gap-2 px-1.5 py-6 text-center sm:min-h-[228px]">
              <span className="text-[48px] font-extrabold leading-none tracking-[-0.04em] tabular-nums min-[360px]:text-[64px] sm:text-[78px]">{n}</span>
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

const LATE_CHOICES = [5, 10, 15] as const

/**
 * Running late (0043): +5, +10 or +15 minutes on the time the school has, or a later time today, and an optional note.
 * It changes the trip's real arrival time, so the gate's queue, reminders and announcements all follow the new time;
 * the gate hears "… is running late" at once. The child's window is shown as guidance only: it never stops a late time.
 */
export function LateSheet({ open, onClose, onChanged, trip, first, programme, nowMs }: { open: boolean; onClose: () => void; onChanged?: () => void; trip: Trip; first: string; programme: Programme; nowMs: number }) {
  const toast = useToast()
  const [extra, setExtra] = useState<(typeof LATE_CHOICES)[number]>(10)
  const [custom, setCustom] = useState<Minutes | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nowMin = indiaClock(new Date(nowMs)).minutes
  // Later than the time the school has (or now, if that has passed), as the server counts it.
  // The same minute the parent's card shows (clockTime), so the two never disagree by one.
  const base = Math.max(indiaClock(new Date(trip.arrive_at)).minutes, nowMin)
  // Custom time: 5-minute clock times after that, up to 3 hours from now and before midnight.
  const customFrom = Math.floor(base / 5) * 5 + 5
  const customTimes = Array.from({ length: Math.max(0, Math.floor((Math.min(nowMin + 180, 23 * 60 + 55) - customFrom) / 5) + 1) }, (_, i) => customFrom + i * 5)
  const arrival = custom ?? base + extra
  const state = checkArrival(programme, trip.direction, arrival)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const at = new Date(nowMs + (arrival - nowMin) * 60_000)
      // The time shown is the time the change builds on: if it has moved since (a first tap whose reply was lost, the
      // other parent), the server refuses instead of adding the minutes twice.
      const done = await runningLate(trip.id, custom === null ? { minutes: extra } : { at }, note, trip.arrive_at)
      toast(`The school knows you're running late. New arrival: about ${clockTime(done.arrive_at)}.`)
      onChanged?.()
      onClose()
    } catch (e) {
      const err = e as { code?: string; message?: string }
      setError(explainTripError(err))
      // Stale: show the new time the school has, and let the parent choose again from it.
      if (err.message?.startsWith('stale:')) { setCustom(null); onChanged?.() }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Running late?" description={`The school has about ${formatTime(base)}. How much later?`}>
      <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="How much later">
        {LATE_CHOICES.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={custom === null && n === extra} disabled={base + n > 23 * 60 + 59}
            onClick={() => { setExtra(n); setCustom(null) }} className="choice grid min-h-[104px] min-w-0 content-center justify-items-center gap-1 px-1.5 py-3 text-center">
            <span className="text-[26px] font-extrabold leading-none tracking-[-0.03em] tabular-nums min-[360px]:text-[30px]">+{n}<span className="block text-small font-bold leading-tight">min</span></span>
            <span className="text-caption font-semibold leading-tight text-ink-2 tabular-nums">about {formatTime(base + n)}</span>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={custom !== null} disabled={!customTimes.length}
          onClick={() => custom === null && customTimes.length && setCustom(customTimes.find((t) => t >= base + 20) ?? customTimes[0]!)}
          className="choice col-span-3 flex min-h-14 items-center justify-center gap-2.5 px-4 text-h4 [&_svg]:size-5">
          <Clock aria-hidden />{custom === null ? 'Custom time' : <>Custom time<span className="tabular-nums text-accent-ink">· {formatTime(custom)}</span></>}
        </button>
      </div>
      {custom !== null && (
        <div className="mt-4">
          <SelectField label="Expected arrival" value={custom} onValue={(v) => setCustom(Number(v))}>
            {customTimes.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
          </SelectField>
        </div>
      )}
      <div className="mt-4 grid gap-1.5">
        <label htmlFor="late-note" className="px-0.5 text-small font-bold text-ink-2">Add a note (optional)</label>
        <div className="input">
          <MessageSquareText aria-hidden />
          <input id="late-note" value={note} maxLength={120} placeholder="Traffic near school" onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="px-0.5 text-caption font-semibold text-ink-2">The gate team reads it. It isn't announced.</p>
      </div>
      <div className="mt-4 grid gap-4">
        {state === 'inside' ? <Notice tone="success">About {formatTime(arrival)} is still inside {first}'s {WORD[trip.direction]} window.</Notice>
          : <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>About {formatTime(arrival)} is after {first}'s usual {WORD[trip.direction]} time. That's fine: the gate team will see it.</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
      <SheetFooter>
        <Button size="xl" variant="sunshine" className="w-full" icon={<Timer />} loading={busy} onClick={() => void send()}>
          Tell the school
        </Button>
        <p className="mt-2.5 text-center text-caption font-semibold text-ink-3">The gate team hears it straight away.</p>
      </SheetFooter>
    </Sheet>
  )
}

/** Cancel a trip on the way. The gate hears that it's cancelled. */
export function CancelSheet({ open, onClose, onChanged, trip, first }: { open: boolean; onClose: () => void; onChanged?: () => void; trip: Trip; first: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      await cancelTrip(trip.id)
      onChanged?.()
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
