import { Link } from 'react-router'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, KeyRound, LockLine, LogIn, MailCheck, MailLine, MapPin, UserCheck, PencilLine, RotateCcw } from '../../ui/icons'
import { BorderBeam } from '../../ui/BorderBeam'
import { Button } from '../../ui/Button'
import { Logo, Mascot } from '../../ui/Logo'
import { PasswordField, TextField } from '../../ui/Field'
import { useToast } from '../../ui/Toast'
import { normalizeEmail } from '../../domain/contact'
import { supabase } from '../../lib/supabase'
import { authMessage } from './messages'
import { chooseArea, passwordStep } from './session'

// Six digits, matching Supabase → Authentication → Email → Email OTP Length (environments.md).
const CODE_LENGTH = 6
// Supabase sends one code per email a minute; the Send-a-new-code timer waits the same.
const RESEND_AFTER_S = 60

/** The address an invitation link carries after the #, read once and then cleared from the address bar. */
let invited: string | null = null
function invitedEmail(): string {
  if (invited === null) {
    const found = new URLSearchParams(location.hash.slice(1)).get('email') ?? ''
    if (found) history.replaceState(null, '', location.pathname + location.search)
    invited = normalizeEmail(found) ?? ''
  }
  return invited
}

const PROMISES = [
  { icon: <UserCheck />, title: 'Invite only', text: 'The school adds every account.' },
  { icon: <KeyRound />, title: 'Your own password', text: 'Codes by email only when you need one.' },
  { icon: <MapPin />, title: 'Private location', text: "Only you see who's collecting." },
]

/**
 * The sign-in page. Phones and upright tablets: a royal-purple brand band with the logo and the promise, and the card
 * rising over it. Wide screens: the brand panel on the left, the card centred on the right. Words kept to a minimum.
 */
export function SignInFrame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] lg:p-4">
      <section aria-label="About Jumpstart Go"
        className="signin-hero relative flex min-h-[50dvh] flex-col justify-center gap-7 overflow-hidden rounded-b-[36px] px-6 pt-[max(24px,calc(env(safe-area-inset-top)+16px))] pb-20 text-ink sm:px-10 md:min-h-[54dvh] md:pb-24 lg:min-h-0 lg:justify-between lg:gap-10 lg:rounded-[32px] lg:p-12 xl:p-16">
        <div className="self-center rounded-[22px] bg-white px-5 py-3 shadow-[0_0_0_1px_rgb(120_80_40/0.08),0_14px_34px_-18px_rgb(120_60_30/0.45)] lg:self-start lg:px-6 lg:py-3.5">
          <Logo className="h-10 sm:h-11 lg:h-12" />
        </div>
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <Mascot size={84} />
          <p className="mt-3 max-w-[14ch] text-[30px] leading-[1.08] font-extrabold tracking-[-0.02em] text-balance sm:text-[36px] lg:mt-5 lg:text-[52px] 2xl:text-[64px]" role="heading" aria-level={2}>
            Safe drop-offs and pickups
          </p>
          <p className="mt-3 text-body font-semibold text-ink-2 lg:text-lead">Jumpstart Preschool, Karve Road</p>
        </div>
        <ul className="hidden max-w-[520px] gap-3 lg:grid">
          {PROMISES.map((p) => (
            <li key={p.title} className="signin-pill flex items-center gap-3.5 rounded-2xl px-4 py-3">
              <span className="grid size-10 shrink-0 place-items-center signin-pill__icon rounded-xl [&_svg]:size-[22px]" aria-hidden>{p.icon}</span>
              <span className="text-body text-ink-2"><b className="text-ink">{p.title}.</b> {p.text}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="signin-side relative -mt-14 flex-1 px-4 pb-[max(24px,env(safe-area-inset-bottom))] sm:px-6 md:-mt-16 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:px-10 lg:pb-0">
        <div className="mx-auto w-full max-w-[460px]">
          {children}
          <ul className="mt-6 flex flex-wrap justify-center gap-2 lg:hidden">
            {PROMISES.map((p) => (
              <li key={p.title} className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-caption font-bold text-ink-2 shadow-[var(--shadow-card)] [&_svg]:size-4 [&_svg]:shrink-0">{p.icon}{p.title}</li>
            ))}
          </ul>
          <nav aria-label="Policies" className="mt-5 flex justify-center gap-x-5 text-caption font-bold">
            <Link to="/privacy" className="linkbtn">Privacy Policy</Link>
            <Link to="/terms" className="linkbtn">Terms of Use</Link>
          </nav>
        </div>
      </section>
    </main>
  )
}

/** Why someone is getting an email code: their first sign-in (then they create a password), or a forgotten password. */
type Intent = 'first' | 'reset'
/** Where the sign-in card is. Busy and error are separate: they apply to whichever step is showing. */
type Step = { name: 'password' } | { name: 'request'; intent: Intent } | { name: 'code'; intent: Intent }

const REQUEST_COPY: Record<Intent, { title: string; text: string }> = {
  first: { title: 'First time here?', text: "Enter the email the school has for you. We'll email you a 6-digit code, then you'll create your password." },
  reset: { title: 'Reset your password', text: "Enter your email. We'll send you a 6-digit code, then you'll choose a new password." },
}

/** What the code step says. A first-sign-in code only goes to accounts without a password, so it says so. */
const CODE_SENT: Record<Intent, string> = {
  first: "If this email is registered and has no password yet, we've sent it a 6-digit code. It works for 5 minutes.",
  reset: "If this email is registered with Jumpstart, we've sent it a 6-digit code. It works for 5 minutes.",
}

function FormError({ id, children }: { id: string; children: ReactNode }) {
  return <p id={id} className="text-center text-small font-bold text-danger" role="alert">{children}</p>
}

function BackToSignIn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="linkbtn -ml-2 inline-flex items-center gap-1.5 self-start [&_svg]:size-4" onClick={onClick}>
      <ArrowLeft aria-hidden />Back to sign in
    </button>
  )
}

/**
 * Invite-only sign-in (AUTH-1, J11). Everyday: email and password, no email sent. First time or a forgotten password:
 * a 6-digit code by email, then the password step (SetPasswordScreen, opened by AreaRoute once the code signs them in).
 * Every answer to a code request reads the same whether or not the email is registered, so nobody can probe for accounts.
 */
export function LoginScreen() {
  const toast = useToast()
  // From the invitation email's button (/#email=…): someone new, so straight to getting their first code.
  const [step, setStep] = useState<Step>(() => (invitedEmail() ? { name: 'request', intent: 'first' } : { name: 'password' }))
  const [email, setEmail] = useState(invitedEmail)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  // Guards against a double tap or Enter pressed twice before the busy state has rendered.
  const inFlight = useRef(false)
  const codeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  function go(next: Step) {
    setStep(next)
    setError(null)
    setCode('')
  }

  async function run(task: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (e) {
      setError(authMessage(e as Error))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  function readEmail(): string | null {
    const address = normalizeEmail(email)
    if (!address) setError('Enter a full email address, like name@example.com.')
    else setEmail(address)
    return address
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault()
    const address = readEmail()
    if (!address) return
    if (!password) return setError('Enter your password.')
    await run(async () => {
      passwordStep.done()
      // Asked before the session arrives, so the area chooser is ready the moment the app switches over.
      chooseArea.ask()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: address, password })
      // On success the session provider takes over and routes the person to their area.
      if (signInError) {
        chooseArea.done()
        setError(authMessage(signInError))
      }
    })
  }

  async function sendCode(address: string, intent: Intent) {
    await run(async () => {
      // Registered, active, under 10 codes an hour, and for a first sign-in no password yet (0034). Refused: no email is
      // sent, but the screen reads the same, so nobody learns who has an account.
      let check = await supabase.rpc('login_allowed', { p_email: address, p_purpose: intent })
      // ponytail: a database without 0034 has only the one-argument check (any code allowed), so the app works whichever
      // ships first. Delete this line once 0034 is live.
      if (check.error?.code === 'PGRST202') check = await supabase.rpc('login_allowed', { p_email: address })
      const { data: allowed, error: checkError } = check
      if (checkError) return setError(authMessage(checkError))
      if (allowed) {
        // shouldCreateUser: someone's first code creates their account, which the database links to the invite (0002).
        const { error: otpError } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } })
        // Asked again within the minute: the code already sent still works, so carry on to it.
        if (otpError && !/after \d+ seconds?/i.test(otpError.message)) return setError(authMessage(otpError))
      }
      setStep({ name: 'code', intent })
      setCode('')
      setResendIn(RESEND_AFTER_S)
      toast('If this email is registered with Jumpstart, a code is on its way.', { tone: 'info' })
      setTimeout(() => codeInput.current?.focus(), 50)
    })
  }

  async function onRequest(e: FormEvent, intent: Intent) {
    e.preventDefault()
    const address = readEmail()
    if (address) await sendCode(address, intent)
  }

  async function onCode(e: FormEvent, intent: Intent) {
    e.preventDefault()
    if (code.length !== CODE_LENGTH) return setError(`Enter all ${CODE_LENGTH} digits of the code.`)
    await run(async () => {
      // Read by AreaRoute once the session arrives: it opens the password step before anything else.
      passwordStep.ask(intent)
      chooseArea.ask()
      const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
      if (verifyError) {
        passwordStep.done()
        chooseArea.done()
        setCode('')
        setError(authMessage(verifyError))
        codeInput.current?.focus()
      }
    })
  }

  return (
    <SignInFrame>
      <div className="card relative overflow-hidden rounded-[28px] p-6 shadow-[var(--shadow-lift)] sm:p-8">
        <BorderBeam />
        {step.name === 'password' && (
          <form key="password" onSubmit={onPassword} noValidate className="page-in grid gap-4" aria-describedby={error ? 'signin-error' : undefined}>
            <div className="text-center">
              <p className="text-caption font-extrabold uppercase tracking-[0.14em] text-accent-ink">Welcome</p>
              <h1 className="mt-1 text-h1">Sign in to Jumpstart Go</h1>
              <p className="mt-2 text-body text-ink-2">Use the email the school has for you.</p>
            </div>
            <TextField
              label="Email"
              name="email"
              icon={<MailLine aria-hidden />}
              type="email"
              inputMode="email"
              // username, not email: what password managers look for beside a current-password field.
              autoComplete="username"
              autoCapitalize="none"
              enterKeyHint="next"
              spellCheck={false}
              placeholder="name@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null) }}
              autoFocus={!email}
            />
            <div className="grid gap-1">
              <PasswordField
                label="Password"
                name="password"
                icon={<LockLine aria-hidden />}
                autoComplete="current-password"
                enterKeyHint="go"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null) }}
                autoFocus={!!email}
              />
              <button type="button" className="linkbtn justify-self-end" onClick={() => go({ name: 'request', intent: 'reset' })}>
                Forgot password?
              </button>
            </div>
            {error && <FormError id="signin-error">{error}</FormError>}
            <Button type="submit" className="w-full" icon={<LogIn />} loading={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
            <div className="mt-1 grid gap-1 border-t border-line pt-4 text-center">
              <p className="text-small font-semibold text-ink-2">First time here, or never set a password?</p>
              <Button variant="quiet" size="md" className="mx-auto" icon={<MailLine />} onClick={() => go({ name: 'request', intent: 'first' })}>
                Get a sign-in code by email
              </Button>
            </div>
          </form>
        )}
        {step.name === 'request' && (
          <form key={`request-${step.intent}`} onSubmit={(e) => void onRequest(e, step.intent)} noValidate className="page-in grid gap-4">
            <BackToSignIn onClick={() => go({ name: 'password' })} />
            <div className="text-center">
              <h1 className="text-h2">{REQUEST_COPY[step.intent].title}</h1>
              <p className="mt-2 text-body text-ink-2">{REQUEST_COPY[step.intent].text}</p>
            </div>
            <TextField
              label="Email"
              name="email"
              icon={<MailLine aria-hidden />}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              enterKeyHint="send"
              spellCheck={false}
              placeholder="name@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null) }}
              error={error}
              autoFocus
            />
            <Button type="submit" className="w-full" loading={busy}>
              {busy ? 'Sending code…' : 'Email me a code'}<ArrowRight aria-hidden />
            </Button>
          </form>
        )}
        {step.name === 'code' && (
          <form key="code" onSubmit={(e) => void onCode(e, step.intent)} noValidate className="page-in grid gap-4">
            <div className="text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[linear-gradient(155deg,#8a161b,#c8262c)] text-white shadow-[0_12px_24px_-12px_rgb(200_38_44/0.7)]">
                <MailCheck className="size-8" strokeWidth={1.75} aria-hidden />
              </span>
              <h1 className="mt-4 text-h2">Check your email</h1>
              <p className="mt-1.5 text-body text-ink-2">{CODE_SENT[step.intent]}</p>
              {/* The address the code went to, with Change right on it: where people look when it's the wrong one. */}
              <button type="button" className="email-chip mt-3" aria-label={`Change email, now ${email}`}
                onClick={() => go({ name: 'request', intent: step.intent })}>
                <MailLine className="email-chip__mail" aria-hidden />
                <span className="min-w-0 truncate">{email}</span>
                <span className="email-chip__edit"><PencilLine aria-hidden />Change</span>
              </button>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="code" className="px-0.5 text-center text-small font-bold text-ink-2">6-digit code</label>
              {/* One real, visible input: phones offer the code from the email, and it can be pasted, selected and copied. */}
              <input
                ref={codeInput}
                id="code"
                name="code"
                className="code-input"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))
                  setError(null)
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                enterKeyHint="done"
                pattern="[0-9]*"
                placeholder="••••••"
                aria-invalid={!!error || undefined}
                aria-describedby={error ? 'code-error' : undefined}
              />
            </div>
            {error && <FormError id="code-error">{error}</FormError>}
            <Button type="submit" className="w-full" icon={<LogIn />} loading={busy} disabled={code.length !== CODE_LENGTH}>
              {busy ? 'Verifying…' : 'Continue'}
            </Button>
            <Button variant="quiet" size="md" className="mx-auto tabular-nums" icon={<RotateCcw />} disabled={resendIn > 0 || busy} onClick={() => void sendCode(email, step.intent)}>
              {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
            </Button>
            {step.intent === 'first' && (
              <p className="flex flex-wrap items-center justify-center gap-x-1 text-center text-small font-semibold text-ink-2">
                Already created a password?
                <button type="button" className="linkbtn" onClick={() => go({ name: 'request', intent: 'reset' })}>Forgot password?</button>
              </p>
            )}
            <div className="justify-self-center"><BackToSignIn onClick={() => go({ name: 'password' })} /></div>
          </form>
        )}
      </div>
    </SignInFrame>
  )
}
