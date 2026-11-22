import { useState } from 'react'
import { Link } from 'react-router'
import { CircleCheck, Copy, KeyRound, Lock, Settings, ShieldOff, TriangleAlert } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { firstName } from '../../../supabase/functions/_shared/invite.ts'
import { emailSignInOff, explainDbError, issueTempPassword, type Profile, type TempPassword } from './api'

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

/** A temporary password, shown to the admin this once (D55): it can't be read back later, only replaced. */
export function TempPasswordReveal({ first, email, issued }: { first: string; email: string; issued: TempPassword }) {
  const toast = useToast()
  async function copy() {
    try {
      await navigator.clipboard.writeText(issued.password)
      toast('Copied.')
    } catch {
      toast("Couldn't copy. Select the password and copy it instead.")
    }
  }
  return (
    <div className="grid gap-4">
      <div className="vault">
        <p className="vault__label">Temporary password</p>
        <p className="vault__email">{email}</p>
        <p className="vault__secret select-all">{issued.password}</p>
        <button type="button" className="vault__copy mt-4" onClick={() => void copy()}><Copy aria-hidden />Copy password</button>
      </div>
      <Notice tone="success" icon={<CircleCheck aria-hidden />}>
        <span className="grid gap-1">
          <b>Shown only now. It expires {when(issued.expires_at)}.</b>
          <span>Tell {first} in person or by phone. When they sign in with it, they must choose their own password, which nobody at the school can see.</span>
        </span>
      </Notice>
    </div>
  )
}

/**
 * One person's email sign-in (D55): where it stands, a new temporary password (which also turns it on and lifts a lock),
 * or turning it off. The admin never sees or sets anyone's own password. Parents and family get one only from here.
 */
export function PasswordSheet({ person, onClose, onDone }: { person: Profile; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState<'issue' | 'off' | null>(null)
  const [confirm, setConfirm] = useState<'issue' | 'off' | null>(null)
  const [error, setError] = useState<{ text: string; setup: boolean } | null>(null)
  const [issued, setIssued] = useState<TempPassword | null>(null)
  const [state, setState] = useState(person.email_sign_in ?? 'none')
  const first = firstName(person.full_name)
  const expired = state === 'temporary' && !!person.temp_password_expires_at && new Date(person.temp_password_expires_at) <= new Date()
  const locked = !!person.locked_until && new Date(person.locked_until) > new Date()

  async function run(action: 'issue' | 'off') {
    setBusy(action)
    setError(null)
    try {
      if (action === 'issue') setIssued(await issueTempPassword(person.id))
      else { await emailSignInOff(person.id); setState('none') }
      setConfirm(null)
      onDone()
    } catch (e) {
      const err = e as { code?: string; message?: string }
      setError({ text: explainDbError(err), setup: /in Settings/i.test(err.message ?? '') })
    } finally {
      setBusy(null)
    }
  }

  const status = state === 'none'
    ? `Email sign-in is off. Turning it on gives ${first} a temporary password for ${person.email}.`
    : state === 'own'
      ? `${first} chose their own password. You can't see it. Issue a temporary password only if they forgot theirs.`
      : expired
        ? `${first}'s temporary password expired ${when(person.temp_password_expires_at!)} without being used.`
        : `${first} has a temporary password until ${person.temp_password_expires_at ? when(person.temp_password_expires_at) : 'it expires'}, and hasn't chosen their own yet.`

  return (
    <Sheet open onClose={onClose} title={`${first}'s email sign-in`} description={`Signs in as ${person.email}. The WhatsApp code on their mobile keeps working either way.`}>
      {issued ? (
        <div className="grid gap-4">
          <TempPasswordReveal first={first} email={person.email!} issued={issued} />
          <Button size="xl" className="w-full" onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-start gap-3 rounded-xl bg-sunken p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-surface [&_svg]:size-5" aria-hidden><KeyRound /></span>
            <p className="text-small font-semibold text-ink-2">{status}</p>
          </div>
          {locked && state !== 'none' && (
            <Notice tone="warning" icon={<Lock aria-hidden />}>Locked after too many wrong passwords until {when(person.locked_until!)}. A new temporary password lifts the lock.</Notice>
          )}
          {confirm === 'issue' && state === 'own' && (
            <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>The password {first} chose stops working, and they choose a new one after signing in with the temporary one.</Notice>
          )}
          {confirm === 'off' && (
            <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>{first}'s email password is removed and any email sign-in on their devices ends. They keep signing in with the WhatsApp code.</Notice>
          )}
          {error && (
            <Notice tone={error.setup ? 'warning' : 'danger'}>
              {error.text}
              {error.setup && <Link to="/admin/settings" className="mt-2 flex items-center gap-1.5 font-extrabold underline underline-offset-2 [&_svg]:size-4" onClick={onClose}><Settings aria-hidden />Open Settings</Link>}
            </Notice>
          )}
          {confirm === 'off' ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Button variant="secondary" disabled={!!busy} onClick={() => setConfirm(null)}>Cancel</Button>
              <Button icon={<ShieldOff />} loading={busy === 'off'} onClick={() => void run('off')}>Turn off email sign-in</Button>
            </div>
          ) : (
            <>
              <Button size="xl" className="w-full" icon={<KeyRound />} loading={busy === 'issue'}
                onClick={() => (state === 'own' && confirm !== 'issue' ? setConfirm('issue') : void run('issue'))}>
                {busy === 'issue' ? 'Issuing…' : state === 'none' ? 'Turn on and issue a temporary password' : state === 'own' && confirm === 'issue' ? 'Yes, issue a temporary password' : 'Generate new temporary password'}
              </Button>
              {state !== 'none' && <Button variant="secondary" icon={<ShieldOff />} disabled={!!busy} onClick={() => setConfirm('off')}>Turn off email sign-in</Button>}
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}
