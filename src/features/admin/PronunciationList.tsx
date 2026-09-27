import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, CircleCheck, TriangleAlert } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { ErrorState, SkeletonList } from '../../ui/States'
import { SpeakButton } from '../../ui/SpeakButton'
import { useToast } from '../../ui/Toast'
import { supabase } from '../../lib/supabase'
import { onTableChange } from '../../lib/live'
import { voiceSentence } from '../../../supabase/functions/_shared/announce.ts'
import { playSentence, stopSound } from '../duty/sound'
import { explainDbError, listChildPronunciations, setChildPronunciation, type ChildPronunciation } from './api'

interface Row extends ChildPronunciation { full_name: string; preferred_name: string | null }

/**
 * Admin → Settings → Name pronunciation (D48): every child whose name nobody has listened to yet, or whose announcements
 * couldn't be made, to play and approve in one place. Changing how a name is said happens on the child's page.
 */
export function PronunciationList() {
  const toast = useToast()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<{ id: string; started: boolean } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    setError(null)
    Promise.all([listChildPronunciations(), supabase.from('children').select('id, full_name, preferred_name').eq('active', true).order('full_name')])
      .then(([voices, kids]) => {
        if (kids.error) throw kids.error
        const byChild = new Map(voices.map((v) => [v.child_id, v]))
        const all = (kids.data ?? []).flatMap((k) => { const v = byChild.get(k.id); return v ? [{ ...v, full_name: k.full_name, preferred_name: k.preferred_name }] : [] })
        setTotal(all.length)
        setRows(all.filter((r) => !r.approved || r.audio_status === 'failed'))
      })
      .catch((e: { code?: string; message?: string }) => setError(explainDbError(e)))
  }
  useEffect(load, [])
  useEffect(() => onTableChange('child_pronunciations', load), [])
  useEffect(() => () => stopSound(), [])

  async function play(r: Row) {
    setPlaying({ id: r.child_id, started: false })
    try {
      const sentence = voiceSentence(`${r.full_name}.`, { fullName: r.full_name, name: r.preferred_name ?? r.full_name.split(' ')[0]!, spoken: r.spoken_name })
      await playSentence(sentence, () => setPlaying({ id: r.child_id, started: true }))
    } catch {
      toast("Couldn't play the name. The school's voice computer may be off; try again in a minute.", { tone: 'danger' })
    } finally {
      setPlaying(null)
    }
  }

  async function approve(r: Row) {
    setBusy(r.child_id)
    try {
      await setChildPronunciation(r.child_id, r.spoken_name ?? '', true)
      toast(`Approved: ${r.full_name}.`)
    } catch (e) {
      toast(explainDbError(e as { code?: string; message?: string }), { tone: 'danger' })
    } finally {
      setBusy(null)
    }
  }

  const waiting = rows?.length ?? 0
  return (
    <section className="card rounded-2xl p-5 sm:p-6" aria-labelledby="pronunciation-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pronunciation-title" className="text-h3">Name pronunciation</h2>
        {rows && (waiting ? <Pill tone="warning">{waiting} to listen to</Pill> : <Pill tone="live" icon={<CircleCheck />}>All {total} approved</Pill>)}
      </div>
      <p className="mt-1 text-small font-semibold text-ink-2">Play each name and approve it if it sounds right. If it doesn't, open the child and write it the way it sounds. Names on screen never change.</p>

      {error ? <ErrorState title="Couldn't load the names" onRetry={load}>{error}</ErrorState>
        : !rows ? <SkeletonList count={3} height="h-[72px]" className="mt-4 grid gap-2" />
        : waiting === 0 ? <p className="mt-4 text-body font-semibold text-ink-2">Every child's name has been listened to and approved.</p>
        : (
          <ul className="mt-4 grid gap-2">
            {rows.map((r) => (
              <li key={r.child_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-sunken py-2.5 pl-2.5 pr-3">
                <SpeakButton name={r.full_name} state={playing?.id === r.child_id ? (playing.started ? 'playing' : 'loading') : 'idle'}
                  disabled={!!playing && playing.id !== r.child_id} onPlay={() => void play(r)} onStop={() => { stopSound(); setPlaying(null) }} />
                <span className="min-w-0 flex-1 basis-[160px]">
                  <span className="block truncate text-h4">{r.full_name}</span>
                  <span className="flex items-center gap-1.5 truncate text-small font-semibold text-ink-2">
                    {r.audio_status === 'failed' ? <><TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />Announcements couldn't be made</>
                      : r.spoken_name ? <>Said as <b className="text-ink">{r.spoken_name}</b></> : 'Said as registered'}
                  </span>
                </span>
                {!r.approved && <Button size="md" variant="secondary" icon={<CircleCheck />} loading={busy === r.child_id} onClick={() => void approve(r)}>Sounds right</Button>}
                <Link to={`/admin/child/${r.child_id}`} className="iconbtn" aria-label={`Change how ${r.full_name} is said`}><ChevronRight /></Link>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}
