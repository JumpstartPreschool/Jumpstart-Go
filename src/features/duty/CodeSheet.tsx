import { useEffect, useState } from 'react'
import { Delete, Lock, Phone, X } from 'lucide-react'
import { Sheet } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { explainTripError, type Trip } from '../trips/api'
import { formatPhone } from '../trips/geo'
import { handoverWithCode } from '../trips/tracking'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'] as const

/**
 * Hand over to the person a parent sent (D4, TRIP-3): the coordinator types the 4-digit code shown on their phone.
 * The server checks it; three wrong codes lock the handover until the parent sends a new link. Works with the
 * on-screen keypad or a keyboard.
 */
export function CodeSheet({ open, onClose, trip, childName, onDone }: { open: boolean; onClose: () => void; trip: Trip; childName: string; onDone: (locked: boolean) => void }) {
  const [code, setCode] = useState('')
  const [tries, setTries] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)
  const [wrong, setWrong] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const who = trip.traveller_name.split(' ')[0]!

  async function check(full: string) {
    setBusy(true)
    setError(null)
    try {
      const r = await handoverWithCode(trip.id, full)
      if (r.ok) return onDone(false)
      setCode('')
      setWrong(!r.locked)
      setTries(r.tries_left ?? 0)
      if (r.locked) { setLocked(true); onDone(true) }
    } catch (e) {
      setCode('')
      setError(explainTripError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  const press = (k: (typeof KEYS)[number]) => {
    if (busy || locked) return
    setWrong(false)
    if (k === 'clear') return setCode('')
    if (k === 'del') return setCode((c) => c.slice(0, -1))
    if (code.length >= 4) return
    const next = code + k
    setCode(next)
    if (next.length === 4) void check(next)
  }

  // A keyboard works too (iPad with a keyboard case, or a laptop at the desk).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key as (typeof KEYS)[number])
      else if (e.key === 'Backspace') press('del')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <Sheet open={open} onClose={onClose} title={`${who}'s code`}
      description={locked ? undefined : `Ask ${who} to show the code on their phone, then type it here.${tries !== null ? ` ${tries} ${tries === 1 ? 'try' : 'tries'} left.` : ' Three tries.'}`}>
      {locked ? (
        <div className="grid gap-4">
          <Notice tone="danger" icon={<Lock />}>Handover locked after three wrong codes. Don't release {childName}. Call the parent: they can send {who} a new link and code.</Notice>
          {trip.traveller_phone && <a className="btn btn--secondary btn--lg" href={`tel:${trip.traveller_phone}`}><Phone aria-hidden />Call {who}, {formatPhone(trip.traveller_phone)}</a>}
        </div>
      ) : (
        <div className="mx-auto grid w-full max-w-[340px] gap-5">
          <div className={`grid grid-cols-4 gap-2.5 ${wrong ? 'animate-[shake_320ms_ease-in-out]' : ''}`} role="status" aria-live="polite" aria-label={`${code.length} of 4 digits entered`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`grid h-[72px] place-items-center rounded-lg text-[34px] font-extrabold tabular-nums transition-colors duration-150 ${
                wrong ? 'bg-danger-soft text-danger shadow-[inset_0_0_0_2px_var(--danger)]'
                  : i === code.length ? 'bg-surface shadow-[inset_0_0_0_2px_var(--accent)]' : 'bg-sunken'}`}>
                {code[i] ?? ''}
              </span>
            ))}
          </div>
          {wrong && <p className="-mt-2 text-center text-small font-bold text-danger" role="alert">That code doesn't match. Check it with {who}.</p>}
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="grid grid-cols-3 gap-2.5" aria-label="Keypad">
            {KEYS.map((k) => (
              <button key={k} type="button" disabled={busy} onClick={() => press(k)} aria-label={k === 'clear' ? 'Clear' : k === 'del' ? 'Delete' : k}
                className="grid h-16 place-items-center rounded-lg bg-sunken text-[26px] font-bold tabular-nums text-ink transition-[background-color,transform] duration-100 hover:bg-[var(--sunken-hover)] active:translate-y-0.5 active:bg-[var(--sunken-hover)] disabled:opacity-50">
                {k === 'clear' ? <X className="size-6" aria-hidden /> : k === 'del' ? <Delete className="size-6" aria-hidden /> : k}
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}
