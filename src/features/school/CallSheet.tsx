import { useState, type ReactNode } from 'react'
import { CalendarX, Clock, Headset, MessageSquare, Navigation } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatTime, indiaClock, type Minutes } from '../../domain/time'
import { windowFor, type Direction } from '../../domain/programme'
import { explainDbError } from '../admin/api'
import { arrivalSlots, checkArrival, formatRange } from '../trips/rules'
import { ReasonPicker } from '../trips/TripSheets'
import { logCall, type CallWhat } from './api'
import type { SchoolChild } from './useSchoolDay'

type What = CallWhat['what']
const WHAT: Array<{ key: What; label: string; icon: ReactNode }> = [
  { key: 'otw', label: 'On the way', icon: <Navigation /> },
  { key: 'time', label: 'New time today', icon: <Clock /> },
  { key: 'absent', label: 'Absent today', icon: <CalendarX /> },
  { key: 'note', label: 'Just a message', icon: <MessageSquare /> },
]
const ABSENT = ['Unwell', 'Family event', 'Travelling', 'Something else'] as const
const hhmm = (m: Minutes) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const WORD: Record<Direction, string> = { dropoff: 'drop-off', pickup: 'pickup' }

/**
 * Log a call (D25, Screen Book v3): a parent phoned or walked in. Staff choose the child, who called and what they
 * said; on the way, a new time or an absence reaches the gate at once, marked "Phoned in". Every call is listed.
 */
export function CallSheet({ open, onClose, children, initialChild, nowMs, onLogged }: {
  open: boolean; onClose: () => void; children: SchoolChild[]; initialChild?: string; nowMs: number; onLogged?: () => void
}) {
  const toast = useToast()
  const present = children.filter((c) => c.day.state !== 'away' && c.day.state !== 'collected')
  const [childId, setChildId] = useState(initialChild ?? present[0]?.id ?? '')
  const c = children.find((x) => x.id === childId)
  const [guardian, setGuardian] = useState(c?.guardians[0]?.id ?? '')
  const [what, setWhat] = useState<What>('otw')
  const [minutes, setMinutes] = useState(15)
  const [at, setAt] = useState<Minutes | null>(null)
  const [reason, setReason] = useState('')
  const [absent, setAbsent] = useState<string>('Unwell')
  const [other, setOther] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nowMin = indiaClock(new Date(nowMs)).minutes
  const direction: Direction = c && (c.day.state === 'here' || c.day.trip?.direction === 'pickup') ? 'pickup' : 'dropoff'

  const pickChild = (id: string) => { setChildId(id); setGuardian(children.find((x) => x.id === id)?.guardians[0]?.id ?? ''); setAt(null); setError(null) }
  const arrival = c?.programme ? checkArrival(c.programme, direction, what === 'otw' ? nowMin + minutes : at ?? nowMin) : 'inside'
  const needsReason = (what === 'otw' || (what === 'time' && at !== null)) && (arrival === 'early' || arrival === 'late')
  const slots = c?.programme ? arrivalSlots(c.programme, direction, nowMin, 12) : []

  async function save() {
    if (!c || !guardian) return
    const r = needsReason ? reason.trim() : null
    const call: CallWhat | null = what === 'otw' ? { what, direction, minutes, reason: r }
      : what === 'time' ? (at === null ? null : { what, direction, at: hhmm(at), reason: r })
      : what === 'absent' ? { what, reason: absent === 'Something else' ? other.trim() : absent }
      : { what, note: note.trim() }
    if (!call) return setError('Choose the new time.')
    setBusy(true)
    setError(null)
    try {
      await logCall(c.id, guardian, call)
      toast(what === 'note' ? 'Call logged.' : `Logged. The gate has ${c.first}'s ${what === 'absent' ? 'absence' : WORD[direction]} now.`)
      onLogged?.()
      onClose()
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  const chip = (on: boolean, label: ReactNode, onClick: () => void, key: string) => (
    <button key={key} type="button" role="radio" aria-checked={on} onClick={onClick} className="choice flex h-11 items-center gap-1.5 px-3.5 text-small font-bold [&_svg]:size-4">{label}</button>
  )
  const disabled = !c || !guardian || (what === 'time' && at === null) || (needsReason && !reason.trim()) || (what === 'absent' && absent === 'Something else' && !other.trim()) || (what === 'note' && !note.trim())

  return (
    <Sheet open={open} onClose={onClose} title="Log a call" description="A parent phoned or came to the desk. What you log reaches the gate's iPads at once.">
      {present.length === 0 ? <Notice>Every child has gone home or is away today.</Notice> : (
        <div className="grid gap-5">
          <fieldset><legend className="kicker mb-2">Child</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Child">{present.map((x) => chip(x.id === childId, x.first, () => pickChild(x.id), x.id))}</div>
          </fieldset>
          {c && (
            <fieldset><legend className="kicker mb-2">Who called</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Who called">{c.guardians.map((g) => chip(g.id === guardian, `${g.full_name.split(' ')[0]}, ${g.relation.split(',')[0]!.toLowerCase()}`, () => setGuardian(g.id), g.id))}</div>
            </fieldset>
          )}
          <fieldset><legend className="kicker mb-2">What</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What">{WHAT.map((w) => chip(w.key === what, <>{w.icon}{w.label}</>, () => { setWhat(w.key); setError(null) }, w.key))}</div>
          </fieldset>
          {c && what === 'otw' && (
            <fieldset><legend className="kicker mb-2">Arrives in, for the {WORD[direction]}</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Arrives in">{[10, 15, 20, 30].map((n) => chip(n === minutes, `${n} min, ${formatTime(nowMin + n)}`, () => setMinutes(n), String(n)))}</div>
            </fieldset>
          )}
          {c && what === 'time' && (
            <fieldset><legend className="kicker mb-2">New {WORD[direction]} time{c.programme ? `, window ${formatRange(windowFor(c.programme, direction))}` : ''}</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="New time">
                {slots.map((s) => (
                  <button key={s.at} type="button" role="radio" aria-checked={s.at === at} onClick={() => setAt(s.at)} className="choice grid justify-items-center px-2 py-2 text-center">
                    <span className="text-h4 tabular-nums">{formatTime(s.at)}</span>
                    <span className={`text-caption font-semibold ${s.state === 'inside' ? 'text-ink-2' : 'text-warning'}`}>{s.state === 'inside' ? 'In window' : 'Outside'}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {needsReason && <ReasonPicker onChange={setReason} />}
          {c && what === 'absent' && (
            <fieldset><legend className="kicker mb-2">Why</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Why">{ABSENT.map((r) => chip(r === absent, r, () => setAbsent(r), r))}</div>
              {absent === 'Something else' && <label className="input input--sm mt-2.5"><input value={other} onChange={(e) => setOther(e.target.value)} maxLength={80} placeholder="A few words for the school" aria-label="Reason" /></label>}
            </fieldset>
          )}
          {c && what === 'note' && (
            <div className="grid gap-1.5">
              <label htmlFor="call-note" className="px-0.5 text-small font-bold text-ink-2">What did they say?</label>
              <div className="input h-auto py-2.5"><textarea id="call-note" rows={3} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder={`For example, ${c.first} forgot the water bottle`} className="w-full resize-y bg-transparent outline-none" /></div>
            </div>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      )}
      <SheetFooter>
        <Button size="xl" className="w-full" icon={<Headset />} loading={busy} disabled={disabled} onClick={() => void save()}>Log the call</Button>
      </SheetFooter>
    </Sheet>
  )
}
