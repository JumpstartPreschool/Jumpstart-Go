import { useRef, useState, type FormEvent } from 'react'
import { LockLine } from '../../ui/icons'
import { BorderBeam } from '../../ui/BorderBeam'
import { Button } from '../../ui/Button'
import { PasswordField } from '../../ui/Field'
import { useToast } from '../../ui/Toast'
import { supabase } from '../../lib/supabase'
import { SignOutButton } from '../../ui/SignOutButton'
import { SignInFrame } from './LoginScreen'
import { authMessage } from './messages'
import { MIN_PASSWORD, passwordProblem, passwordStrength, type Strength } from './password'
import { passwordStep, useSession } from './session'

const METER: Record<Strength, { filled: number; label: string; color: string }> = {
  weak: { filled: 1, label: 'Weak', color: 'bg-danger' },
  okay: { filled: 2, label: 'Okay', color: 'bg-warning' },
  strong: { filled: 3, label: 'Strong', color: 'bg-success' },
}

/** Three bars and a word (never colour alone), with the rule underneath so the hint never jumps. */
function StrengthHint({ password, email }: { password: string; email: string }) {
  const m = password ? METER[passwordStrength(password, email)] : null
  return (
    <span className="grid gap-1.5">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-150 ${m && i < m.filled ? m.color : 'bg-line-2'}`} />
        ))}
      </span>
      <span>{m ? <b className="text-ink">{m.label}. </b> : null}At least {MIN_PASSWORD} characters. Avoid common words and your email.</span>
    </span>
  )
}

/**
 * Right after an email code signs someone in: create their password (first time) or choose a new one (forgotten).
 * Supabase Auth stores it hashed; nothing here keeps it after the request. A reset also signs out every other device,
 * in case someone else knew the old password.
 */
export function SetPasswordScreen({ intent, email }: { intent: 'first' | 'reset'; email: string }) {
  const toast = useToast()
  const { refresh, signOut } = useSession()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    const problem = passwordProblem(password, email)
    if (problem) return setErrors({ password: problem })
    if (!confirm) return setErrors({ confirm: 'Type the password again to confirm it.' })
    if (confirm !== password) return setErrors({ confirm: "Passwords don't match." })
    inFlight.current = true
    setBusy(true)
    setErrors({})
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) return setErrors(error.code === 'weak_password' ? { password: authMessage(error) } : { form: authMessage(error) })
      // Best effort: the new password already works, and other devices' passes can't be renewed with the old one's session.
      if (intent === 'reset') await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)
      passwordStep.done()
      toast(intent === 'reset' ? 'Password changed. Other devices have been signed out.' : 'Password saved. Next time, sign in with your email and password.')
      await refresh()
    } catch (err) {
      setErrors({ form: authMessage(err as Error) })
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <SignInFrame>
      <div className="card relative overflow-hidden rounded-[28px] p-6 shadow-[var(--shadow-lift)] sm:p-8">
        <BorderBeam />
        <form onSubmit={onSubmit} noValidate className="page-in grid gap-4">
          <div className="text-center">
            <p className="text-caption font-extrabold uppercase tracking-[0.14em] text-accent-ink">{intent === 'first' ? 'One last step' : 'Email confirmed'}</p>
            <h1 className="mt-1 text-h2">{intent === 'first' ? 'Create your password' : 'Choose a new password'}</h1>
            <p className="mt-2 text-body text-ink-2">
              {intent === 'first' ? 'Next time, sign in with ' : 'You’ll use it with '}<b className="break-all text-ink">{email}</b>
              {intent === 'first' ? ' and this password. No code needed.' : ' to sign in.'}
            </p>
          </div>
          {/* The account's email for password managers, so they save the new password against the right login. */}
          <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
          <PasswordField
            label={intent === 'first' ? 'Password' : 'New password'}
            name="new-password"
            icon={<LockLine aria-hidden />}
            autoComplete="new-password"
            enterKeyHint="next"
            maxLength={200}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setErrors({}) }}
            error={errors.password}
            hint={<StrengthHint password={password} email={email} />}
            autoFocus
          />
          <PasswordField
            label="Confirm password"
            name="confirm-password"
            icon={<LockLine aria-hidden />}
            autoComplete="new-password"
            enterKeyHint="done"
            maxLength={200}
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setErrors({}) }}
            error={errors.confirm}
          />
          {errors.form && <p className="text-center text-small font-bold text-danger" role="alert">{errors.form}</p>}
          <Button type="submit" className="w-full" loading={busy}>
            {busy ? (intent === 'first' ? 'Creating password…' : 'Updating password…') : intent === 'first' ? 'Create password' : 'Update password'}
          </Button>
          <SignOutButton className="mt-1" onClick={() => void signOut()} />
        </form>
      </div>
    </SignInFrame>
  )
}
