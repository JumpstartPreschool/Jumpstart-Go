import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ChevronRight, FlaskConical, Mail, RotateCcw, ShieldCheck } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Logo, Mascot } from '../../ui/Logo'
import { TextField } from '../../ui/Field'
import { normalizeEmail } from '../../domain/contact'
import { supabase } from '../../lib/supabase'
import { DEMO_AVAILABLE, DEMO_CODE, DEMO_EMAIL, enterDemo, isDemo } from '../../demo/demo'
import { AREA_ICON, AREA_LABEL } from './AreaShell'
import type { Area } from './session'

const CODE_LENGTH = 6
const RESEND_AFTER_S = 30
const DEMO_ROLES: Array<{ area: Area; what: string }> = [
  { area: 'admin', what: 'People, roles and classes' },
  { area: 'core', what: "Today's children and coordinators" },
  { area: 'coordinator', what: 'The gate iPad on duty' },
  { area: 'parent', what: "A parent's Today" },
]
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

function explain(message: string | undefined, status: number | undefined): string {
  if (message?.includes('not_invited')) return "This email isn't registered with Jumpstart. Please contact the school."
  if (status === 429 || /rate limit|too many/i.test(message ?? '')) return 'Too many attempts. Please wait a few minutes and try again.'
  if (/expired|invalid/i.test(message ?? '')) return 'That code is wrong or has expired. Check the latest email, or send a new code.'
  return 'Something went wrong. Check your connection and try again.'
}

/** Invite-only login with a one-time code by email (AUTH-1, J11). */
export function LoginScreen() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const [demoArea, setDemoArea] = useState<Area | null>(null)
  // Always false in production builds, so the demo text is dropped there.
  const demo = DEMO_AVAILABLE && isDemo()
  const codeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  async function sendCode(address: string): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      const { data: allowed, error: checkError } = await supabase.rpc('login_allowed', { p_email: address })
      if (checkError) throw checkError
      if (!allowed) {
        setError(explain('not_invited', undefined))
        return false
      }
      // shouldCreateUser: the first code creates the account, which the database links to the invite (0002).
      const { error: otpError } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } })
      if (otpError) {
        setError(explain(otpError.message, otpError.status))
        return false
      }
      setStep('code')
      setCode('')
      setResendIn(RESEND_AFTER_S)
      setTimeout(() => codeInput.current?.focus(), 50)
      return true
    } catch (e) {
      setError(explain((e as Error).message, undefined))
      return false
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

  async function verify(address: string, token: string) {
    setBusy(true)
    setError(null)
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: address, token, type: 'email' })
    setBusy(false)
    // On success the session provider takes over and routes the person to their area.
    if (verifyError) setError(explain(verifyError.message, verifyError.status))
  }

  async function onCode(e?: FormEvent) {
    e?.preventDefault()
    if (code.length !== CODE_LENGTH) return setError(`Enter all ${CODE_LENGTH} digits of the code.`)
    await verify(email, code)
  }

  /** Demo only: sign in with the sample account, typing the dummy code the way a person would. */
  async function tryDemo(area: Area) {
    setDemoArea(area)
    enterDemo(area)
    setEmail(DEMO_EMAIL)
    if (await sendCode(DEMO_EMAIL)) {
      for (let i = 1; i <= CODE_LENGTH; i++) {
        await pause(120)
        setCode(DEMO_CODE.slice(0, i))
      }
      await pause(300)
      await verify(DEMO_EMAIL, DEMO_CODE)
    }
    setDemoArea(null)
  }

  return (
    <main className="gutter mx-auto flex min-h-dvh w-full max-w-[calc(480px+2*var(--gutter))] flex-col justify-center pt-[max(32px,calc(env(safe-area-inset-top)+20px))] pb-[max(28px,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        <Logo className="h-14 sm:h-16" />
        <p className="mt-2 text-small font-bold text-ink-2">Preschool &amp; Learning Center · Karve Road</p>
      </div>

      <div className="card mt-8 rounded-2xl p-6 sm:p-8">
        {step === 'email' ? (
          <form key="email" onSubmit={onEmail} noValidate className="page-in">
            <Mascot size={84} className="mx-auto" />
            <h1 className="mt-3 text-center text-h1">Welcome!</h1>
            <p className="mt-2 text-center text-lead text-ink-2">Sign in with the email the school has for you. We'll send you a <span className="whitespace-nowrap">6-digit</span> code.</p>
            <div className="mt-6">
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
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                error={error}
                autoFocus
              />
            </div>
            <Button type="submit" size="xl" className="mt-5 w-full" loading={busy && !demoArea}>
              Send code
            </Button>
          </form>
        ) : (
          <form key="code" onSubmit={onCode} noValidate className="page-in">
            <div className="mx-auto grid size-16 place-items-center rounded-lg bg-accent-soft text-accent">
              <ShieldCheck className="size-8" aria-hidden />
            </div>
            <h1 className="mt-4 text-center text-h1">{demo ? 'Demo sign-in' : 'Check your email'}</h1>
            <p className="mt-2 text-center text-body text-ink-2">
              {demo
                ? <>Demo mode: no email is sent. The dummy code for <span className="font-bold text-ink">{email}</span> fills itself in.</>
                : <>We sent a 6-digit code to <span className="font-bold text-ink">{email}</span>. It works for 5 minutes.</>}
            </p>
            <label htmlFor="code" className="sr-only">6-digit code</label>
            {/* One real input (so iOS can fill the code from Mail), drawn as six boxes. */}
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
                aria-describedby={error ? 'code-error' : undefined}
                className="peer absolute inset-0 h-full w-full cursor-text text-[17px] opacity-0"
              />
              <div className="grid grid-cols-6 gap-2" aria-hidden>
                {Array.from({ length: CODE_LENGTH }, (_, i) => {
                  const current = i === code.length
                  return (
                    <span key={i}
                      className={`grid h-16 place-items-center rounded-md bg-surface text-[28px] font-extrabold tabular-nums transition-[box-shadow] duration-150 ${
                        error ? 'shadow-[0_3px_0_var(--danger-line),inset_0_0_0_1.5px_var(--danger)]'
                          : current ? 'shadow-[0_3px_0_var(--accent-lip),inset_0_0_0_2px_var(--accent)]' : 'shadow-[0_3px_0_var(--line-2),inset_0_0_0_1.5px_var(--line-2)]'
                      }`}>
                      {code[i] ?? ''}
                    </span>
                  )
                })}
              </div>
            </div>
            {error && <p id="code-error" className="mt-3 text-center text-small font-bold text-danger" role="alert">{error}</p>}
            {demo && <p className="mt-3 text-center text-small font-bold text-ink-2">Demo code: <span className="tracking-[0.12em] text-ink tabular-nums">{DEMO_CODE}</span></p>}
            <Button type="submit" size="xl" className="mt-5 w-full" loading={busy} disabled={code.length !== CODE_LENGTH}>
              Sign in
            </Button>
            <div className="mt-3 grid gap-2 min-[400px]:grid-cols-2">
              <Button size="md" variant="quiet" icon={<ArrowLeft />} onClick={() => { setStep('email'); setError(null) }}>
                Other email
              </Button>
              <Button size="md" variant="quiet" icon={<RotateCcw />} disabled={resendIn > 0 || busy} onClick={() => void sendCode(email)}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Send a new code'}
              </Button>
            </div>
          </form>
        )}
      </div>

      {DEMO_AVAILABLE && step === 'email' && (
        <section className="mt-5 rounded-2xl border border-dashed border-line-2 p-5 sm:p-6" aria-labelledby="demo-title">
          <h2 id="demo-title" className="kicker flex items-center gap-2">
            <FlaskConical className="size-4" aria-hidden /> Try the demo
          </h2>
          <p className="mt-1.5 text-small text-ink-2">
            Opens an area with sample children and a dummy code. It stays in this browser and never touches the school's records.
          </p>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {DEMO_ROLES.map(({ area, what }) => (
              <button key={area} type="button" disabled={busy || demoArea !== null} onClick={() => void tryDemo(area)} aria-busy={demoArea === area || undefined}
                className="choice flex items-center gap-3 p-3 disabled:opacity-60!">
                <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-secondary text-canvas [&_svg]:size-5" aria-hidden>{AREA_ICON[area]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-h4">{AREA_LABEL[area]}</span>
                  <span className="block truncate text-caption font-semibold text-ink-2">{what}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
