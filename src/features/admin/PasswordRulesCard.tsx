import { useState } from 'react'
import { Lock, Save, ShieldCheck } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { Notice } from '../../ui/States'
import { Switch } from '../../ui/Switch'
import { useToast } from '../../ui/Toast'
import { POLICY_LIMITS, POLICY_NAMES, policyProblem, type Policy } from '../../../supabase/functions/_shared/passwordPattern'
import { explainDbError, savePasswordPolicy } from './api'

const NUMBERS = ['min_length', 'max_length', 'temp_expiry_hours', 'reuse_count', 'max_failed', 'lock_minutes'] as const
const SWITCHES = [
  ['require_upper', 'Needs a capital letter'],
  ['require_lower', 'Needs a small letter'],
  ['require_number', 'Needs a digit'],
  ['require_special', 'Needs a symbol'],
] as const

const pick = (p: Policy): Policy => ({
  min_length: p.min_length, max_length: p.max_length, require_upper: p.require_upper, require_lower: p.require_lower,
  require_number: p.require_number, require_special: p.require_special, temp_expiry_hours: p.temp_expiry_hours,
  reuse_count: p.reuse_count, max_failed: p.max_failed, lock_minutes: p.lock_minutes,
})

/**
 * Settings → Authentication → Password rules (D55, 0048): what every email password must follow, how long a temporary
 * one lasts, and the lock after wrong tries. Saving changes nobody's password. A lock never affects WhatsApp codes.
 */
export function PasswordRulesCard({ saved, onSaved }: { saved: Policy; onSaved: () => void }) {
  const toast = useToast()
  const [draft, setDraft] = useState<Policy>(() => pick(saved))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problem = policyProblem(draft)
  const changed = JSON.stringify(draft) !== JSON.stringify(pick(saved))

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await savePasswordPolicy(draft)
      toast('Password rules saved. Nobody’s password changed.')
      onSaved()
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card rounded-2xl p-5 sm:p-6" aria-labelledby="rules-title">
      <div className="flex items-center gap-3">
        <span className="signin-badge !size-12 shrink-0 !rounded-2xl [&_svg]:!size-6" aria-hidden><ShieldCheck /></span>
        <h2 id="rules-title" className="text-h3">Password rules</h2>
      </div>
      <p className="mt-3 text-small font-semibold text-ink-2 text-pretty">
        For email sign-in, the second way in after the WhatsApp code. Every password, temporary or chosen, follows these.
      </p>
      <form noValidate className="mt-5 grid gap-4" onSubmit={(e) => { e.preventDefault(); if (!problem && changed) void save() }}>
        <div className="grid gap-3 sm:grid-cols-2">
          {NUMBERS.map((key) => (
            <label key={key} className="grid gap-1.5">
              <span className="px-0.5 text-small font-bold text-ink-2">{POLICY_NAMES[key]}</span>
              <span className="input">
                <input type="number" inputMode="numeric" min={POLICY_LIMITS[key][0]} max={POLICY_LIMITS[key][1]} step={1} value={Number.isNaN(draft[key]) ? '' : draft[key]}
                  onChange={(e) => { setDraft({ ...draft, [key]: e.target.valueAsNumber }); setError(null) }} className="tabular-nums" />
              </span>
            </label>
          ))}
        </div>
        <div className="grid gap-1 sm:grid-cols-2">
          {SWITCHES.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3 py-1">
              <span className="text-small font-bold">{label}</span>
              <Switch on={draft[key]} label={label} onChange={(v) => { setDraft({ ...draft, [key]: v }); setError(null) }} />
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-small font-bold">Choose their own at first sign-in</span>
            <Pill icon={<Lock />}>Always on</Pill>
          </div>
        </div>
        {(problem || error) && <Notice tone="danger">{problem ?? error}</Notice>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-small font-semibold text-ink-2">A lock stops email sign-in only. WhatsApp codes always work.</p>
          <Button type="submit" size="md" icon={<Save />} loading={busy} disabled={!!problem || !changed}>Save rules</Button>
        </div>
      </form>
    </section>
  )
}
