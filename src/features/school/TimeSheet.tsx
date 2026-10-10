import { useState } from 'react'
import { Clock } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatTime, GATE_CLOSES, GATE_OPENS, indiaClock, type Minutes } from '../../domain/time'
import type { Direction } from '../../domain/programme'
import { explainDbError } from '../admin/api'
import { arrivalSlots } from '../trips/rules'
import { changeDayTime } from './api'

const WORD: Record<Direction, string> = { dropoff: 'drop-off', pickup: 'pickup' }
const hhmm = (m: Minutes) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/**
 * Change a child's drop-off or pickup for today only (D15), to any time in the gate's day (D56). Every slot says how busy
 * the gate is then. Anyone on the way moves with it, and the gate hears the new time.
 */
export function TimeSheet({ open, onClose, childId, first, direction, current, usual, nowMs, busy, onBehalfOf, onSaved }: {
  open: boolean; onClose: () => void; childId: string; first: string; direction: Direction
  current: Minutes | null; usual: Minutes | null; nowMs: number; busy: (at: Minutes) => number; onBehalfOf?: string; onSaved?: () => void
}) {
  const toast = useToast()
  const slots = arrivalSlots(indiaClock(new Date(nowMs)).minutes, { from: GATE_OPENS, to: GATE_CLOSES })
  const [at, setAt] = useState<Minutes | null>(slots.find((t) => t === current) ?? null)
  const [busyState, setBusyState] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (at === null) return
    setBusyState(true)
    setError(null)
    try {
      await changeDayTime(childId, direction, hhmm(at), null)
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
      description={`${usual !== null ? `Usually ${formatTime(usual)}. ` : ''}This changes today only.`}>
      {slots.length ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="New time">
          {slots.map((t) => {
            const n = busy(t)
            return (
              <button key={t} type="button" role="radio" aria-checked={t === at} onClick={() => setAt(t)} className="choice grid justify-items-center gap-0.5 px-2 py-2.5 text-center">
                <span className="text-h4 tabular-nums">{formatTime(t)}</span>
                <span className={`text-caption font-semibold ${n >= 2 ? 'text-danger' : 'text-ink-2'}`}>
                  {n >= 2 ? `Busy, ${n} ${WORD[direction]}s` : n === 1 ? '1 other' : 'Quiet'}
                </span>
              </button>
            )
          })}
        </div>
      ) : <Notice tone="warning">No more times today. Please call the school.</Notice>}
      {error && <Notice tone="danger" className="mt-4">{error}</Notice>}
      <SheetFooter>
        <Button size="xl" className="w-full" icon={<Clock />} loading={busyState} disabled={at === null || at === current} onClick={() => void save()}>
          {onBehalfOf ? `Save for ${onBehalfOf}` : "Save today's time"}
        </Button>
        <p className="mt-2.5 text-center text-caption font-semibold text-ink-3">The gate team hears the new time straight away.</p>
      </SheetFooter>
    </Sheet>
  )
}
