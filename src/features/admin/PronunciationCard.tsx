import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { CircleCheck, PencilLine, RotateCcw, TriangleAlert } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { Notice } from '../../ui/States'
import { SpeakButton, type SpeakState } from '../../ui/SpeakButton'
import { useToast } from '../../ui/Toast'
import { onTableChange } from '../../lib/live'
import { checkSpeech, voiceSentence } from '../../../supabase/functions/_shared/announce.ts'
import { playSentence, stopSound } from '../duty/sound'
import { explainDbError, getChildPronunciation, retryChildVoice, setChildPronunciation, type ChildPronunciation } from './api'
import type { Child } from './api'

/** "Aaradhya Sharma." said the way `spoken` writes it (or as registered): what the gate voice will say. */
const nameSentence = (child: Child, spoken: string | null) =>
  voiceSentence(`${child.full_name}.`, { fullName: child.full_name, name: child.preferred_name ?? child.full_name.split(' ')[0]!, spoken })

/**
 * How the gate says this child's name (D48). A person listens and approves it; if it sounds wrong they write it the way
 * it sounds ("Aa-raadh-ya"), preview, and save. The name on screen never changes. Admin and head office only.
 */
export function PronunciationCard({ child }: { child: Child }) {
  const toast = useToast()
  const [row, setRow] = useState<ChildPronunciation | null>(null)
  const onChanged = useCallback(() => { getChildPronunciation(child.id).then(setRow, () => {}) }, [child.id])
  useEffect(onChanged, [onChanged])
  const [playing, setPlaying] = useState<{ what: 'saved' | 'draft'; state: SpeakState } | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const spoken = row?.spoken_name ?? null

  useEffect(() => () => stopSound(), [])
  useEffect(() => { if (editing) input.current?.focus() }, [editing])
  useEffect(() => onTableChange('child_pronunciations', onChanged), [onChanged])

  async function play(what: 'saved' | 'draft') {
    const words = what === 'draft' ? draft.trim() : spoken
    setError(null)
    setPlaying({ what, state: 'loading' })
    try {
      await playSentence(nameSentence(child, words || null), () => setPlaying({ what, state: 'playing' }))
    } catch {
      setError(what === 'draft'
        ? "Couldn't make a preview. The school's voice computer may be off; try again in a minute."
        : "Couldn't play the name. The school's voice computer may be off; try again in a minute.")
    } finally {
      setPlaying(null)
    }
  }
  function stop() {
    stopSound()
    setPlaying(null)
  }

  async function save(value: string, approve: boolean, done: string) {
    setBusy(true)
    setError(null)
    try {
      await setChildPronunciation(child.id, value, approve)
      setEditing(false)
      onChanged()
      toast(done)
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const value = draft.trim().replace(/\s+/g, ' ')
    if (value && !checkSpeech(value)) return setError('Use letters, spaces and hyphens only, like Aa-raadh-ya Sharma.')
    void save(value, true, value ? `The gate will say ${child.full_name.split(' ')[0]}'s name as you wrote it.` : `The gate will say ${child.full_name} as registered.`)
  }

  async function retry() {
    setBusy(true)
    try {
      await retryChildVoice(child.id)
      onChanged()
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  const status = row?.audio_status ?? 'pending'
  const stateFor = (what: 'saved' | 'draft'): SpeakState => (playing?.what === what ? playing.state : 'idle')

  return (
    <section className="card grid gap-4 rounded-2xl p-5" aria-labelledby="say-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="say-h" className="kicker">How the gate says the name</h3>
        {row?.approved
          ? <Pill tone="live" icon={<CircleCheck />}>Approved</Pill>
          : <Pill tone="warning">Needs a listen</Pill>}
      </div>

      <div className="flex items-center gap-4">
        <SpeakButton name={child.full_name} state={stateFor('saved')} disabled={busy || playing?.what === 'draft'} onPlay={() => void play('saved')} onStop={stop} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-h3">{child.full_name}</p>
          <p className="truncate text-small font-semibold text-ink-2">{spoken ? <>Said as <b className="text-ink">{spoken}</b></> : 'Said as registered'}</p>
        </div>
      </div>

      <p className="text-small font-semibold text-ink-2" aria-live="polite">
        {status === 'ready' ? 'Ready: announcements with this name play at once.'
          : status === 'failed' ? null
          : 'Getting the announcements ready. This happens in the background.'}
      </p>
      {status === 'failed' && (
        <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex-1 basis-[200px]">The announcements couldn't be made. The gate still announces this child with the tablet's own voice.</span>
            <Button size="md" variant="secondary" icon={<RotateCcw />} loading={busy} onClick={() => void retry()}>Try again</Button>
          </span>
        </Notice>
      )}

      {editing ? (
        <form noValidate onSubmit={submit} className="grid gap-3 rounded-xl bg-sunken p-4">
          <label className="grid gap-1.5">
            <span className="text-h4">Write it the way it sounds</span>
            <span className="text-small font-semibold text-ink-2">Split it with hyphens where you'd pause, like Aa-raadh-ya. Leave it empty to say it as registered.</span>
            <span className="input mt-1"><input ref={input} value={draft} placeholder={child.full_name} maxLength={120} spellCheck={false} autoComplete="off"
              aria-invalid={!!error || undefined} onChange={(e) => { setDraft(e.target.value); setError(null) }} /></span>
          </label>
          <div className="flex flex-wrap items-center gap-2.5">
            <SpeakButton name={draft.trim() || child.full_name} state={stateFor('draft')} disabled={busy || playing?.what === 'saved'} onPlay={() => void play('draft')} onStop={stop} />
            <span className="mr-auto text-small font-semibold text-ink-2">Preview</span>
            <Button size="md" variant="quiet" onClick={() => { setEditing(false); setDraft(spoken ?? ''); setError(null) }}>Cancel</Button>
            <Button type="submit" size="md" icon={<CircleCheck />} loading={busy}>Save and approve</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {!row?.approved && <Button size="md" variant="success" icon={<CircleCheck />} loading={busy} onClick={() => void save(spoken ?? '', true, 'Approved. The gate will say it just like that.')}>Sounds right</Button>}
          <Button size="md" variant="secondary" icon={<PencilLine />} onClick={() => { setDraft(spoken ?? ''); setEditing(true) }}>{spoken ? 'Change' : 'Sounds wrong? Change how it’s said'}</Button>
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}
