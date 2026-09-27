import { Link } from 'react-router'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, KeyRound, LogIn, MailCheck, MailLine, MapPin, UserCheck } from '../../ui/icons'
import { BorderBeam } from '../../ui/BorderBeam'
import { Button } from '../../ui/Button'
import { Logo, Mascot } from '../../ui/Logo'
import { TextField } from '../../ui/Field'
import { useToast } from '../../ui/Toast'
import { normalizeEmail } from '../../domain/contact'
import { supabase } from '../../lib/supabase'
import { chooseArea } from './session'

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

function explain(message: string | undefined, status: number | undefined): string {
  if (message?.includes('not_invited')) return "This email isn't on Jumpstart's list. Only people the school adds can sign in."
  if (message?.startsWith('rate_limited')) return "You've asked for a lot of codes in the last hour. Use the latest one in your email, or try again later."
  if (status === 429 || /rate.limit|too many/i.test(message ?? '')) return 'Too many codes were sent in the last hour. Use the latest one in your email, or try again in a few minutes.'
  if (/expired|invalid/i.test(message ?? '')) return "That code isn't right or has expired. Check the latest email, or send a new code."
  return 'Something went wrong. Check your connection and try again.'
}

const PROMISES = [
  { icon: <UserCheck />, title: 'Invite only', text: 'The school adds every account.' },
  { icon: <KeyRound />, title: 'No passwords', text: 'A 6-digit code by email.' },
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

/**
 * Invite-only login with a one-time code by email (AUTH-1, J11). One screen for every role: the account decides the area.
 * Real codes are never shown by the app; phones offer them from the email (one-time-code).
 */
export function LoginScreen() {
  const toast = useToast()
  const [step, setStep] = useState<'email' | 'code'>('email')
  // From the invitation email's button (/#email=…): their address is filled in, ready for Send me a code.
  const [email, setEmail] = useState(invitedEmail)
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

  async function sendCode(address: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const { data: allowed, error: checkError } = await supabase.rpc('login_allowed', { p_email: address })
      if (checkError) throw checkError
      if (!allowed) return setError(explain('not_invited', undefined))
      // shouldCreateUser: the first code creates the account, which the database links to the invite (0002).
      const { error: otpError } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } })
      // Asked again within the minute: the code already sent still works, so go on to it (not a dead end).
      const wait = /after (\d+) seconds?/i.exec(otpError?.message ?? '')
      if (otpError && wait) {
        setStep('code')
        setResendIn(Number(wait[1]))
        setCode('')
        toast(`We sent you a code a moment ago. Use that one; a new one can be sent in ${wait[1]} seconds.`, { tone: 'info' })
        setTimeout(() => codeInput.current?.focus(), 50)
        return
      }
      if (otpError) return setError(explain(otpError.message, otpError.status))
      setStep('code')
      setResendIn(RESEND_AFTER_S)
      setCode('')
      toast(`Code sent to ${address}.`)
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
    if (!address) return setError('Enter a full email address, like name@example.com.')
    setEmail(address)
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
      <div className="card relative overflow-hidden rounded-[28px] p-6 shadow-[var(--shadow-lift)] sm:p-8">
        <BorderBeam />
        {step === 'email' ? (
          <form key="email" onSubmit={onEmail} noValidate className="page-in grid gap-4">
            <div className="text-center">
              <p className="text-caption font-extrabold uppercase tracking-[0.14em] text-accent-ink">Welcome</p>
              <h1 className="mt-1 text-h1">Sign in to Jumpstart Go</h1>
              <p className="mt-2 text-body text-ink-2">Use the email the school has for you.</p>
            </div>
            <TextField
              label="Email"
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
              Send me a code<ArrowRight aria-hidden />
            </Button>
          </form>
        ) : (
          <form key="code" onSubmit={onCode} noValidate className="page-in grid gap-4">
            <div className="text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[linear-gradient(155deg,#8a161b,#c8262c)] text-white shadow-[0_12px_24px_-12px_rgb(200_38_44/0.7)]">
                <MailCheck className="size-8" strokeWidth={1.75} aria-hidden />
              </span>
              <h1 className="mt-4 text-h2">Check your email</h1>
              <p className="mt-1.5 text-body text-ink-2">
                We sent a 6-digit code to <span className="font-bold text-ink">{email}</span>. It works for 5 minutes.
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
            <Button type="submit" className="w-full" icon={<LogIn />} loading={busy} disabled={code.length !== CODE_LENGTH}>
              Sign in
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              <button type="button" className="linkbtn" disabled={resendIn > 0 || busy} onClick={() => void sendCode(email)}>
                {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
              </button>
              <button type="button" className="linkbtn" onClick={() => { setStep('email'); setCode(''); setError(null) }}>Change email</button>
            </div>
          </form>
        )}
      </div>

    </SignInFrame>
  )
}
