import { useEffect, useState, type ReactNode } from 'react'
import { Baby, Check, Clock, FileSpreadsheet, GraduationCap, Lock, TriangleAlert } from '../../ui/icons'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { SelectField } from '../../ui/Field'
import { Pill } from '../../ui/Pill'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { ErrorState, Notice, SkeletonList } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { useToast } from '../../ui/Toast'
import { childColor } from '../../ui/childColor'
import { formatTime, toMinutes, type Minutes } from '../../domain/time'
import { windowFor } from '../../domain/programme'
import { AreaShell } from '../auth/AreaShell'
import { explainDbError, loadDirectory, type Child, type Directory, type ProgrammeRow } from '../admin/api'
import { levelOf, planInfo } from '../admin/programmeCatalogue'
import { levelIcon } from '../admin/ProgrammePicker'
import { formatRange, programmeOf } from '../trips/rules'
import { setRegularTimes } from './api'
import { ProgrammeSheet } from './ProgrammeSheet'
import { BulkImportSheet } from '../admin/BulkImportSheet'
import { useAfterImport } from '../admin/importJob'

const m = (t?: string | null) => (t ? toMinutes(t.slice(0, 5)) : 0)
const hhmm = (x: Minutes) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
const locked = (p: ProgrammeRow) => p.name.startsWith('Learning Center')

function RegularSheet({ c, p, current, onClose, onSaved }: { c: Child; p: ProgrammeRow; current: { dropoff: string; pickup: string } | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const programme = programmeOf(p)
  const opts = (d: 'dropoff' | 'pickup') => { const w = windowFor(programme, d); const step = w.to - w.from > 60 ? 15 : 5; return Array.from({ length: Math.floor((w.to - w.from) / step) + 1 }, (_, i) => w.from + i * step) }
  const first = c.preferred_name ?? c.full_name.split(' ')[0]!
  const [drop, setDrop] = useState<Minutes>(current ? m(current.dropoff) : opts('dropoff')[0]!)
  const [pick, setPick] = useState<Minutes>(current ? m(current.pickup) : opts('pickup')[0]!)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const withCurrent = (list: Minutes[], cur: Minutes) => (list.includes(cur) ? list : [cur, ...list])
  const bad = !opts('dropoff').includes(drop) || !opts('pickup').includes(pick)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await setRegularTimes(c.id, hhmm(drop), hhmm(pick))
      toast(`${first}'s regular times are saved.`)
      onSaved()
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={`${first}'s regular times`} description={`Every day ${p.name} runs.`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label={`Drop-off, ${formatRange(windowFor(programme, 'dropoff'))}`} value={drop} onChange={(e) => setDrop(Number(e.target.value))}>
          {withCurrent(opts('dropoff'), drop).map((t) => <option key={t} value={t}>{formatTime(t)}{opts('dropoff').includes(t) ? '' : ' (outside the window)'}</option>)}
        </SelectField>
        <SelectField label={`Pickup, ${formatRange(windowFor(programme, 'pickup'))}`} value={pick} onChange={(e) => setPick(Number(e.target.value))}>
          {withCurrent(opts('pickup'), pick).map((t) => <option key={t} value={t}>{formatTime(t)}{opts('pickup').includes(t) ? '' : ' (outside the window)'}</option>)}
        </SelectField>
      </div>
      <Notice tone={bad ? 'warning' : 'success'} className="mt-4">{bad ? 'Regular times must be inside the windows. Parents can still ask for a different time on a given day.' : 'Both times are inside the windows.'}</Notice>
      {error && <Notice tone="danger" className="mt-4">{error}</Notice>}
      <SheetFooter>
        <Button size="xl" className="w-full" icon={<Check />} loading={busy} disabled={bad || (!!current && drop === m(current.dropoff) && pick === m(current.pickup))} onClick={() => void save()}>Save regular times</Button>
      </SheetFooter>
    </Sheet>
  )
}

const days = (p: ProgrammeRow) => ((p.weekdays ?? []).includes(6) ? (p.saturday_rule === 'except_2nd_and_last' ? 'Mon to Sat¹' : 'Mon to Sat') : 'Mon to Fri')

/**
 * The core team's Schedules (Screen Book v3): each programme's hours and drop-off and pickup windows (D35), and each
 * child's regular times. Changes reach parents, the gate and the admin's picker at once.
 */
export function Schedules() {
  const toast = useToast()
  const [bulk, setBulk] = useState(false)
  const [dir, setDir] = useState<Directory | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<'programmes' | 'children'>('programmes')
  const [editing, setEditing] = useState<null | { programme: ProgrammeRow } | { child: Child }>(null)
  const load = () => { setError(false); void loadDirectory().then(setDir, () => setError(true)) }
  useAfterImport(() => { load(); setTab('children') })
  useEffect(load, [])
  const saved = () => { setEditing(null); load() }

  const rule = (
    <div className="card flex items-start gap-3 rounded-xl p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent [&_svg]:size-5" aria-hidden><Clock /></span>
      <div>
        <p className="text-h4">Each programme has its own drop-off and pickup times.</p>
        <p className="text-small font-semibold text-ink-2">Timings start at 15 minutes either side of class. Change them as needed.</p>
      </div>
    </div>
  )
  const kv = (label: string, v: ReactNode) => <span className="grid"><span className="kicker">{label}</span><span className="text-h4 tabular-nums">{v}</span></span>

  return (
    <AreaShell area="core" title="Schedules" subtitle="Programme hours and each child's regular times."
      actions={<Button variant="secondary" icon={<FileSpreadsheet />} onClick={() => setBulk(true)}>Bulk upload children</Button>}>
      <div className="mt-6 grid gap-4">
        <Tabs id="sched" label="Schedules" value={tab} onChange={setTab} items={[{ key: 'programmes', label: 'Programmes', icon: <GraduationCap /> }, { key: 'children', label: "Children's times", icon: <Baby /> }]} />
        {rule}
        <section id="sched-panel" role="tabpanel" aria-labelledby={`sched-${tab}`} className="grid gap-5">
          {error ? <ErrorState title="Couldn't load the schedules" onRetry={load}>Check your connection and try again.</ErrorState>
            : !dir ? <SkeletonList count={6} className="grid gap-3" height="h-[72px]" />
            : tab === 'programmes' ? (
              <>
                {dir.classes.filter((c) => c.active).map((cls) => {
                  const list = dir.programmes.filter((p) => p.class_id === cls.id)
                  if (!list.length) return null
                  const level = levelOf(list[0]!).level
                  return (
                    <div key={cls.id} className="grid gap-2.5">
                      <h2 className="kicker flex items-center gap-2 [&_svg]:size-4"><span className="text-accent" aria-hidden>{levelIcon(level)}</span>{cls.name}</h2>
                      <ul className="grid gap-2.5">
                        {list.map((p) => {
                          const prog = programmeOf(p)
                          return (
                            <li key={p.id} className="card grid grid-cols-2 items-center gap-x-6 gap-y-3 rounded-xl p-4 sm:grid-cols-[minmax(0,1fr)_repeat(3,auto)_auto]">
                              <span className="col-span-2 min-w-0 sm:col-span-1">
                                <span className="block text-h4">{planInfo(levelOf(p).plan ?? '').title || p.name}</span>
                                <span className="block text-small font-semibold text-ink-2">{days(p)}, {p.term_start ? 'June to March' : 'all year'}</span>
                              </span>
                              {kv(p.extended ? 'In school' : 'Hours', `${formatTime(m(p.starts))}–${formatTime(m(p.ends))}`)}
                              {kv('Drop-off', formatRange(windowFor(prog, 'dropoff')))}
                              {kv('Pickup', formatRange(windowFor(prog, 'pickup')))}
                              <span className="justify-self-end">{locked(p) ? <Pill icon={<Lock />}>School rule</Pill> : <Button size="md" variant="secondary" onClick={() => setEditing({ programme: p })}>Edit</Button>}</span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
                <p className="text-caption font-semibold text-ink-3">¹ Except the 2nd and last Saturday of the month.</p>
              </>
            ) : (
              <ul className="grid gap-2.5 lg:grid-cols-2">
                {dir.children.filter((c) => c.active).map((c) => {
                  const p = dir.programmes.find((x) => x.id === c.programme_id)
                  const s = dir.schedules.find((x) => x.child_id === c.id) ?? null
                  const prog = p ? programmeOf(p) : null
                  const out = !!(s && prog && (m(s.dropoff) < windowFor(prog, 'dropoff').from || m(s.dropoff) > windowFor(prog, 'dropoff').to || m(s.pickup) < windowFor(prog, 'pickup').from || m(s.pickup) > windowFor(prog, 'pickup').to))
                  return (
                    <li key={c.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl p-3.5">
                      <Avatar name={c.preferred_name ?? c.full_name} color={childColor(c.id)} />
                      <span className="min-w-0 flex-1 basis-[150px]">
                        <span className="block truncate text-h4">{c.full_name}</span>
                        <span className="block truncate text-small font-semibold text-ink-2">{p?.name}</span>
                      </span>
                      {out && <Pill tone="warning" icon={<TriangleAlert />}>Outside the window</Pill>}
                      {s ? <>{kv('Drop-off', formatTime(m(s.dropoff)))}{kv('Pickup', formatTime(m(s.pickup)))}</> : <span className="text-small font-semibold text-ink-3">Not set: the window's start</span>}
                      {p && <Button size="md" variant="secondary" onClick={() => setEditing({ child: c })}>Edit</Button>}
                    </li>
                  )
                })}
              </ul>
            )}
        </section>
      </div>
      {dir && editing && 'programme' in editing && (
        <ProgrammeSheet programme={editing.programme} cls={dir.classes.find((c) => c.id === editing.programme.class_id)!} dir={dir} admin={false}
          onClose={() => setEditing(null)} onSaved={(msg) => { toast(msg); saved() }} />
      )}
      {dir && editing && 'child' in editing && (() => {
        const p = dir.programmes.find((x) => x.id === editing.child.programme_id)!
        return <RegularSheet c={editing.child} p={p} current={dir.schedules.find((x) => x.child_id === editing.child.id) ?? null} onClose={() => setEditing(null)} onSaved={saved} />
      })()}
      {dir && bulk && <BulkImportSheet programmes={dir.programmes} onClose={() => setBulk(false)} />}
    </AreaShell>
  )
}
