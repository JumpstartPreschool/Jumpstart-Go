import { useEffect, useRef, useState } from 'react'
import { CircleCheck, Megaphone, RotateCcw, Save, TriangleAlert, Volume2 } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { Sheet } from '../../ui/Sheet'
import { ErrorState, Notice } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { useToast } from '../../ui/Toast'
import { supabase } from '../../lib/supabase'
import {
  ALLOWED, DEFAULT_GATE, etaOf, gateSettings, messageFor, OPENING_KEYS, openingProblem, SAMPLE_CHILD, TEMPLATE_KEYS, templateProblem,
  TIMING_CHOICES, TIMING_KEYS, timingProblem, VARIABLES, type GateSettings, type Kind, type OpeningKey, type TemplateKey, type TimingKey,
} from '../../../supabase/functions/_shared/gateAnnounce'
import { explainDbError } from './api'

const TIMING: Record<TimingKey, { title: string; text: string }> = {
  early_min: { title: 'Early announcement', text: 'The first time the gate hears a trip that is on its way.' },
  ready_min: { title: 'Get ready', text: 'Announced again: time to get the child ready.' },
  urgent_min: { title: 'Urgent', text: 'Said with the urgent opening and played first.' },
  reminder_min: { title: 'Reminder every', text: 'Until someone on the gate acknowledges it, with the time left then.' },
}
const OPENING: Record<OpeningKey, string> = { opening_new: 'New', opening_urgent: 'Urgent', opening_reminder: 'Reminder' }
const STATE_LABEL = { eta: 'On the way', late: 'Running late', arrived: 'Arrived', cancelled: 'Cancelled' } as const
type SampleEta = 15 | 10 | 5 | 0
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

/** What a draft says for the example child, opening first, exactly as the gate would build it. */
function sample(s: GateSettings, key: TemplateKey, minutes: SampleEta): string {
  const kind: Kind = key.startsWith('pickup') ? 'pickup' : 'dropoff'
  const now = Date.now()
  const arriveAt = now + minutes * 60_000
  const timed = key.endsWith('_eta') || key.endsWith('_late')
  const urgent = key.endsWith('_arrived') || (key.endsWith('_eta') && minutes <= s.urgent_min)
  const event = timed ? { kind, state: key.endsWith('_late') ? 'late' : 'eta', eta: etaOf(arriveAt, now), arriveAt: new Date(arriveAt) } as const
    : { kind, state: key.endsWith('_arrived') ? 'arrived' : 'cancelled' } as const
  // A running-late update carries its own lead ("Pickup update."), so no opening goes before it.
  if (key.endsWith('_late')) return messageFor(s, event, SAMPLE_CHILD, 'Mother')
  const opening = key.endsWith('_cancelled') ? s.opening_new : urgent ? s.opening_urgent : s.opening_new
  return `${opening} ${messageFor(s, event, SAMPLE_CHILD, 'Mother')}`
}

/** One template: the wording, variables to tap in, its check, and the example as the gate would say it. */
function TemplateEditor({ k, value, fallback, onChange, onPlay, playing }: {
  k: TemplateKey; value: string; fallback: GateSettings; onChange: (v: string) => void; onPlay: (text: string) => void; playing: string | null
}) {
  const input = useRef<HTMLTextAreaElement>(null)
  const [eta, setEta] = useState<SampleEta>(10)
  const problem = templateProblem(k, value)
  const id = `tpl-${k}`
  // A broken draft is previewed as the gate would say it: with the saved wording.
  const said = sample(problem ? fallback : { ...fallback, [k]: value }, k, eta)
  function insert(name: string) {
    const el = input.current
    const token = `{{${name}}}`
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length) })
  }
  const state = k.split('_')[1] as keyof typeof STATE_LABEL
  return (
    <div className="grid gap-3 rounded-2xl bg-sunken/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-h4">{STATE_LABEL[state]}</label>
        {value.trim() !== DEFAULT_GATE[k] && (
          <Button size="md" variant="quiet" icon={<RotateCcw />} onClick={() => onChange(DEFAULT_GATE[k])}>Reset to default</Button>
        )}
      </div>
      <div className="input input--mono h-auto py-2.5">
        <textarea ref={input} id={id} rows={2} maxLength={200} value={value} spellCheck={false} aria-invalid={!!problem || undefined} aria-describedby={`${id}-msg`}
          onChange={(e) => onChange(e.target.value)} className="min-h-[64px] w-full resize-y bg-transparent outline-none" />
      </div>
      <p id={`${id}-msg`} className={`text-caption font-bold ${problem ? 'text-danger' : 'text-ink-2'}`} role={problem ? 'alert' : undefined}>
        {problem ?? 'Tap a variable to add it where the cursor is.'}
      </p>
      <div className="flex flex-wrap gap-2" aria-label="Variables">
        {ALLOWED[k].map((v) => (
          <button key={v} type="button" className="token-chip" aria-label={`Add ${VARIABLES[v].label}`} onClick={() => insert(v)}>
            <code>{`{{${v}}}`}</code><span className="font-semibold text-ink-2">{VARIABLES[v].label}</span>
          </button>
        ))}
      </div>
      <div className="vault">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="vault__label">The gate hears</p>
          {(k.endsWith('_eta') || k.endsWith('_late')) && (
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Example arrival">
              {([15, 10, 5, 0] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={eta === m} onClick={() => setEta(m)}
                  className={`vault__copy !min-h-11 !min-w-11 !px-3 !text-[13px] ${eta === m ? '!bg-white/20' : ''}`}>{m ? `${m} min` : 'Due'}</button>
              ))}
            </div>
          )}
        </div>
        <p className="mt-3 text-[17px] font-semibold leading-snug text-white text-pretty">“{said}”</p>
        {problem && <p className="vault__email mt-2">Until it's fixed, the gate uses the saved wording.</p>}
        <button type="button" className="vault__copy mt-4" disabled={!!playing} onClick={() => onPlay(said)}>
          <Volume2 aria-hidden />{playing === said ? 'Playing…' : 'Play preview'}
        </button>
      </div>
    </div>
  )
}

/**
 * Admin → Settings → Gate announcements (0042): the timings, the openings and the wording of each announcement, with
 * an example and a preview in the school's voice. Saved together; the database checks it again and logs the change.
 * The order the gate plays them in stays fixed: arrived, urgent, outside the usual time, the rest, then reminders.
 */
export function GateAnnouncementsCard() {
  const toast = useToast()
  const [saved, setSaved] = useState<{ s: GateSettings; updated_at: string | null; custom: boolean } | null>(null)
  const [draft, setDraft] = useState<GateSettings>(DEFAULT_GATE)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Kind>('pickup')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)
  const [heard, setHeard] = useState<string | null>(null)

  /** Shows a settings row, from a read or from the save that just returned it. */
  const show = (data: unknown) => {
    const s = gateSettings(data as Parameters<typeof gateSettings>[0])
    const row = (data ?? {}) as Record<string, unknown>
    const custom = [...TEMPLATE_KEYS, ...OPENING_KEYS].some((k) => row[k] != null) || TIMING_KEYS.some((k) => row[k] != null && row[k] !== DEFAULT_GATE[k])
    setSaved({ s, updated_at: (row.updated_at as string | undefined) ?? null, custom })
    setDraft(s)
  }
  const load = () => {
    setLoadError(null)
    void supabase.from('gate_announcement_settings').select('*').maybeSingle().then(({ data, error: e }) => (e ? setLoadError(explainDbError(e)) : show(data)))
  }
  useEffect(load, [])

  const set = <K extends keyof GateSettings>(k: K, v: GateSettings[K]) => { setDraft((d) => ({ ...d, [k]: v })); setError(null) }
  const timing = timingProblem(draft)
  const problems = [...TEMPLATE_KEYS.map((k) => templateProblem(k, draft[k])), ...OPENING_KEYS.map((k) => openingProblem(draft[k])), timing].filter(Boolean)
  const dirty = !!saved && (Object.keys(DEFAULT_GATE) as Array<keyof GateSettings>).some((k) => String(draft[k]).trim() !== String(saved.s[k]))

  async function save(next: GateSettings) {
    setBusy(true)
    setError(null)
    // A wording the same as the default is saved as "default", so it follows any future improvement to the default.
    const p: Record<string, unknown> = Object.fromEntries(TIMING_KEYS.map((k) => [k, next[k]]))
    for (const k of [...TEMPLATE_KEYS, ...OPENING_KEYS]) p[k] = next[k].trim() === DEFAULT_GATE[k] ? null : next[k].trim()
    const { data, error: e } = await supabase.rpc('admin_save_gate_announcements', { p })
    setBusy(false)
    if (e) return setError(explainDbError(e))
    setConfirmReset(false)
    toast('Saved. Gate iPads use it from their next announcement.')
    // The save returns the row it stored: no second read that could fail or overwrite edits made meanwhile.
    show(data)
  }

  /** The draft as the gate would say it, through the same voice as the gate: the school's clips, made if needed. */
  async function play(text: string) {
    setPlaying(text)
    setHeard(null)
    try {
      const sound = await import('../duty/sound')
      sound.unlockSound()
      sound.setVoiceOpenings([draft.opening_new, draft.opening_urgent, draft.opening_reminder])
      const { loadVoiceVersion } = await import('../duty/voiceClips')
      await loadVoiceVersion()
      const voice = await sound.speak(text, undefined, 10_000)
      setHeard(voice === 'school' ? 'Played in the school voice.' : voice === 'device' ? "The school voice wasn't ready, so this device's voice played it. Try again in a moment." : voice === 'cut' ? 'It was cut off before the end. Play it again.' : "Couldn't play it. Check the sound is on.")
    } catch {
      setHeard("Couldn't play it. Check the sound is on.")
    } finally {
      setPlaying(null)
    }
  }

  if (loadError && !saved) return <ErrorState title="Couldn't load gate announcements" onRetry={load}>{loadError}</ErrorState>
  if (!saved) return <div className="card h-[640px] animate-pulse rounded-2xl" aria-label="Loading" />

  return (
    <section className="card rounded-2xl p-5 sm:p-6" aria-labelledby="gate-title">
      <div className="flex items-center gap-3">
        <span className="signin-badge !size-12 shrink-0 !rounded-2xl [&_svg]:!size-6" aria-hidden><Megaphone /></span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="gate-title" className="text-h3">Gate announcements</h2>
          {saved.custom ? <Pill tone="accent" icon={<CircleCheck />}>{saved.updated_at ? `Changed ${when(saved.updated_at)}` : 'Changed'}</Pill> : <Pill icon={<CircleCheck />}>School defaults</Pill>}
        </div>
      </div>
      <p className="mt-3 text-small font-semibold text-ink-2 text-pretty">
        What Center Leaders and Center Coordinators hear, and when. The arrival time is always said, worked out from the time the
        parent chose. Arrived plays first, then urgent, then anything outside the usual time.
      </p>

      <h3 className="kicker mt-6 mb-1">When</h3>
      <div className="divide-y divide-line">
        {TIMING_KEYS.map((k) => (
          <div key={k} className="flex flex-wrap items-center gap-x-5 gap-y-3 py-3.5">
            <div className="min-w-0 flex-1 basis-[220px]">
              <p className="text-h4">{TIMING[k].title}</p>
              <p className="text-small font-semibold text-ink-2">{TIMING[k].text}</p>
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={TIMING[k].title}>
              {TIMING_CHOICES[k].map((v) => (
                <button key={v} type="button" role="radio" aria-checked={draft[k] === v} onClick={() => set(k, v)}
                  className="choice h-12 min-w-[76px] px-3 text-h4 tabular-nums">{v} min</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {timing && <Notice tone="danger" icon={<TriangleAlert aria-hidden />} className="mt-2">{timing}</Notice>}

      <h3 className="kicker mt-6 mb-2">Openings</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {OPENING_KEYS.map((k) => {
          const problem = openingProblem(draft[k])
          return (
            <div key={k} className="grid content-start gap-1.5">
              <label htmlFor={k} className="px-0.5 text-small font-bold text-ink-2">{OPENING[k]}</label>
              <div className="input"><Megaphone aria-hidden /><input id={k} value={draft[k]} maxLength={40} aria-invalid={!!problem || undefined} onChange={(e) => set(k, e.target.value)} /></div>
              {problem ? <p className="px-0.5 text-caption font-bold text-danger" role="alert">{problem}</p>
                : draft[k].trim() !== DEFAULT_GATE[k] && <button type="button" className="linkbtn justify-self-start text-caption" onClick={() => set(k, DEFAULT_GATE[k])}>Reset to “{DEFAULT_GATE[k]}”</button>}
            </div>
          )
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h3 className="kicker">Wording</h3>
        <Tabs id="gate-kind" label="Announcement type" value={tab} onChange={setTab} items={[{ key: 'pickup', label: 'Pickup' }, { key: 'dropoff', label: 'Drop-off' }]} />
      </div>
      <div id="gate-kind-panel" role="tabpanel" className="mt-3 grid gap-3">
        {TEMPLATE_KEYS.filter((k) => k.startsWith(tab)).map((k) => (
          <TemplateEditor key={k} k={k} value={draft[k]} fallback={{ ...saved.s, opening_new: draft.opening_new, opening_urgent: draft.opening_urgent, urgent_min: draft.urgent_min }} onChange={(v) => set(k, v)} onPlay={(t) => void play(t)} playing={playing} />
        ))}
      </div>
      {heard && <Notice className="mt-3">{heard}</Notice>}

      {error && <Notice tone="danger" className="mt-4">{error}</Notice>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-small font-semibold text-ink-2 text-pretty basis-[260px] flex-1">
          {problems.length ? `${problems.length} ${problems.length === 1 ? 'thing needs' : 'things need'} fixing before saving.`
            : 'New wording is recorded again for every child in the school voice, ready on the iPads within a few minutes.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {saved.custom && <Button size="md" variant="secondary" icon={<RotateCcw />} onClick={() => setConfirmReset(true)}>Reset all</Button>}
          <Button size="md" icon={<Save />} loading={busy} disabled={!dirty || problems.length > 0} onClick={() => void save(draft)}>Save</Button>
        </div>
      </div>

      <Sheet open={confirmReset} onClose={() => !busy && setConfirmReset(false)} title="Reset gate announcements?"
        description="Every wording, opening and timing goes back to the school's defaults. Gate iPads use them from their next announcement.">
        {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Button variant="secondary" disabled={busy} onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button icon={<RotateCcw />} loading={busy} onClick={() => void save(DEFAULT_GATE)}>Reset to defaults</Button>
        </div>
      </Sheet>
    </section>
  )
}
