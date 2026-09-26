import { useEffect, useState, type FormEvent } from 'react'
import { AudioLines, Play, Plus, Trash2 } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { ErrorState, Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { audioContext, speak, stopSound } from '../duty/sound'
import { setPronunciations } from '../duty/pronunciation'
import { explainDbError, listPronunciations, setPronunciation, type Pronunciation } from './api'

const title = (w: string) => w.charAt(0).toLocaleUpperCase('en-IN') + w.slice(1)

/**
 * Admin → Settings → Name pronunciation (D43): when the gate voice says a name wrongly, the admin writes how it should
 * sound ("Shreyas" → "Shrey-us"). It applies to that word in every announcement; names on screen never change.
 */
export function PronunciationList() {
  const toast = useToast()
  const [rows, setRows] = useState<Pronunciation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [written, setWritten] = useState('')
  const [spoken, setSpoken] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)

  const load = () => {
    setError(null)
    listPronunciations().then((r) => { setRows(r); setPronunciations(r) }, (e) => setError(explainDbError(e)))
  }
  useEffect(load, [])
  useEffect(() => () => stopSound(), [])

  async function hear(key: string, words: string) {
    stopSound()
    audioContext() // this tap allows sound
    setPlaying(key)
    await speak(words)
    setPlaying((p) => (p === key ? null : p))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const w = written.trim()
    if (!w || /\s/.test(w)) return setFormError('Enter one name, like Shreyas. For a full name, add each part on its own.')
    if (!spoken.trim()) return setFormError('Write how it should sound, like Shrey-us.')
    setBusy('add')
    setFormError(null)
    try {
      await setPronunciation(w, spoken.trim())
      toast(`The gate will say ${title(w.toLowerCase())} as "${spoken.trim()}".`)
      setWritten('')
      setSpoken('')
      load()
    } catch (err) {
      setFormError(explainDbError(err as { code?: string; message?: string }))
    } finally {
      setBusy(null)
    }
  }

  async function remove(w: string) {
    setBusy(w)
    try {
      await setPronunciation(w, '')
      toast(`${title(w)} is said as written again.`)
      load()
    } catch (err) {
      toast(explainDbError(err as { code?: string; message?: string }), { tone: 'danger' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card rounded-2xl p-5 sm:p-6" aria-labelledby="pronunciation-title">
      <h2 id="pronunciation-title" className="text-h3">Name pronunciation</h2>
      <p className="mt-1 text-small font-semibold text-ink-2">If the gate voice says a name wrongly, write how it should sound. Names on screen don't change.</p>

      {error ? <ErrorState title="Couldn't load the list" onRetry={load}>{error}</ErrorState> : (
        <>
          {rows && rows.length > 0 && (
            <ul className="mt-4 grid gap-2">
              {rows.map((r) => (
                <li key={r.written} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-sunken px-4 py-3">
                  <span className="min-w-0 flex-1 text-body"><b className="text-ink">{title(r.written)}</b> <span className="text-ink-2">is said as</span> <b className="text-ink">{r.spoken}</b></span>
                  <Button size="md" variant="quiet" icon={<Play />} aria-label={`Play ${title(r.written)}`} loading={playing === r.written} onClick={() => void hear(r.written, `Please get ${r.spoken} ready for pickup.`)} />
                  <Button size="md" variant="quiet" icon={<Trash2 />} aria-label={`Remove ${title(r.written)}`} loading={busy === r.written} onClick={() => void remove(r.written)} />
                </li>
              ))}
            </ul>
          )}
          <form noValidate onSubmit={(e) => void save(e)} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-center xl:grid-cols-2">
            <label className="input"><AudioLines aria-hidden /><input aria-label="Name as written" placeholder="Shreyas" value={written} autoCapitalize="words" spellCheck={false}
              onChange={(e) => { setWritten(e.target.value); setFormError(null) }} /></label>
            <label className="input"><input aria-label="Say it as" placeholder="Shrey-us" value={spoken} spellCheck={false}
              onChange={(e) => { setSpoken(e.target.value); setFormError(null) }} /></label>
            <Button size="md" variant="secondary" icon={<Play />} disabled={!spoken.trim()} loading={playing === 'draft'} onClick={() => void hear('draft', `Please get ${spoken.trim()} ready for pickup.`)}>Hear it</Button>
            <Button type="submit" size="md" icon={<Plus />} loading={busy === 'add'}>Add</Button>
          </form>
          {formError && <Notice tone="danger" className="mt-2">{formError}</Notice>}
          {rows && rows.length === 0 && <p className="mt-3 text-caption font-semibold text-ink-2">No names yet. Most names are said correctly as written.</p>}
        </>
      )}
    </section>
  )
}
