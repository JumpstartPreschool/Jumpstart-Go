import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { CircleCheck, Mail, MessageCircle, MessageSquareText, Settings } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { DEMO_AVAILABLE, isDemo } from '../../demo/demo'
import { formatMobile, smsUrl, whatsappUrl } from '../../domain/contact'
import { firstName, inviteText, type InviteDetails } from '../../../supabase/functions/_shared/invite.ts'
import { explainDbError, inviteDetails, markInvited, sendInviteEmail, type Profile } from './api'

type Load = { state: 'loading' } | { state: 'ready'; d: InviteDetails } | { state: 'error'; message: string; setup: boolean }

/** "Invited 25 Sep by email", or nothing when they haven't been. */
export function invitedLine(p: Profile): string | null {
  if (!p.invited_at) return null
  const when = new Date(p.invited_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  return `Invited ${when} by ${p.invited_via === 'sms' ? 'text' : p.invited_via === 'whatsapp' ? 'WhatsApp' : 'email'}`
}

/**
 * Invites someone the school added (D36). The email always goes: everyone with app access has one, and it's the channel
 * the app can confirm. With a mobile number, the admin can also send it by WhatsApp or text from their own phone (free).
 */
export function InviteSheet({ person, onClose, onDone }: { person: Profile; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const first = firstName(person.full_name)

  useEffect(() => {
    inviteDetails(person.id).then(
      (d) => setLoad({ state: 'ready', d }),
      (e: { code?: string; message?: string }) => setLoad({ state: 'error', message: explainDbError(e), setup: !!e.message?.startsWith('no_app_url') }),
    )
  }, [person.id])

  async function email() {
    setSending(true)
    setError(null)
    try {
      await sendInviteEmail(person.id)
      const to = load.state === 'ready' ? load.d.email : person.email
      setSent(to)
      toast(`Invitation emailed to ${to}.`)
      onDone()
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setSending(false)
    }
  }

  // Opening the phone's app is all the web can do; the admin presses send there, so it's recorded as handed over.
  // A second tap within a few seconds opens the app again but isn't recorded twice.
  const lastPhoneTap = useRef(0)
  function phone(via: 'sms' | 'whatsapp') {
    if (Date.now() - lastPhoneTap.current < 5000) return
    lastPhoneTap.current = Date.now()
    markInvited(person.id, via).then(onDone, (e: { code?: string; message?: string }) => toast(explainDbError(e)))
  }
  const already = invitedLine(person)

  return (
    <Sheet open onClose={onClose} title={`Invite ${first}`} description="They sign in with their email and a 6-digit code.">
      {load.state === 'loading' && <div className="h-40 animate-pulse rounded-xl bg-sunken" aria-label="Loading" />}
      {load.state === 'error' && (
        <Notice tone={load.setup ? 'warning' : 'danger'}>
          {load.message}
          {load.setup && <Link to="/admin/settings" className="mt-2 flex items-center gap-1.5 font-extrabold underline underline-offset-2 [&_svg]:size-4" onClick={onClose}><Settings aria-hidden />Open Settings</Link>}
        </Notice>
      )}
      {load.state === 'ready' && (() => {
        const d = load.d
        const text = inviteText(d)
        return (
          <div className="grid gap-4">
            {already && !sent && <Notice>{already}. {first} hasn't signed in yet, so you can send it again.</Notice>}
            <div className="rounded-xl bg-sunken p-4">
              <p className="kicker mb-1.5">The invitation says</p>
              <p className="text-small font-semibold text-ink">{text}</p>
            </div>
            {sent
              ? <Notice tone="success" icon={<CircleCheck aria-hidden />}>{DEMO_AVAILABLE && isDemo() ? `Demo: recorded as emailed to ${sent}. No email is sent in the demo.` : `Emailed to ${sent}. It can take a minute to arrive; ask ${first} to check their spam folder if it doesn't.`}</Notice>
              : <Button size="xl" className="w-full" icon={<Mail />} loading={sending} onClick={() => void email()}>Email the invitation to {d.email}</Button>}
            {error && <Notice tone="danger">{error}</Notice>}
            {d.phone ? (
              <div className="grid gap-2.5">
                <p className="kicker">Also send it from your phone, free</p>
                <div className="flex flex-wrap gap-2.5 [&>*]:grow [&>*]:basis-44">
                  <a className="btn btn--secondary btn--lg" href={whatsappUrl(d.phone, text)} target="_blank" rel="noopener noreferrer" aria-label={`Send on WhatsApp to ${formatMobile(d.phone)}`} onClick={() => phone('whatsapp')}>
                    <MessageCircle aria-hidden />WhatsApp
                  </a>
                  <a className="btn btn--secondary btn--lg" href={smsUrl(d.phone, text)} aria-label={`Send by text message to ${formatMobile(d.phone)}`} onClick={() => phone('sms')}>
                    <MessageSquareText aria-hidden />SMS
                  </a>
                </div>
                <p className="text-caption font-semibold text-ink-2">Opens a message to {formatMobile(d.phone)}, ready to send.</p>
              </div>
            ) : (
              <p className="text-small font-semibold text-ink-2">There's no mobile number on {first}'s record, so the invitation goes by email.</p>
            )}
          </div>
        )
      })()}
    </Sheet>
  )
}
