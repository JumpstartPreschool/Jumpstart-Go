import { useState, type FormEvent } from 'react'
import { Check, Pencil, Plus } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/Field'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { EmptyState, Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatTime, toMinutes } from '../../domain/time'
import { windowFor } from '../../domain/programme'
import { addClass } from '../school/api'
import { ProgrammeSheet } from '../school/ProgrammeSheet'
import { formatRange, programmeOf } from '../trips/rules'
import { explainDbError, type ClassRow, type Directory, type ProgrammeRow } from './api'
import { levelOf, planInfo, planRank } from './programmeCatalogue'

const m = (t: string) => toMinutes(t.slice(0, 5))
const days = (p: ProgrammeRow) => ((p.weekdays ?? []).includes(6) ? (p.saturday_rule === 'except_2nd_and_last' ? 'Mon to Sat, not the 2nd or last Sat' : 'Mon to Sat') : 'Mon to Fri')

/** The admin names a new class (D35); its programmes are added next, from the class. */
export function AddClassSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clean = name.trim()
  const invalid = clean.includes('·') ? 'Leave out "·".' : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!clean || invalid) return
    setBusy(true)
    setError(null)
    try {
      onAdded((await addClass(clean)).id)
    } catch (err) {
      setError(explainDbError(err as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title="Add a class" description="A level, like Playgroup, or a programme of its own, like the Learning Center. Its programmes and timings come next.">
      <form onSubmit={(e) => void submit(e)}>
        <TextField label="Class name" value={name} maxLength={60} autoFocus required onChange={(e) => setName(e.target.value)} placeholder="Toddlers" error={invalid ?? error} />
        <SheetFooter>
          <Button type="submit" size="xl" className="w-full" icon={<Check />} loading={busy} disabled={!clean || !!invalid}>Add the class</Button>
        </SheetFooter>
      </form>
    </Sheet>
  )
}

/**
 * A class's programmes with their hours, drop-off and pickup (D35). The admin edits any of them, including the
 * Learning Center, and adds programmes; children then join one from their record.
 */
export function ClassSheet({ cls, dir, onClose, onChanged }: { cls: ClassRow; dir: Directory; onClose: () => void; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const [editing, setEditing] = useState<null | { programme: ProgrammeRow | null }>(null)
  const list = dir.programmes.filter((p) => p.class_id === cls.id).sort((a, b) => planRank(levelOf(a).plan) - planRank(levelOf(b).plan))
  const children = dir.children.filter((c) => c.active && c.class_id === cls.id).length
  const kv = (label: string, v: string) => <span className="grid"><span className="kicker">{label}</span><span className="text-h4 tabular-nums">{v}</span></span>

  return (
    <>
      <Sheet open onClose={onClose} wide title={cls.name}
        description={`${children} ${children === 1 ? 'child' : 'children'}. Parents, the gate and the programme picker use these times.`}>
        {list.length === 0 ? (
          <EmptyState title="No programmes yet" action={<Button icon={<Plus />} onClick={() => setEditing({ programme: null })}>Add a programme</Button>}>
            Add one with its days and times, so children can join {cls.name}.
          </EmptyState>
        ) : (
          <ul className="grid gap-2.5">
            {list.map((p) => {
              const prog = programmeOf(p)
              const kids = dir.children.filter((c) => c.active && c.programme_id === p.id).length
              return (
                <li key={p.id} className="card grid gap-3 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-h4">{planInfo(levelOf(p).plan ?? '').title || p.name}</span>
                      <span className="block text-small font-semibold text-ink-2">{days(p)} · {kids} {kids === 1 ? 'child' : 'children'}</span>
                    </span>
                    <Button size="md" variant="secondary" className="shrink-0" icon={<Pencil />} aria-label={`Edit ${p.name}`} onClick={() => setEditing({ programme: p })}>Edit</Button>
                  </div>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg bg-sunken p-3 min-[440px]:grid-cols-3">
                    {kv(p.extended ? 'In school' : 'Hours', `${formatTime(m(p.starts))}–${formatTime(m(p.ends))}`)}
                    {kv('Drop-off', formatRange(windowFor(prog, 'dropoff')))}
                    {kv('Pickup', formatRange(windowFor(prog, 'pickup')))}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {list.length > 0 && (
          <>
            <Notice className="mt-4">A child's regular times must sit inside their programme's drop-off and pickup. Parents can still ask for another time on a given day.</Notice>
            <SheetFooter>
              <Button size="xl" variant="secondary" className="w-full" icon={<Plus />} onClick={() => setEditing({ programme: null })}>Add a programme to {cls.name}</Button>
            </SheetFooter>
          </>
        )}
      </Sheet>
      {editing && (
        <ProgrammeSheet programme={editing.programme} cls={cls} dir={dir} admin
          onClose={() => setEditing(null)}
          onSaved={(msg) => void onChanged().then(() => { setEditing(null); toast(msg) })} />
      )}
    </>
  )
}
