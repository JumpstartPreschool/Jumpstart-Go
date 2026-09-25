import { useEffect, useState } from 'react'
import { Megaphone, Send, Users } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/Field'
import { EmptyState, ErrorState, Notice, SkeletonList } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { supabase } from '../../lib/supabase'
import { AreaShell } from '../auth/AreaShell'
import type { Area } from '../auth/session'
import { explainDbError, type ClassRow } from '../admin/api'
import { clockTime } from '../trips/rules'
import { announcementStats, recipientCount, sendAnnouncement, useLive, type Announcement } from './api'

/**
 * Announcements (Screen Book v3): instant, with no approval step, to all parents or one class. The sent list shows how
 * many of the parents it reached have read each one.
 */
export function Announce({ area }: { area: Area }) {
  const toast = useToast()
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [to, setTo] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const sent = useLive<Announcement>(['announcements', 'announcement_reads'], () => supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(50), [])
  const [stats, setStats] = useState<Map<string, { recipients: number; reads: number }>>(new Map())

  useEffect(() => { void supabase.from('classes').select('id, name, active, sort').eq('active', true).order('sort').then(({ data }) => setClasses((data ?? []) as ClassRow[])) }, [])
  useEffect(() => { setCount(null); void recipientCount(to).then(setCount, () => setCount(null)) }, [to])
  useEffect(() => { void announcementStats().then((s) => setStats(new Map(s.map((x) => [x.announcement_id, x]))), () => {}) }, [sent.rows])

  async function send() {
    const e: Record<string, string> = {}
    if (title.trim().length < 3) e.title = 'Add a short title.'
    if (body.trim().length < 5) e.body = 'Write the message.'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      await sendAnnouncement(title.trim(), body.trim(), to)
      toast(`Sent to ${count ?? 'the'} ${count === 1 ? 'parent' : 'parents'}.`)
      setTitle('')
      setBody('')
      await sent.reload()
    } catch (err) {
      toast(explainDbError(err as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  const className = (id: string | null) => (id ? classes.find((c) => c.id === id)?.name ?? 'a class' : 'All')
  return (
    <AreaShell area={area} title="Announcements" subtitle="Parents get it on their phones straight away. There is no approval step.">
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form className="card grid gap-4 rounded-2xl p-5 sm:p-6" onSubmit={(e) => { e.preventDefault(); void send() }} noValidate>
          <fieldset>
            <legend className="mb-2 px-0.5 text-small font-bold text-ink-2">To</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Who it goes to">
              {[null, ...classes.map((c) => c.id)].map((id) => (
                <button key={id ?? 'all'} type="button" role="radio" aria-checked={to === id} onClick={() => setTo(id)} className="choice flex h-11 items-center gap-1.5 px-4 text-small font-bold [&_svg]:size-4">
                  {id === null && <Users aria-hidden />}{id === null ? 'All parents' : className(id)}
                </button>
              ))}
            </div>
          </fieldset>
          <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="For example, Early closing on Friday" error={errors.title} />
          <div className="grid gap-1.5">
            <label htmlFor="ann-body" className="px-0.5 text-small font-bold text-ink-2">Message</label>
            <div className="input h-auto py-2.5"><textarea id="ann-body" rows={4} maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What parents need to know, in a sentence or two" aria-invalid={!!errors.body || undefined} className="min-h-[96px] w-full resize-y bg-transparent outline-none" /></div>
            {errors.body ? <p className="px-0.5 text-small font-bold text-danger" role="alert">{errors.body}</p> : <p className="px-0.5 text-caption font-semibold text-ink-2">{300 - body.length} characters left.</p>}
          </div>
          <Button type="submit" size="xl" icon={<Send />} loading={busy}>{count === null ? 'Send' : `Send to ${count} ${count === 1 ? 'parent' : 'parents'}`}</Button>
          {count === 0 && <Notice tone="warning">Nobody with the app is in {to ? className(to) : 'the school'} yet, so nobody would get this.</Notice>}
        </form>

        <section aria-labelledby="sent-h" className="grid gap-3">
          <h2 id="sent-h" className="kicker flex items-center gap-2 [&_svg]:size-4"><Megaphone aria-hidden />Sent</h2>
          {sent.error ? <ErrorState title="Couldn't load the announcements" onRetry={() => void sent.reload()}>Check your connection and try again.</ErrorState>
            : !sent.rows ? <SkeletonList count={3} className="grid gap-3" />
            : sent.rows.length === 0 ? <EmptyState title="Nothing sent yet">Announcements you send appear here, with how many parents have read them.</EmptyState>
            : sent.rows.map((a) => {
              const s = stats.get(a.id)
              const pct = s && s.recipients ? Math.round((Math.min(s.reads, s.recipients) / s.recipients) * 100) : 0
              return (
                <article key={a.id} className="card grid gap-2 rounded-xl p-4">
                  <div className="flex items-baseline justify-between gap-3"><h3 className="text-h4">{a.title}</h3><span className="shrink-0 text-caption font-bold text-ink-2 tabular-nums">{clockTime(a.created_at)}</span></div>
                  <p className="text-small font-semibold text-ink-2">{a.body}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-caption font-semibold text-ink-2">
                    <span>{a.class_id ? `${className(a.class_id)} parents` : 'All parents'}, from {a.sender_name.split(' ')[0]}, {a.sender_role}</span>
                    {s && <span><b className="text-ink">{Math.min(s.reads, s.recipients)}</b> of {s.recipients} read</span>}
                  </div>
                  {s && <div className="h-1.5 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${pct}% read`}><div className="h-full origin-left rounded-full bg-live" style={{ transform: `scaleX(${pct / 100})` }} /></div>}
                </article>
              )
            })}
        </section>
      </div>
    </AreaShell>
  )
}
