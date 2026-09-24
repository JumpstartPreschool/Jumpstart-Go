import { useState } from 'react'
import { Check, Copy, Link2, MessageCircle, Send } from 'lucide-react'
import { Button } from '../../ui/Button'
import { CodeTiles } from '../../ui/CodeTiles'
import { SelectField, TextField } from '../../ui/Field'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatTime, indiaClock } from '../../domain/time'
import { windowFor, type Programme } from '../../domain/programme'
import { now } from '../../lib/clock'
import { explainTripError, type Trip } from './api'
import { formatPhone, toE164, whatsappUrl } from './geo'
import { arrivalSlots, clockTime, formatRange } from './rules'
import { inviteCollector, whatsappText, type Invite } from './tracking'
import { ReasonPicker } from './TripSheets'

const RELATIONS = ['Driver', 'Grandparent', 'Relative', 'Family friend', 'Neighbour', 'Nanny', 'Other'] as const

/** The one-time link and code, ready to send. The link can't be shown again; Resend makes a new one. */
function LinkReady({ invite, name, child, at, sendTo, onDone }: { invite: Invite; name: string; child: string; at: string; sendTo: string; onDone: () => void }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const first = name.split(' ')[0]!
  const text = whatsappText({ collector: name, child, at, token: invite.token, code: invite.code })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast('Copied. Paste it into any message.')
    } catch {
      toast("Couldn't copy on this device. Use Send on WhatsApp instead.")
    }
  }
  return (
    <>
      <p className="text-body text-ink-2">{first} shows this code at the gate. The link works on one phone and stops after the trip.</p>
      <div className="mt-5 rounded-xl bg-sunken px-4 py-6">
        <CodeTiles code={invite.code} size="xl" />
        <p className="mt-4 text-center text-small font-bold text-ink-2">Arriving about {at} · {formatPhone(sendTo)}</p>
      </div>
      <Notice tone="info" className="mt-4">Send it now: for safety the link is shown only once. Resend link makes a new link and code, and the old ones stop working.</Notice>
      <SheetFooter>
        <a className="btn btn--primary btn--xl w-full" href={whatsappUrl(sendTo, text)} target="_blank" rel="noopener noreferrer">
          <MessageCircle aria-hidden />Send on WhatsApp
        </a>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <Button variant="secondary" icon={copied ? <Check /> : <Copy />} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy message'}</Button>
          <Button variant="quiet" onClick={onDone}>Done</Button>
        </div>
      </SheetFooter>
    </>
  )
}

/**
 * "Someone else is collecting" (TRIP-3, D3–D5): for a person the school hasn't added as family. They get a link and a
 * 4-digit code for the gate; no app or sign-in. The school's family never needs a link (they're handed over by name).
 */
export function SomeoneElseSheet({ open, onClose, childId, first, programme, nowMs }: {
  open: boolean; onClose: () => void; childId: string; first: string; programme: Programme; nowMs: number
}) {
  const nowMin = indiaClock(new Date(nowMs)).minutes
  const slots = arrivalSlots(programme, 'pickup', nowMin)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [wa, setWa] = useState('')
  const [relation, setRelation] = useState<string>('Driver')
  const [otherRel, setOtherRel] = useState('')
  const [at, setAt] = useState<number | null>(slots.find((s) => s.state === 'inside')?.at ?? slots[0]?.at ?? null)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ invite: Invite; sendTo: string } | null>(null)

  const slot = slots.find((s) => s.at === at)
  const needsReason = !!slot && slot.state !== 'inside'

  async function create() {
    const e: Record<string, string> = {}
    const mobile = toE164(phone)
    const whatsapp = wa.trim() ? toE164(wa) : mobile
    const rel = relation === 'Other' ? otherRel.trim() : relation
    if (name.trim().length < 2) e.name = 'Enter their full name.'
    if (!mobile) e.phone = 'Enter a 10-digit mobile number, or the full number with + and the country code.'
    if (wa.trim() && !whatsapp) e.wa = 'Enter a mobile number, or leave this empty.'
    if (!rel) e.rel = 'Say how they know the child.'
    if (at === null) e.at = 'Choose when they will arrive.'
    if (needsReason && !reason.trim()) e.reason = 'Tell the school why it is outside the usual time.'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    setError(null)
    try {
      const invite = await inviteCollector(childId, Math.max(0, at! - indiaClock(new Date(now())).minutes), name.trim(), mobile!, rel, needsReason ? reason.trim() : null)
      setSent({ invite, sendTo: whatsapp! })
    } catch (err) {
      setError(explainTripError(err as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <Sheet open={open} onClose={onClose} title={`Link ready for ${name.trim().split(' ')[0]}`}>
        <LinkReady invite={sent.invite} name={name.trim()} child={first} at={formatTime(at!)} sendTo={sent.sendTo} onDone={onClose} />
      </Sheet>
    )
  }

  const win = formatRange(windowFor(programme, 'pickup'))
  return (
    <Sheet open={open} onClose={onClose} title={`Someone else is collecting ${first}`}
      description="For someone the school hasn't added as family. They get a link with a 4-digit code for the gate. No app, no sign-in.">
      <div className="grid gap-4">
        <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Ramesh Kulkarni" autoComplete="off" maxLength={80} error={errors.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Mobile" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" autoComplete="off" error={errors.phone} />
          <SelectField label="Relation" value={relation} onChange={(e) => setRelation(e.target.value)} error={relation === 'Other' ? undefined : errors.rel}>
            {RELATIONS.map((r) => <option key={r}>{r}</option>)}
          </SelectField>
        </div>
        {relation === 'Other' && <TextField label="How they know the child" value={otherRel} onChange={(e) => setOtherRel(e.target.value)} maxLength={40} placeholder="For example, Swimming coach" error={errors.rel} />}
        <TextField label="WhatsApp number, if different (optional)" type="tel" inputMode="tel" value={wa} onChange={(e) => setWa(e.target.value)} autoComplete="off" error={errors.wa} />
      </div>

      <fieldset className="mt-6">
        <legend className="kicker">Arriving about</legend>
        <p className="mt-1 text-caption font-semibold text-ink-2">{first}'s pickup window is {win}.</p>
        {slots.length ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Arrival time">
            {slots.map((s) => (
              <button key={s.at} type="button" role="radio" aria-checked={s.at === at} onClick={() => setAt(s.at)}
                className="choice grid justify-items-center gap-0.5 px-2 py-2.5 text-center">
                <span className="text-h4 tabular-nums">{formatTime(s.at)}</span>
                <span className={`text-caption font-semibold ${s.state === 'inside' ? 'text-ink-2' : 'text-warning'}`}>{s.state === 'inside' ? 'In window' : s.state === 'early' ? 'Early' : 'Late'}</span>
              </button>
            ))}
          </div>
        ) : <Notice tone="warning" className="mt-3">The gate closes at 7:15 PM, so there are no times left today. Please call the school.</Notice>}
        {errors.at && <p className="mt-2 text-small font-bold text-danger" role="alert">{errors.at}</p>}
      </fieldset>
      {needsReason && (
        <div className="mt-5 grid gap-2">
          <ReasonPicker onChange={setReason} />
          {errors.reason && <p className="text-small font-bold text-danger" role="alert">{errors.reason}</p>}
        </div>
      )}
      {error && <Notice tone="danger" className="mt-5">{error}</Notice>}
      <SheetFooter>
        <Button size="xl" className="w-full" icon={<Link2 />} loading={busy} disabled={!slots.length} onClick={() => void create()}>Create the link</Button>
        <p className="mt-2.5 text-center text-caption font-semibold text-ink-3">The gate is told at once. You can cancel it any time.</p>
      </SheetFooter>
    </Sheet>
  )
}

/**
 * Resend link: a new link and code for the same person and time (the old ones stop working at once), for when the
 * message was lost or they changed phones.
 */
export function ResendSheet({ open, onClose, trip, first, nowMs }: { open: boolean; onClose: () => void; trip: Trip; first: string; nowMs: number }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<Invite | null>(null)
  const who = trip.traveller_name
  const phone = trip.traveller_phone ?? ''
  async function resend() {
    setBusy(true)
    setError(null)
    try {
      const minutes = Math.max(0, Math.ceil((Date.parse(trip.arrive_at) - nowMs) / 60_000))
      setInvite(await inviteCollector(trip.child_id, minutes, who, phone, trip.traveller_relation ?? 'Other', trip.off_schedule ? trip.reason : null))
    } catch (err) {
      setError(explainTripError(err as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={invite ? `New link for ${who.split(' ')[0]}` : `Resend ${who.split(' ')[0]}'s link?`}
      description={invite ? undefined : `${who} gets a new link and code for the same time. The old link and code stop working at once.`}>
      {invite ? (
        <LinkReady invite={invite} name={who} child={first} at={clockTime(trip.arrive_at)} sendTo={phone} onDone={onClose} />
      ) : (
        <>
          {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Button variant="secondary" onClick={onClose}>Keep the old link</Button>
            <Button icon={<Send />} loading={busy} disabled={!phone} onClick={() => void resend()}>Make a new link</Button>
          </div>
        </>
      )}
    </Sheet>
  )
}
