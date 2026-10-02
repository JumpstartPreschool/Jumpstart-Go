import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { CircleCheck, MessageCircle, MessageSquareText, Settings } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatMobile, smsUrl } from '../../domain/contact'
import { firstName, inviteText, type InviteDetails } from '../../../supabase/functions/_shared/invite.ts'
import { explainDbError, inviteDetails, markInvited, sendInviteWhatsApp, type Profile } from './api'

type Load = { state: 'loading' } | { state: 'ready'; d: InviteDetails } | { state: 'error'; message: string; setup: boolean }

/** "Invited 25 Sep on WhatsApp", or nothing when they haven't been. */
export function invitedLine(p: Profile): string | null {
  if (!p.invited_at) return null
  const when = new Date(p.invited_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  return `Invited ${when} ${p.invited_via === 'sms' ? 'by text' : 'on WhatsApp'}`
}

/**
 * Invites someone the school added (D36). The invitation goes on WhatsApp from the school's number, to the mobile they
 * sign in with. If WhatsApp can't deliver it, the admin can send the same words by text from their own phone.
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

  async function whatsapp() {
    setSending(true)
    setError(null)
    try {
      const to = await sendInviteWhatsApp(person.id)
      setSent(to)
      toast(`Invitation sent to ${formatMobile(to.startsWith('+') ? to : `+${to}`)} on WhatsApp.`)
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
  function phone() {
    if (Date.now() - lastPhoneTap.current < 5000) return
    lastPhoneTap.current = Date.now()
    markInvited(person.id, 'sms').then(onDone, (e: { code?: string; message?: string }) => toast(explainDbError(e)))
  }
  const already = invitedLine(person)

  return (
    <Sheet open onClose={onClose} title={`Invite ${first}`} description="They sign in with their mobile number and a 6-digit code we send on WhatsApp.">
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
              <p className="whitespace-pre-line text-small font-semibold text-ink">{text}</p>
            </div>
            {sent
              ? <Notice tone="success" icon={<CircleCheck aria-hidden />}>{`Sent on WhatsApp to ${formatMobile(d.phone ?? '')}. ${first} can open the link and sign in with the code that arrives.`}</Notice>
              : (
                <div className="grid gap-2.5">
                  <p className="flex min-w-0 items-center gap-2 px-0.5 text-small font-semibold text-ink-2">
                    <span className="shrink-0">Sends to</span>
                    <b className="min-w-0 truncate text-ink">{formatMobile(d.phone ?? '')}</b>
                  </p>
                  <Button size="xl" className="w-full" icon={<MessageCircle />} loading={sending} onClick={() => void whatsapp()}>Send on WhatsApp</Button>
                </div>
              )}
            {error && <Notice tone="danger">{error}</Notice>}
            {d.phone && (
              <div className="grid gap-2.5">
                <p className="kicker">Also send it by SMS from your phone</p>
                <a className="btn btn--secondary btn--lg w-full" href={smsUrl(d.phone, text)} aria-label={`Send by text message to ${formatMobile(d.phone)}`} onClick={phone}>
                  <MessageSquareText aria-hidden />SMS
                </a>
                <p className="text-caption font-semibold text-ink-2">Opens a message to {formatMobile(d.phone)}, ready to send.</p>
              </div>
            )}
          </div>
        )
      })()}
    </Sheet>
  )
}
