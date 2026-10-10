import { useState } from 'react'
import { Check, Copy, Link2, MessageSquareText, Send, UserPlus, WhatsApp } from '../../ui/icons'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { CodeTiles } from '../../ui/CodeTiles'
import { SelectField, TextField } from '../../ui/Field'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatTime, indiaClock } from '../../domain/time'
import { now } from '../../lib/clock'
import { explainTripError, type Trip } from './api'
import { formatMobile, normalizeMobile, smsUrl, whatsappUrl } from '../../domain/contact'
import { supabase } from '../../lib/supabase'
import { savePerson, useLive, type SavedPerson } from '../school/api'
import { useMyId } from '../family/parentData'
import { arrivalSlots, clockTime } from './rules'
import { inviteCollector, whatsappText, type Invite } from './tracking'

const RELATIONS = ['Driver', 'Grandparent', 'Relative', 'Family friend', 'Neighbour', 'Nanny', 'Other'] as const

/** The one-time link and code, ready to send. The link can't be shown again; Resend makes a new one. */
function LinkReady({ invite, name, child, at, sendTo, direction = 'pickup', onDone }: { invite: Invite; name: string; child: string; at: string; sendTo: string; direction?: 'pickup' | 'dropoff'; onDone: () => void }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const first = name.split(' ')[0]!
  const text = whatsappText({ collector: name, child, at, token: invite.token, code: invite.code, direction })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast('Copied. Paste it into any message.')
    } catch {
      toast("Couldn't copy on this device. Send it by WhatsApp or text message instead.")
    }
  }
  return (
    <>
      {direction === 'pickup' ? (
        <>
          <p className="text-body text-ink-2">{first} shows this code at the gate.</p>
          <div className="mt-5 rounded-xl bg-sunken px-4 py-6">
            <CodeTiles code={invite.code} size="xl" />
            <p className="mt-4 text-center text-small font-bold text-ink-2">Arriving about {at} · {formatMobile(sendTo)}</p>
          </div>
        </>
      ) : (
        // A drop-off needs no code: the gate team checks the child in (D58).
        <div className="rounded-xl bg-sunken px-4 py-5">
          <p className="text-h4">{first} is dropping {child} off, about {at}</p>
          <p className="mt-1 text-small font-semibold text-ink-2">The gate team knows who is coming and checks {child} in. No code needed. {formatMobile(sendTo)}</p>
        </div>
      )}
      <Notice tone="info" className="mt-4">Send it now: the link is shown only once.</Notice>
      <SheetFooter>
        <p className="kicker mb-2.5">Send it to {first}</p>
        <div className="flex flex-wrap gap-2.5 [&>*]:grow [&>*]:basis-40">
          <a className="btn btn--primary btn--xl" href={whatsappUrl(sendTo, text)} target="_blank" rel="noopener noreferrer" aria-label={`Send on WhatsApp to ${formatMobile(sendTo)}`}>
            <WhatsApp aria-hidden />WhatsApp
          </a>
          <a className="btn btn--secondary btn--xl" href={smsUrl(sendTo, text)} aria-label={`Send by text message to ${formatMobile(sendTo)}`}>
            <MessageSquareText aria-hidden />SMS
          </a>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2.5 [&>*]:grow [&>*]:basis-36">
          <Button variant="secondary" icon={copied ? <Check /> : <Copy />} aria-label={copied ? 'Copied' : 'Copy the message'} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
          <Button variant="quiet" onClick={onDone}>Done</Button>
        </div>
      </SheetFooter>
    </>
  )
}

/**
 * "Someone else is collecting" or "dropping off" (TRIP-3, D3–D5, D58): for a person the school hasn't added as family.
 * They get a one-time link; no app or sign-in. Collecting, they show a 4-digit code at the gate; dropping off, the gate
 * checks the child in. The school's family never needs a link (they're known by name).
 */
export function SomeoneElseSheet({ open, onClose, childId, first, nowMs, direction = 'pickup' }: {
  open: boolean; onClose: () => void; childId: string; first: string; nowMs: number; direction?: 'pickup' | 'dropoff'
}) {
  const nowMin = indiaClock(new Date(nowMs)).minutes
  // Any time today (D56), within the 3 hours a trip can be booked ahead.
  const slots = arrivalSlots(nowMin, { to: nowMin + 180 })
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [wa, setWa] = useState('')
  const [relation, setRelation] = useState<string>('Driver')
  const [otherRel, setOtherRel] = useState('')
  const [at, setAt] = useState<number | null>(slots[0] ?? null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ invite: Invite; sendTo: string } | null>(null)
  // Saved people (Account): a regular driver is one tap away. Someone new can be saved for next time.
  const me = useMyId()
  const saved = useLive<SavedPerson>('saved_people', () => supabase.from('saved_people').select('id, full_name, phone, relation').order('created_at'), [])
  const [who, setWho] = useState<string>('new')
  const [remember, setRemember] = useState(true)
  const pickSaved = (id: string) => {
    setWho(id)
    const p = saved.rows?.find((x) => x.id === id)
    if (!p) { setName(''); setPhone(''); setRelation('Driver'); return }
    setName(p.full_name); setPhone(formatMobile(p.phone))
    if ((RELATIONS as readonly string[]).includes(p.relation)) setRelation(p.relation)
    else { setRelation('Other'); setOtherRel(p.relation) }
  }

  async function create() {
    const e: Record<string, string> = {}
    const mobile = normalizeMobile(phone)
    const whatsapp = wa.trim() ? normalizeMobile(wa) : mobile
    const rel = relation === 'Other' ? otherRel.trim() : relation
    if (name.trim().length < 2) e.name = 'Enter their full name.'
    if (!mobile) e.phone = 'Enter a 10-digit mobile number, or the full number with + and the country code.'
    if (wa.trim() && !whatsapp) e.wa = 'Enter a mobile number, or leave this empty.'
    if (!rel) e.rel = 'Say how they know the child.'
    if (at === null) e.at = 'Choose when they will arrive.'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    setError(null)
    try {
      const invite = await inviteCollector(childId, Math.max(0, at! - indiaClock(new Date(now())).minutes), name.trim(), mobile!, rel, null, direction)
      setSent({ invite, sendTo: whatsapp! })
      if (who === 'new' && remember && me) void savePerson(me, { full_name: name.trim(), phone: mobile!, relation: rel }).then(() => saved.reload(), () => {})
    } catch (err) {
      setError(explainTripError(err as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <Sheet open={open} onClose={onClose} title={`Link ready for ${name.trim().split(' ')[0]}`}>
        <LinkReady invite={sent.invite} name={name.trim()} child={first} at={formatTime(at!)} sendTo={sent.sendTo} direction={direction} onDone={onClose} />
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title={direction === 'pickup' ? `Someone else is collecting ${first}` : `Someone else is dropping ${first} off`}
      description={direction === 'pickup' ? 'A one-time link with a 4-digit gate code. No app needed.' : 'A one-time link so the gate knows who is coming. No app or code needed.'}>
      {!!saved.rows?.length && (
        <fieldset className="mb-5">
          <legend className="kicker mb-2.5">Who</legend>
          <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Who">
            {saved.rows.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={who === p.id} onClick={() => pickSaved(p.id)} className="choice flex items-center gap-3 p-3 text-left">
                <Avatar name={p.full_name} color="var(--ink-3)" size="sm" />
                <span className="min-w-0"><span className="block truncate text-h4">{p.full_name}</span><span className="block truncate text-caption font-semibold text-ink-2">{p.relation}, {formatMobile(p.phone)}</span></span>
              </button>
            ))}
            <button type="button" role="radio" aria-checked={who === 'new'} onClick={() => pickSaved('new')} className="choice flex items-center gap-3 p-3 text-left">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden><UserPlus className="size-5" /></span>
              <span className="min-w-0"><span className="block text-h4">Someone new</span><span className="block text-caption font-semibold text-ink-2">Name, mobile and relation</span></span>
            </button>
          </div>
        </fieldset>
      )}
      <div className={`grid gap-4 ${who !== 'new' ? 'hidden' : ''}`}>
        <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Ramesh Kulkarni" autoComplete="off" maxLength={80} error={errors.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Mobile" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" autoComplete="off" error={errors.phone} />
          <SelectField label="Relation" value={relation} onValue={(v) => setRelation(v)} error={relation === 'Other' ? undefined : errors.rel}>
            {RELATIONS.map((r) => <option key={r}>{r}</option>)}
          </SelectField>
        </div>
        {relation === 'Other' && <TextField label="How they know the child" value={otherRel} onChange={(e) => setOtherRel(e.target.value)} maxLength={40} placeholder="For example, Swimming coach" error={errors.rel} />}
        <TextField label="WhatsApp number, if different (optional)" type="tel" inputMode="tel" value={wa} onChange={(e) => setWa(e.target.value)} autoComplete="off" error={errors.wa} />
        <label className="flex min-h-11 items-center gap-3 text-small font-bold">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-5 accent-[var(--accent)]" />
          Save them for next time
        </label>
      </div>
      {who !== 'new' && (errors.name || errors.phone) && <Notice tone="danger">{errors.name ?? errors.phone}</Notice>}

      <fieldset className="mt-6">
        <legend className="kicker">Arriving about</legend>
        {slots.length ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Arrival time">
            {slots.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={t === at} onClick={() => setAt(t)}
                className="choice grid min-h-12 place-items-center px-2 py-2.5 text-center">
                <span className="text-h4 tabular-nums">{formatTime(t)}</span>
              </button>
            ))}
          </div>
        ) : <Notice tone="warning" className="mt-3">There are no times left today. Please call the school.</Notice>}
        {errors.at && <p className="mt-2 text-small font-bold text-danger" role="alert">{errors.at}</p>}
      </fieldset>
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
      setInvite(await inviteCollector(trip.child_id, minutes, who, phone, trip.traveller_relation ?? 'Other', trip.off_schedule ? trip.reason : null, trip.direction))
    } catch (err) {
      setError(explainTripError(err as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={invite ? `New link for ${who.split(' ')[0]}` : `Resend ${who.split(' ')[0]}'s link?`}
      description={invite ? undefined : trip.direction === 'pickup' ? `${who} gets a new link and code for the same time. The old link and code stop working at once.` : `${who} gets a new link for the same time. The old link stops working at once.`}>
      {invite ? (
        <LinkReady invite={invite} name={who} child={first} at={clockTime(trip.arrive_at)} sendTo={phone} direction={trip.direction} onDone={onClose} />
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
