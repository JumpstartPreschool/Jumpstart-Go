import { useState, type FormEvent } from 'react'
import { ShieldCheck } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { SignOutButton } from '../../ui/SignOutButton'
import { BorderBeam } from '../../ui/BorderBeam'
import { useToast } from '../../ui/Toast'
import { supabase } from '../../lib/supabase'
import { PASSWORD_MIN } from '../../../supabase/functions/_shared/passwordPattern'
import { SignInFrame } from './LoginScreen'
import { newPasswordMessage } from './messages'
import { PasswordField } from './PasswordField'
import { useSession, type Me } from './session'

/**
 * After signing in with the starting password the school's pattern made (0041): the person chooses their own before
 * anything else. Saving it moves them to "own" in the database, and the app carries on to their area.
 */
export function ChoosePasswordScreen({ me }: { me: Me }) {
  const { signOut } = useSession()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (password.length < PASSWORD_MIN) return setError(`Use at least ${PASSWORD_MIN} characters.`)
    if (password !== again) return setError("The two passwords don't match.")
    setBusy(true)
    setError(null)
    const { error: saveError } = await supabase.auth.updateUser({ password })
    if (saveError) {
      setBusy(false)
      return setError(newPasswordMessage(saveError))
    }
    // The session reloads who they are (USER_UPDATED) and this screen gives way to their area.
    setBusy(false)
    toast('Your new password is saved.')
  }

  return (
    <SignInFrame>
      <div className="card relative overflow-hidden rounded-[28px] p-6 shadow-[var(--shadow-lift)] sm:p-8">
        <BorderBeam />
        <form onSubmit={(e) => void save(e)} noValidate className="page-in grid gap-4">
          <div className="text-center">
            <span className="signin-badge mx-auto" aria-hidden><ShieldCheck /></span>
            <h1 className="mt-4 text-h2 text-balance">Choose your own password</h1>
            <p className="mt-1.5 text-body text-ink-2 text-pretty">
              Welcome, {me.full_name.split(' ')[0]}. The school gave you a starting password. Choose one only you know.
            </p>
          </div>
          <PasswordField label="New password" name="new-password" autoComplete="new-password" value={password} autoFocus
            hint={`At least ${PASSWORD_MIN} characters.`} onChange={(e) => { setPassword(e.target.value); setError(null) }} />
          <PasswordField label="Type it again" name="confirm-password" autoComplete="new-password" enterKeyHint="done" value={again}
            error={error} onChange={(e) => { setAgain(e.target.value); setError(null) }} />
          <Button type="submit" className="w-full" icon={<ShieldCheck />} loading={busy}>
            {busy ? 'Saving…' : 'Save and continue'}
          </Button>
          <SignOutButton onClick={() => void signOut()} />
        </form>
      </div>
    </SignInFrame>
  )
}
