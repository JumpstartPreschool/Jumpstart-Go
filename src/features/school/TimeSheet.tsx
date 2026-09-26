import { useState } from 'react'
import { Clock } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatTime, indiaClock, type Minutes } from '../../domain/time'
import { windowFor, type Direction, type Programme } from '../../domain/programme'
import { explainDbError } from '../admin/api'
import { arrivalSlots, formatRange } from '../trips/rules'
import { ReasonPicker } from '../trips/TripSheets'
import { changeDayTime } from './api'

const WORD: Record<Direction, string> = { dropoff: 'drop-off', pickup: 'pickup' }
const hhmm = (m: Minutes) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/**
 * Change a child's drop-off or pickup for today only (D15). Every slot says how busy the gate is then; a time outside
 * the window asks why. Anyone on the way moves with it, and the gate hears the new time.
 */
export function TimeSheet({ open, onClose, childId, first, direction, programme, current, usual, nowMs, busy, onBehalfOf, onSaved }: {
  open: boolean; onClose: () => void; childId: string; first: string; direction: Direction; programme: Programme
  current: Minutes | null; usual: Minutes | null; nowMs: number; busy: (at: Minutes) => number; onBehalfOf?: string; onSaved?: () => void
}) {
  const toast = useToast()
  const slots = arrivalSlots(programme, direction, indiaClock(new Date(nowMs)).minutes, 16)
  const [at, setAt] = useState<Minutes | null>(slots.find((s) => s.at === current)?.at ?? null)
  const [reason, setReason] = useState('')
  const [busyState, setBusyState] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slot = slots.find((s) => s.at === at)
  const needsReason = !!slot && slot.state !== 'inside'

  async function save() {
    if (at === null) return
    setBusyState(true)
    setError(null)
    try {
      await changeDayTime(childId, direction, hhmm(at), needsReason ? reason.trim() : null)
      toast(`${first}'s ${WORD[direction]} moved to ${formatTime(at)}. The gate has it.`)
      onSaved?.()
      onClose()
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusyState(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Change ${first}'s ${WORD[direction]} today`}
      description={`${usual !== null ? `Usually ${formatTime(usual)}. ` : ''}Window ${formatRange(windowFor(programme, direction))}. This changes today only.`}>
      {slots.length ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="New time">
          {slots.map((s) => {
            const n = busy(s.at)
            return (
              <button key={s.at} type="button" role="radio" aria-checked={s.at === at} onClick={() => setAt(s.at)} className="choice grid justify-items-center gap-0.5 px-2 py-2.5 text-center">
                <span className="text-h4 tabular-nums">{formatTime(s.at)}</span>
                <span className={`text-caption font-semibold ${s.state !== 'inside' ? 'text-warning' : n >= 2 ? 'text-danger' : 'text-ink-2'}`}>
                  {s.state === 'early' ? 'Early' : s.state === 'late' ? 'Late' : n >= 2 ? `Busy, ${n} ${WORD[direction]}s` : n === 1 ? '1 other' : 'Quiet'}
                </span>
              </button>
            )
          })}
        </div>
      ) : <Notice tone="warning">No more times today. Please call the school.</Notice>}
      <div className="mt-4 grid gap-3">
        {needsReason ? <ReasonPicker onChange={setReason} /> : slot && <Notice tone="success">{formatTime(slot.at)} is inside the window.</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
      <SheetFooter>
        <Button size="xl" className="w-full" icon={<Clock />} loading={busyState} disabled={at === null || at === current || (needsReason && !reason.trim())} onClick={() => void save()}>
          {onBehalfOf ? `Save for ${onBehalfOf}` : "Save today's time"}
        </Button>
        <p className="mt-2.5 text-center text-caption font-semibold text-ink-3">The center leaders hear the new time straight away.</p>
      </SheetFooter>
    </Sheet>
  )
}
