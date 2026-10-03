import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { MessageCircle, MessageSquareText, Settings } from '../../ui/icons'
import { Sheet } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatMobile, smsUrl, whatsappUrl } from '../../domain/contact'
import { firstName, inviteText, type InviteDetails } from '../../../supabase/functions/_shared/invite.ts'
import { explainDbError, inviteDetails, markInvited, type Profile } from './api'

type Load = { state: 'loading' } | { state: 'ready'; d: InviteDetails } | { state: 'error'; message: string; setup: boolean }

/** "Invited 25 Sep on WhatsApp", or nothing when they haven't been. */
export function invitedLine(p: Profile): string | null {
  if (!p.invited_at) return null
  const when = new Date(p.invited_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  return `Invited ${when} ${p.invited_via === 'sms' ? 'by text' : 'on WhatsApp'}`
}

/**
 * Invites someone the school added (D36), from the admin's own phone: WhatsApp or a text message opens with the
 * invitation ready, and the admin presses send there. They sign in with their mobile number and a WhatsApp code.
 */
export function InviteSheet({ person, onClose, onDone }: { person: Profile; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const first = firstName(person.full_name)

  useEffect(() => {
    inviteDetails(person.id).then(
      (d) => setLoad({ state: 'ready', d }),
      (e: { code?: string; message?: string }) => setLoad({ state: 'error', message: explainDbError(e), setup: !!e.message?.startsWith('no_app_url') }),
    )
  }, [person.id])

  // Opening the phone's app is all the web can do; the admin presses send there, so it's recorded as handed over.
  // A second tap within a few seconds opens the app again but isn't recorded twice.
  const lastPhoneTap = useRef(0)
  function handedOver(via: 'sms' | 'whatsapp') {
    if (Date.now() - lastPhoneTap.current < 5000) return
    lastPhoneTap.current = Date.now()
    markInvited(person.id, via).then(onDone, (e: { code?: string; message?: string }) => toast(explainDbError(e)))
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
            {already && <Notice>{already}. {first} hasn't signed in yet, so you can send it again.</Notice>}
            <div className="rounded-xl bg-sunken p-4">
              <p className="kicker mb-1.5">The invitation says</p>
              <p className="whitespace-pre-line text-small font-semibold text-ink">{text}</p>
            </div>
            {d.phone ? (
              <div className="grid gap-2.5">
                <a className="btn btn--primary btn--xl w-full" href={whatsappUrl(d.phone, text)} target="_blank" rel="noopener noreferrer"
                  aria-label={`Send on WhatsApp to ${formatMobile(d.phone)}`} onClick={() => handedOver('whatsapp')}>
                  <MessageCircle aria-hidden />Send on WhatsApp
                </a>
                <a className="btn btn--secondary btn--lg w-full" href={smsUrl(d.phone, text)} aria-label={`Send by text message to ${formatMobile(d.phone)}`} onClick={() => handedOver('sms')}>
                  <MessageSquareText aria-hidden />Send by SMS
                </a>
                <p className="text-caption font-semibold text-ink-2">Opens WhatsApp or Messages on your phone with the invitation to {formatMobile(d.phone)}, ready to send.</p>
              </div>
            ) : <Notice tone="warning">Add {first}'s mobile number first: they sign in with it.</Notice>}
          </div>
        )
      })()}
    </Sheet>
  )
}
