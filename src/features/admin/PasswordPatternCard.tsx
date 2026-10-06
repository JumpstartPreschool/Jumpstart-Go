import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Info, KeyRound, Plus, RotateCcw, Save, Sparkles, Trash2 } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Notice, ErrorState } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import {
  BLOCKS, checkPattern, generate, labelOf, MAX_BLOCKS, MAX_COUNT, MIN_RANDOM_BITS, RECOMMENDED, STRONG_BITS, summary,
  type Block, type BlockType, type Policy, type Strength,
} from '../../../supabase/functions/_shared/passwordPattern'
import { explainDbError, loadPasswordSettings, savePasswordPattern, type PasswordSettings, type PatternScope } from './api'
import { PasswordRulesCard } from './PasswordRulesCard'
import { ROLE } from './roles'

const SCOPES: Array<{ key: PatternScope; label: string }> = [
  { key: 'default', label: 'Everyone (default)' },
  { key: 'admin', label: ROLE.admin.name },
  { key: 'core', label: ROLE.core.name },
  { key: 'leader', label: ROLE.leader.name },
  { key: 'coordinator', label: ROLE.coordinator.name },
  { key: 'pro', label: ROLE.pro.name },
  { key: 'family', label: 'Parents and family' },
]
const SAMPLE = { full_name: 'Priya Sharma', email: 'priya.sharma@example.com' }
const STRENGTH: Record<Strength, { label: string; cls: string; fill: number }> = {
  weak: { label: 'Weak', cls: 'bg-danger text-danger', fill: 1 },
  acceptable: { label: 'Acceptable', cls: 'bg-warning text-warning', fill: 2 },
  strong: { label: 'Strong', cls: 'bg-live text-live', fill: 3 },
}

/** Settings → Authentication (D55): the password rules and the temporary-password pattern, loaded together. */
export function AuthenticationSettings() {
  const [settings, setSettings] = useState<PasswordSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => {
    setError(null)
    loadPasswordSettings().then(setSettings).catch((e: { code?: string; message?: string }) => setError(explainDbError(e)))
  }
  useEffect(load, [])
  if (error) return <ErrorState title="Couldn't load the password settings" onRetry={load}>{error}</ErrorState>
  if (!settings) return <div className="card h-[520px] animate-pulse rounded-2xl" aria-label="Loading" />
  return (
    <>
      <p className="kicker -mb-2 mt-2">Authentication</p>
      <PasswordRulesCard key={settings.policy.changed_at} saved={settings.policy} onSaved={load} />
      <PasswordPatternCard settings={settings} onSaved={load} />
    </>
  )
}

/** The live strength meter beside the preview: Weak (with the reason it can't be saved), Acceptable or Strong. */
function StrengthMeter({ blocks, policy }: { blocks: Block[]; policy: Policy }) {
  const c = checkPattern(blocks, policy)
  const s = STRENGTH[c.strength]
  const bits = Math.floor(c.bits)
  return (
    <div className="grid gap-2" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="text-small font-bold">Strength: <span className={s.cls.split(' ')[1]}>{s.label}</span></p>
        <p className="text-caption font-bold tabular-nums text-ink-2">{c.length} characters · about {bits} bits random</p>
      </div>
      <div className="grid grid-cols-3 gap-1.5" aria-hidden>
        {[1, 2, 3].map((i) => <span key={i} className={`h-2 rounded-full ${i <= s.fill ? s.cls.split(' ')[0] : 'bg-sunken'}`} />)}
      </div>
      <p className={`text-caption font-bold ${c.problem ? 'text-danger' : 'text-ink-2'}`} role={c.problem ? 'alert' : undefined}>
        {c.problem ?? (c.strength === 'strong'
          ? `${bits} bits of randomness: far out of reach of guessing.`
          : `At least ${MIN_RANDOM_BITS} bits, so it can be saved. ${STRONG_BITS} or more is strong: add random characters.`)}
      </p>
    </div>
  )
}

function newBlock(type: BlockType): Block {
  return type === 'FIXED_TEXT' ? { type, text: 'JS' } : { type, n: type === 'RANDOM_SPECIAL' ? 1 : type.startsWith('RANDOM_') ? 2 : 4 }
}

/**
 * Settings → Authentication → Temporary passwords (D55, 0048). The admin builds the pattern from blocks, with a summary,
 * a live preview and a strength meter. Saving never changes anyone's password: a pattern is used only when a temporary
 * password is issued on a person.
 */
function PasswordPatternCard({ settings, onSaved }: { settings: PasswordSettings; onSaved: () => void }) {
  const toast = useToast()
  const { policy, patterns } = settings
  const [scope, setScope] = useState<PatternScope>('default')
  const saved = patterns[scope]?.blocks ?? null
  const [draft, setDraft] = useState<Block[] | null>(saved)
  const [preview, setPreview] = useState('')
  const [nonce, setNonce] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blocks = draft ?? patterns.default?.blocks ?? RECOMMENDED
  const check = checkPattern(blocks, policy)
  const changed = JSON.stringify(draft) !== JSON.stringify(saved)
  const key = JSON.stringify(blocks)

  // A new example whenever the pattern changes or the admin asks for another; never on unrelated renders.
  useEffect(() => {
    const current = JSON.parse(key) as Block[]
    setPreview(checkPattern(current, policy).problem ? '' : generate(current, SAMPLE))
  }, [key, nonce, policy])

  function choose(next: PatternScope) {
    setScope(next)
    setDraft(patterns[next]?.blocks ?? null)
    setError(null)
  }
  const edit = (next: Block[]) => { setDraft(next); setError(null) }
  const update = (i: number, b: Block) => edit(blocks.map((x, j) => (j === i ? b : x)))
  const move = (i: number, by: -1 | 1) => {
    const next = [...blocks]
    ;[next[i], next[i + by]] = [next[i + by]!, next[i]!]
    edit(next)
  }

  async function save(value: Block[] | null) {
    setBusy(true)
    setError(null)
    try {
      await savePasswordPattern(scope, value)
      setDraft(value)
      toast(value ? 'Pattern saved. Nobody’s password changed.' : 'This role now uses the default pattern.')
      onSaved()
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  const scopeName = SCOPES.find((s) => s.key === scope)!.label
  return (
    <section className="card rounded-2xl p-5 sm:p-6" aria-labelledby="pattern-title">
      <div className="flex items-center gap-3">
        <span className="signin-badge !size-12 shrink-0 !rounded-2xl [&_svg]:!size-6" aria-hidden><KeyRound /></span>
        <h2 id="pattern-title" className="text-h3">Temporary passwords</h2>
      </div>
      <Notice className="mt-3" icon={<Info aria-hidden />}>
        This pattern is used only for temporary passwords. Everyone must create their own password after their first sign-in.
        Saving it changes nobody’s password; it is used when you issue one on a person.
      </Notice>

      <label className="mt-5 grid gap-1.5">
        <span className="px-0.5 text-small font-bold text-ink-2">Pattern for</span>
        <span className="input">
          <select value={scope} onChange={(e) => choose(e.target.value as PatternScope)} className="w-full bg-transparent">
            {SCOPES.map((s) => <option key={s.key} value={s.key}>{s.label}{s.key !== 'default' && patterns[s.key] ? ' (own pattern)' : ''}</option>)}
          </select>
        </span>
      </label>

      {draft === null ? (
        <div className="mt-4 grid gap-3">
          <p className="text-small font-semibold text-ink-2">{scopeName} uses the default pattern: <b className="text-ink">{summary(blocks)}</b>.</p>
          <Button variant="secondary" icon={<Plus />} onClick={() => edit(blocks)}>Give {scopeName} its own pattern</Button>
        </div>
      ) : (
        <form noValidate className="mt-4 grid gap-4" onSubmit={(e) => { e.preventDefault(); if (!check.problem && changed) void save(draft) }}>
          <ol className="grid gap-2" aria-label="Blocks, in order">
            {blocks.map((b, i) => (
              <li key={`${i}-${b.type}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-sunken p-2.5 pl-3.5">
                <span className="min-w-0 flex-1 basis-[140px]">
                  <span className="block text-h4">{labelOf(b.type)}</span>
                  <span className="block text-caption font-semibold text-ink-2">{BLOCKS.find((x) => x.type === b.type)!.means}</span>
                </span>
                {b.type === 'FIXED_TEXT' ? (
                  <span className="input input--mono h-11 w-[150px]">
                    <input aria-label={`Fixed text, block ${i + 1}`} value={b.text} maxLength={16} autoCapitalize="none" spellCheck={false} autoComplete="off"
                      onChange={(e) => update(i, { type: 'FIXED_TEXT', text: e.target.value.replace(/\s/g, '') })} />
                  </span>
                ) : (
                  <span className="input h-11 w-[96px]">
                    <input type="number" inputMode="numeric" min={1} max={MAX_COUNT} aria-label={`${labelOf(b.type)}: characters`} className="tabular-nums" value={Number.isNaN(b.n) ? '' : b.n}
                      onChange={(e) => update(i, { type: b.type, n: e.target.valueAsNumber })} />
                  </span>
                )}
                <span className="flex gap-1">
                  <button type="button" className="iconbtn" aria-label={`Move ${labelOf(b.type)} earlier`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></button>
                  <button type="button" className="iconbtn" aria-label={`Move ${labelOf(b.type)} later`} disabled={i === blocks.length - 1} onClick={() => move(i, 1)}><ArrowDown /></button>
                  <button type="button" className="iconbtn" aria-label={`Remove ${labelOf(b.type)}`} onClick={() => edit(blocks.filter((_, j) => j !== i))}><Trash2 /></button>
                </span>
              </li>
            ))}
          </ol>

          <label className="grid gap-1.5">
            <span className="px-0.5 text-small font-bold text-ink-2">Add block</span>
            <span className="input">
              <Plus aria-hidden />
              <select value="" disabled={blocks.length >= MAX_BLOCKS} onChange={(e) => { if (e.target.value) edit([...blocks, newBlock(e.target.value as BlockType)]) }} className="w-full bg-transparent">
                <option value="">{blocks.length >= MAX_BLOCKS ? `At most ${MAX_BLOCKS} blocks` : 'Choose a block to add…'}</option>
                {BLOCKS.map((b) => <option key={b.type} value={b.type}>{b.label}: {b.means}</option>)}
              </select>
            </span>
          </label>

          <div className="vault grid gap-3">
            <p className="vault__label">Pattern</p>
            <p className="vault__email">{blocks.length ? summary(blocks) : 'No blocks yet'}</p>
            <p className="vault__label">Preview for {SAMPLE.email}</p>
            <p className="vault__secret" data-empty={!preview}>{preview || 'Fix the pattern to see a preview'}</p>
            {preview && <button type="button" className="vault__copy" onClick={() => setNonce(nonce + 1)}><Sparkles aria-hidden />Another example</button>}
          </div>
          <StrengthMeter blocks={blocks} policy={policy} />

          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line pt-4">
            {scope !== 'default' && saved && <Button type="button" variant="secondary" size="md" disabled={busy} onClick={() => void save(null)}>Use the default instead</Button>}
            <Button type="button" variant="secondary" size="md" icon={<RotateCcw />} disabled={busy} onClick={() => edit(RECOMMENDED)}>Restore recommended pattern</Button>
            <Button type="submit" size="md" icon={<Save />} loading={busy} disabled={!!check.problem || !changed}>Save pattern</Button>
          </div>
        </form>
      )}
    </section>
  )
}
