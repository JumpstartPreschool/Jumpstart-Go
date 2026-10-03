import { useState } from 'react'
import { Link } from 'react-router'
import { CircleCheck, Copy, KeyRound, RotateCcw, Settings } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { firstName } from '../../../supabase/functions/_shared/invite.ts'
import { explainDbError, resetPassword, type Profile } from './api'

const STATE = {
  none: 'No email password yet. Reset to give them the starting password from your pattern.',
  pattern: "They have the starting password from your pattern and haven't chosen their own yet.",
  own: 'They chose their own password. Reset only if they forgot it.',
} as const

/**
 * One person's email password (0041): where it stands, and Reset to the pattern for a forgotten password or a new
 * email. The starting password is shown once, for the admin to pass on; they choose their own after signing in.
 */
export function PasswordSheet({ person, onClose, onDone }: { person: Profile; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; setup: boolean } | null>(null)
  const [password, setPassword] = useState<string | null>(null)
  const first = firstName(person.full_name)

  async function reset() {
    setBusy(true)
    setError(null)
    try {
      setPassword(await resetPassword(person.id))
      onDone()
    } catch (e) {
      const err = e as { code?: string; message?: string }
      setError({ text: explainDbError(err), setup: /pattern in Settings/i.test(err.message ?? '') })
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password ?? '')
      toast('Copied.')
    } catch {
      toast("Couldn't copy. Select the password and copy it instead.")
    }
  }

  return (
    <Sheet open onClose={onClose} title={`${first}'s email password`} description={`Signs in as ${person.email}. The WhatsApp code on their mobile keeps working either way.`}>
      <div className="grid gap-4">
        {password ? (
          <>
            <div className="vault">
              <p className="vault__label">Starting password</p>
              <p className="vault__email">{person.email}</p>
              <p className="vault__secret select-all">{password}</p>
              <button type="button" className="vault__copy mt-4" onClick={() => void copy()}><Copy aria-hidden />Copy password</button>
            </div>
            <Notice tone="success" icon={<CircleCheck aria-hidden />}>
              Tell {first} this password in person or by phone. After signing in with it, they choose their own.
            </Notice>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-xl bg-sunken p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-surface [&_svg]:size-5" aria-hidden><KeyRound /></span>
              <p className="text-small font-semibold text-ink-2">{STATE[person.email_sign_in ?? 'none']}</p>
            </div>
            {error && (
              <Notice tone={error.setup ? 'warning' : 'danger'}>
                {error.text}
                {error.setup && <Link to="/admin/settings" className="mt-2 flex items-center gap-1.5 font-extrabold underline underline-offset-2 [&_svg]:size-4" onClick={onClose}><Settings aria-hidden />Open Settings</Link>}
              </Notice>
            )}
            <Button size="xl" className="w-full" icon={<RotateCcw />} loading={busy} onClick={() => void reset()}>
              {busy ? 'Resetting…' : 'Reset to the pattern'}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  )
}
