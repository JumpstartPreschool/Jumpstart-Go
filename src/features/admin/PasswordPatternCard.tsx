import { useEffect, useRef, useState } from 'react'
import { CircleCheck, KeyRound, Mail, Save, ShieldCheck, TriangleAlert } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { Sheet } from '../../ui/Sheet'
import { ErrorState, Notice } from '../../ui/States'
import { supabase } from '../../lib/supabase'
import { PATTERN_TOKENS, passwordFor, patternProblem } from '../../../supabase/functions/_shared/passwordPattern'
import { explainDbError, loadPasswordPattern, savePasswordPattern, type PasswordRun } from './api'

const EXAMPLE = '{First}@{domain}#2026'
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

interface Counts { total: number; own: number; sample: string | null }

/**
 * Settings → Email sign-in (0041). The admin builds one pattern from words in each email; saving it sets every email
 * account's password to it at once, so old passwords stop working. People sign in with it once, then choose their own.
 */
export function PasswordPatternCard() {
  const [saved, setSaved] = useState<{ pattern: string; changed_at: string } | null | undefined>(undefined)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pattern, setPattern] = useState('')
  const [tryEmail, setTryEmail] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [result, setResult] = useState<PasswordRun | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoadError(null)
    Promise.all([
      loadPasswordPattern(),
      supabase.from('profiles').select('email, email_sign_in, staff_roles(role)').eq('active', true).eq('app_access', true).not('email', 'is', null),
    ]).then(([p, people]) => {
      if (people.error) throw people.error
      // Staff never get a pattern password (0041), so they aren't counted.
      const rows = (people.data as Array<{ email: string; email_sign_in: string; staff_roles: unknown[] | null }>).filter((r) => !r.staff_roles?.length)
      setSaved(p)
      setPattern(p?.pattern ?? EXAMPLE)
      setCounts({ total: rows.length, own: rows.filter((r) => r.email_sign_in === 'own').length, sample: rows[0]?.email ?? null })
      setTryEmail((t) => t || rows[0]?.email || 'priya.sharma@gmail.com')
    }).catch((e: { code?: string; message?: string }) => setLoadError(explainDbError(e)))
  }
  useEffect(load, [])

  const problem = patternProblem(pattern)
  // After some accounts failed, the same pattern can be saved again to finish them.
  const changed = pattern.trim() !== (saved?.pattern ?? '') || (result?.failed.length ?? 0) > 0
  const preview = !problem && tryEmail.includes('@') ? passwordFor(pattern, tryEmail) : null

  /** Puts a word where the cursor is, so the admin can build the pattern by tapping. */
  function insert(token: string) {
    const el = input.current
    const start = el?.selectionStart ?? pattern.length
    const end = el?.selectionEnd ?? pattern.length
    const next = pattern.slice(0, start) + token + pattern.slice(end)
    setPattern(next)
    setResult(null)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length) })
  }

  async function apply() {
    setBusy(true)
    setRunError(null)
    try {
      const r = await savePasswordPattern(pattern.trim())
      setResult(r)
      setConfirming(false)
      load()
    } catch (e) {
      setRunError(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <ErrorState title="Couldn't load email sign-in" onRetry={load}>{loadError}</ErrorState>
  if (saved === undefined || !counts) return <div className="card h-[520px] animate-pulse rounded-2xl" aria-label="Loading" />

  return (
    <section className="card rounded-2xl p-5 sm:p-6" aria-labelledby="pattern-title">
      <div className="flex items-center gap-3">
        <span className="signin-badge !size-12 shrink-0 !rounded-2xl [&_svg]:!size-6" aria-hidden><KeyRound /></span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="pattern-title" className="text-h3">Email sign-in</h2>
          {saved ? <Pill tone="live" icon={<CircleCheck />}>Set {when(saved.changed_at)}</Pill> : <Pill icon={<TriangleAlert />}>Not set yet</Pill>}
        </div>
      </div>
      <p className="mt-3 text-small font-semibold text-ink-2 text-pretty">
        The mobile number and WhatsApp code stay the main way in. Parents and family with an email on their record can
        also sign in with it and a password made from this pattern, then choose their own. Staff always use the mobile code.
      </p>

      <form noValidate className="mt-5 grid gap-4" onSubmit={(e) => { e.preventDefault(); if (!problem && changed) { setRunError(null); setConfirming(true) } }}>
        <div className="grid gap-1.5">
          <label htmlFor="pattern" className="px-0.5 text-small font-bold text-ink-2">Password pattern</label>
          <div className="input input--mono">
            <KeyRound aria-hidden />
            <input ref={input} id="pattern" value={pattern} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
              aria-invalid={!!problem || undefined} aria-describedby="pattern-msg"
              onChange={(e) => { setPattern(e.target.value); setResult(null) }} />
          </div>
          <p id="pattern-msg" className={`px-0.5 text-caption font-bold ${problem ? 'text-danger' : 'text-ink-2'}`} role={problem ? 'alert' : undefined}>
            {problem ?? 'Fixed text stays as typed. A word in Capitals or UPPER CASE comes out that way.'}
          </p>
        </div>

        <div>
          <p className="kicker mb-2">Tap to add a word from the email</p>
          <div className="flex flex-wrap gap-2">
            {PATTERN_TOKENS.map((t) => (
              <button key={t.token} type="button" className="token-chip" onClick={() => insert(t.token)} aria-label={`Add ${t.token}: ${t.means}`}>
                <code>{t.token}</code><span className="font-semibold text-ink-2">{t.means}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="vault" aria-live="polite">
          <p className="vault__label">Starting password preview</p>
          <div className="input mt-3 h-12">
            <Mail aria-hidden />
            <input type="email" inputMode="email" autoCapitalize="none" spellCheck={false} aria-label="Try with an email" value={tryEmail}
              onChange={(e) => setTryEmail(e.target.value)} placeholder="Try with an email" />
          </div>
          <p className="vault__email">{tryEmail.includes('@') ? `For ${tryEmail.trim()}` : 'Type an email to see its password'}</p>
          <p className="vault__secret" data-empty={!preview}>{preview ?? (problem ? 'Fix the pattern to see a preview' : '—')}</p>
        </div>

        {result && (
          <Notice tone={result.failed.length ? 'warning' : 'success'} icon={result.failed.length ? <TriangleAlert aria-hidden /> : <CircleCheck aria-hidden />}>
            <span className="grid gap-1">
              <b>{result.updated === 1 ? '1 person has' : `${result.updated} people have`} the new starting password.</b>
              {result.failed.map((f) => <span key={f.name} className="text-caption font-semibold">{f.name}: {f.reason}</span>)}
              {result.failed.length > 0 && <span className="text-caption font-semibold">Fix these, then save the pattern again.</span>}
            </span>
          </Notice>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-small font-semibold text-ink-2">
            <b className="tabular-nums text-ink">{counts.total}</b> {counts.total === 1 ? 'parent or relative has' : 'parents and family have'} an email
            {counts.own > 0 && <>, <b className="tabular-nums text-ink">{counts.own}</b> chose their own password</>}.
          </p>
          <Button type="submit" size="md" icon={<Save />} disabled={!!problem || !changed}>{saved ? 'Save new pattern' : 'Save pattern'}</Button>
        </div>
      </form>

      <Sheet open={confirming} onClose={() => !busy && setConfirming(false)} title="Change everyone's email password?"
        description={`All ${counts.total} email passwords change to this pattern now, including ones people chose. Old passwords stop working. Anyone signed in stays signed in, and WhatsApp codes work as before.`}>
        <div className="grid gap-4">
          <div className="vault">
            <p className="vault__label">New pattern</p>
            <p className="vault__secret">{pattern.trim()}</p>
            {preview && <p className="vault__email mt-2">{tryEmail.trim()} → <b className="font-mono text-white">{preview}</b></p>}
          </div>
          {runError && <Notice tone="danger">{runError}</Notice>}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
            <Button icon={<ShieldCheck />} loading={busy} onClick={() => void apply()}>{busy ? 'Updating passwords…' : 'Change passwords'}</Button>
          </div>
        </div>
      </Sheet>
    </section>
  )
}
