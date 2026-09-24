import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { LogIn, Mail } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Logo } from '../../ui/Logo'
import { TextField } from '../../ui/Field'
import { useToast } from '../../ui/Toast'
import { normalizeEmail } from '../../domain/contact'
import { supabase } from '../../lib/supabase'
import { DEMO_ACCOUNTS, DEMO_AVAILABLE, DEMO_CODE, enterDemo, isDemo, leaveDemo } from '../../demo/demo'
import { AREA_ICON, AREA_LABEL } from './AreaShell'
import { chooseArea } from './session'

const CODE_LENGTH = 6
const RESEND_AFTER_S = 30

function explain(message: string | undefined, status: number | undefined): string {
  if (message?.includes('not_invited')) return "This email isn't on Jumpstart's list. Only people the school adds can sign in."
  if (status === 429 || /rate limit|too many/i.test(message ?? '')) return 'Too many attempts. Please wait a few minutes and try again.'
  if (/expired|invalid/i.test(message ?? '')) return "That code isn't right or has expired. Check the latest email, or send a new code."
  return 'Something went wrong. Check your connection and try again.'
}

/** The sign-in page frame: logo, the school, then the card (Screen Book sign-in). */
export function SignInFrame({ children }: { children: ReactNode }) {
  return (
    <main className="gutter mx-auto flex min-h-dvh w-full max-w-[calc(440px+2*var(--gutter))] flex-col justify-center pt-[max(32px,calc(env(safe-area-inset-top)+20px))] pb-[max(28px,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        <Logo className="h-14 sm:h-16" />
        <p className="mt-2 text-small font-bold text-ink-2">Preschool &amp; Learning Center, Karve Road</p>
      </div>
      {children}
    </main>
  )
}

/**
 * Invite-only login with a one-time code by email (AUTH-1, J11). One screen for every role: the account decides the area.
 * In development and design builds, demo accounts (sample data, never the real database) fill in their code, so testing
 * is one tap on Sign in. Real codes are never shown by the app; phones offer them from the email (one-time-code).
 */
export function LoginScreen() {
  const toast = useToast()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [demoPick, setDemoPick] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  // Always false in production builds, so the demo text is dropped there.
  const demo = DEMO_AVAILABLE && isDemo()
  const codeInput = useRef<HTMLInputElement>(null)
  const signInButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  async function sendCode(address: string): Promise<void> {
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
      setResendIn(RESEND_AFTER_S)
      if (isDemo()) {
        setCode(DEMO_CODE)
        toast('Code sent. The demo code is filled in: tap Sign in.', { tone: 'info' })
        setTimeout(() => signInButton.current?.focus(), 50)
      } else {
        setCode('')
        toast(`Code sent to ${address}.`)
        setTimeout(() => codeInput.current?.focus(), 50)
      }
    } catch (e) {
      setError(explain((e as Error).message, undefined))
    } finally {
      setBusy(false)
    }
  }

  async function onEmail(e: FormEvent) {
    e.preventDefault()
    const address = normalizeEmail(email)
    if (!address) return setError('Enter a full email address, like name@example.com.')
    setEmail(address)
    // A demo account talks to the sample backend in this tab; anything typed by hand is a real sign-in.
    if (DEMO_AVAILABLE) {
      if (demoPick) enterDemo()
      else if (isDemo()) leaveDemo()
    }
    await sendCode(address)
  }

  async function onCode(e?: FormEvent) {
    e?.preventDefault()
    if (code.length !== CODE_LENGTH) return setError(`Enter all ${CODE_LENGTH} digits of the code.`)
    setBusy(true)
    setError(null)
    // Asked before the session arrives, so the area chooser is ready the moment the app switches over.
    chooseArea.ask()
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    setBusy(false)
    // On success the session provider takes over and routes the person to their area.
    if (verifyError) {
      chooseArea.done()
      setCode('')
      setError(explain(verifyError.message, verifyError.status))
      codeInput.current?.focus()
    }
  }

  return (
    <SignInFrame>
      <div className="card mt-8 rounded-2xl p-6 sm:p-7">
        {step === 'email' ? (
          <form key="email" onSubmit={onEmail} noValidate className="page-in grid gap-4">
            <div className="text-center">
              <h1 className="text-h2">Sign in</h1>
              <p className="mt-1.5 text-body text-ink-2">Use the email the school has for you. We'll send a <span className="whitespace-nowrap">6-digit</span> code.</p>
            </div>
            <TextField
              label="Email"
              icon={<Mail aria-hidden />}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              enterKeyHint="send"
              spellCheck={false}
              placeholder="name@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setDemoPick(false); setError(null) }}
              error={error}
              autoFocus
            />
            <Button type="submit" className="w-full" icon={<Mail />} loading={busy}>
              Send me a code
            </Button>
            <p className="text-center text-caption font-semibold text-ink-3">Invite only. The school adds you first; nobody can sign up.</p>
          </form>
        ) : (
          <form key="code" onSubmit={onCode} noValidate className="page-in grid gap-4">
            <div className="text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-lg bg-accent-soft text-accent">
                <Mail className="size-8" aria-hidden />
              </span>
              <h1 className="mt-4 text-h2">Check your email</h1>
              <p className="mt-1.5 text-body text-ink-2">
                We sent a 6-digit code to <span className="font-bold text-ink">{email}</span>.{!demo && ' It works for 5 minutes.'}
              </p>
            </div>
            <label htmlFor="code" className="sr-only">6-digit code</label>
            {/* One real input (so phones can fill the code from the email), drawn as six boxes. */}
            <div className="relative" onClick={() => codeInput.current?.focus()}>
              <input
                ref={codeInput}
                id="code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))
                  setError(null)
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={CODE_LENGTH}
                aria-invalid={!!error || undefined}
                aria-describedby={error ? 'code-error' : undefined}
                className="absolute inset-0 h-full w-full cursor-text text-[17px] opacity-0"
              />
              <div className="grid grid-cols-6 gap-2" aria-hidden>
                {Array.from({ length: CODE_LENGTH }, (_, i) => (
                  <span key={i}
                    className={`grid h-16 place-items-center rounded-md bg-surface text-[28px] font-extrabold tabular-nums transition-[box-shadow] duration-150 ${
                      error ? 'shadow-[0_3px_0_var(--danger-line),inset_0_0_0_1.5px_var(--danger)]'
                        : i === code.length ? 'shadow-[0_3px_0_var(--accent-lip),inset_0_0_0_2px_var(--accent)]' : 'shadow-[0_3px_0_var(--line-2),inset_0_0_0_1.5px_var(--line-2)]'
                    }`}>
                    {code[i] ?? ''}
                  </span>
                ))}
              </div>
            </div>
            {error && <p id="code-error" className="text-center text-small font-bold text-danger" role="alert">{error}</p>}
            <Button ref={signInButton} type="submit" className="w-full" icon={<LogIn />} loading={busy} disabled={code.length !== CODE_LENGTH}>
              Sign in
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              {demo ? (
                <button type="button" className="linkbtn" onClick={() => { setCode(DEMO_CODE); setError(null) }}>Use the demo code</button>
              ) : (
                <button type="button" className="linkbtn" disabled={resendIn > 0 || busy} onClick={() => void sendCode(email)}>
                  {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
                </button>
              )}
              <button type="button" className="linkbtn" onClick={() => { setStep('email'); setCode(''); setError(null) }}>Change email</button>
            </div>
            {demo && <p className="text-center text-caption font-semibold text-ink-3">Demo: the code {DEMO_CODE} is filled in and nothing is emailed. Any other code shows the error.</p>}
          </form>
        )}
      </div>

      {DEMO_AVAILABLE && step === 'email' && (
        <section className="mt-6 grid gap-3" aria-labelledby="demo-title">
          <h2 id="demo-title" className="kicker text-center">Demo accounts</h2>
          <div className="flex flex-wrap justify-center gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} type="button" className="chipb" aria-pressed={demoPick && email === a.email}
                onClick={() => { setEmail(a.email); setDemoPick(true); setError(null) }}>
                {AREA_ICON[a.area]}
                {AREA_LABEL[a.area]}
              </button>
            ))}
          </div>
          <p className="text-center text-caption font-semibold text-ink-3">Sample children and people only. Nothing reaches the school's records.</p>
        </section>
      )}
    </SignInFrame>
  )
}
