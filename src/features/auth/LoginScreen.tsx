import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Logo } from '../../ui/Logo'
import { Mascot } from '../../ui/Backdrop'
import { TextField } from '../../ui/Field'
import { normalizeEmail } from '../../domain/contact'
import { supabase } from '../../lib/supabase'

const CODE_LENGTH = 6
const RESEND_AFTER_S = 30

function explain(message: string | undefined, status: number | undefined): string {
  if (message?.includes('not_invited')) return "This email isn't registered with Jumpstart. Please contact the school."
  if (status === 429 || /rate limit|too many/i.test(message ?? '')) return 'Too many attempts. Please wait a few minutes and try again.'
  if (/expired|invalid/i.test(message ?? '')) return 'That code is wrong or has expired. Check the latest email, or send a new code.'
  return "Something went wrong. Check your connection and try again."
}

/** Invite-only login with a one-time code by email (AUTH-1, J11). */
export function LoginScreen() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const codeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  async function sendCode(address: string) {
    setBusy(true)
    setError(null)
    try {
      const { data: allowed, error: checkError } = await supabase.rpc('login_allowed', { p_email: address })
      if (checkError) throw checkError
      if (!allowed) return setError(explain('not_invited', undefined))
      // shouldCreateUser: the first code creates the account, which the database links to the invite (0002).
      const { error: otpError } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } })
      if (otpError) return setError(explain(otpError.message, otpError.status))
      setStep('code')
      setCode('')
      setResendIn(RESEND_AFTER_S)
      setTimeout(() => codeInput.current?.focus(), 50)
    } catch (e) {
      setError(explain((e as Error).message, undefined))
    } finally {
      setBusy(false)
    }
  }

  async function onEmail(e: FormEvent) {
    e.preventDefault()
    const address = normalizeEmail(email)
    if (!address) return setError('Enter the email address the school has for you.')
    setEmail(address)
    await sendCode(address)
  }

  async function onCode(e?: FormEvent) {
    e?.preventDefault()
    if (code.length !== CODE_LENGTH) return setError(`Enter all ${CODE_LENGTH} digits of the code.`)
    setBusy(true)
    setError(null)
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    setBusy(false)
    // On success the session provider takes over and routes the person to their area.
    if (verifyError) setError(explain(verifyError.message, verifyError.status))
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center px-5 pt-[max(40px,calc(env(safe-area-inset-top)+24px))] pb-[max(28px,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        <Logo className="h-14 sm:h-16" />
        <p className="mt-1.5 text-[14px] font-extrabold text-ink-2">Preschool &amp; Learning Center · Karve Road</p>
      </div>

      <div className="card relative mt-8 overflow-hidden rounded-[34px] p-6 sm:p-8">
        <span className="rainbow-bar absolute inset-x-0 top-0 h-1.5" aria-hidden />
        {step === 'email' ? (
          <form onSubmit={onEmail} noValidate>
            <Mascot size={104} className="mx-auto" />
            <h1 className="mt-1 text-center text-[34px] font-bold leading-10">Welcome!</h1>
            <p className="mt-1 text-center text-[17px] font-semibold leading-6 text-ink-2">Sign in with the email the school has for you. We'll send you a 6-digit code.</p>
            <div className="mt-6">
              <TextField
                label="Email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="name@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                error={error}
                autoFocus
              />
            </div>
            <Button type="submit" size="xl" className="mt-5 w-full" icon={<Mail />} loading={busy}>
              Send code
            </Button>
          </form>
        ) : (
          <form onSubmit={onCode} noValidate>
            <div className="mx-auto grid size-20 place-items-center rounded-full bg-[linear-gradient(135deg,var(--rb-teal),var(--rb-blue))] text-white shadow-[0_14px_30px_-12px_var(--rb-blue)]">
              <ShieldCheck className="size-10" aria-hidden />
            </div>
            <h1 className="mt-4 text-center text-[30px] font-bold leading-9">Check your email</h1>
            <p className="mt-1 text-center text-[16px] font-semibold leading-6 text-ink-2">
              We sent a 6-digit code to <span className="font-extrabold text-ink">{email}</span>. It works for 5 minutes.
            </p>
            <label htmlFor="code" className="sr-only">6-digit code</label>
            {/* One real input (so iOS can fill the code from Mail), drawn as six friendly boxes. */}
            <div className="relative mt-6" onClick={() => codeInput.current?.focus()}>
              <input
                ref={codeInput}
                id="code"
                value={code}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
                  setCode(digits)
                  setError(null)
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={CODE_LENGTH}
                aria-invalid={!!error || undefined}
                className="absolute inset-0 h-full w-full cursor-text opacity-0"
              />
              <div className="grid grid-cols-6 gap-2" aria-hidden>
                {Array.from({ length: CODE_LENGTH }, (_, i) => (
                  <span
                    key={i}
                    className={`grid h-16 place-items-center rounded-[18px] font-display text-[32px] font-bold tabular-nums ${code[i] ? 'card' : 'bg-sunken'} ${
                      i === code.length ? 'shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_45%,transparent)]' : ''
                    }`}
                  >
                    {code[i] ?? ''}
                  </span>
                ))}
              </div>
            </div>
            {error && <p className="mt-2 text-center text-[15px] font-bold text-danger" role="alert">{error}</p>}
            <Button type="submit" size="xl" className="mt-5 w-full" loading={busy} disabled={code.length !== CODE_LENGTH}>
              Sign in
            </Button>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button size="md" variant="quiet" icon={<ArrowLeft />} onClick={() => { setStep('email'); setError(null) }}>
                Other email
              </Button>
              <Button size="md" variant="quiet" disabled={resendIn > 0 || busy} onClick={() => void sendCode(email)}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Send a new code'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
