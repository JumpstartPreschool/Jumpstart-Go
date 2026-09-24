import { useCallback, useEffect, useMemo, useState } from 'react'
import { BellRing, Check, Plus, RotateCcw, Search, TriangleAlert, UserMinus } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { childColor } from '../../ui/childColor'
import { formatIndianMobile } from '../../domain/contact'
import { AREA_LABEL, AreaShell } from '../auth/AreaShell'
import { useSession, type Area } from '../auth/session'
import { explainDbError, type ClassRow, type Profile } from '../admin/api'
import { Avatar, Empty, Row } from '../admin/AdminPeople'
import { loadCoordinators, removeCoordinator, setCoordinator, type CoordinatorData } from './api'

const contact = (p: Profile) => [p.email, p.phone && formatIndianMobile(p.phone)].filter(Boolean).join(' · ') || 'No contact details'
const Tag = ({ children, tone = 'plain' }: { children: string; tone?: 'plain' | 'flag' }) => (
  <span className={`rounded-full px-2.5 py-1 text-[12px] font-extrabold ${tone === 'flag' ? 'bg-flag-soft text-flag' : 'bg-sunken text-ink-2'}`}>{children}</span>
)

/** Multi-select class chips. */
function ClassPicker({ classes, value, onChange }: { classes: ClassRow[]; value: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2.5" role="group" aria-label="Classes">
      {classes.map((c) => {
        const on = value.includes(c.id)
        return (
          <button key={c.id} type="button" role="checkbox" aria-checked={on}
            onClick={() => onChange(on ? value.filter((id) => id !== c.id) : [...value, c.id])}
            className={`flex h-12 items-center gap-2 rounded-full px-5 text-[16px] font-extrabold transition-transform duration-200 ease-spring active:scale-95 motion-reduce:active:scale-100 ${
              on ? 'bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[var(--accent-glow)]' : 'card'
            }`}>
            {on ? <Check className="size-4" aria-hidden /> : <span className="size-2.5 rounded-full" style={{ background: childColor(c.id) }} aria-hidden />}
            {c.name}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Who works the gate, and which classes each coordinator hears (PRD D11, D23). Open to the core team and the admin;
 * the database allows the core team to give or remove only the Coordinator role.
 */
export function CoordinatorsPage({ area }: { area: Extract<Area, 'admin' | 'core'> }) {
  const { state } = useSession()
  const myId = state.status === 'signed-in' ? state.me?.profile_id : undefined
  const [data, setData] = useState<CoordinatorData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [adding, setAdding] = useState(false)

  const reload = useCallback(async () => {
    setLoadError(null)
    try {
      setData(await loadCoordinators())
    } catch (e) {
      setLoadError(explainDbError(e as { code?: string }))
    }
  }, [])
  useEffect(() => { void reload() }, [reload])

  const coordinators = useMemo(() => data?.people.filter((p) => data.roles.get(p.id)?.includes('coordinator')) ?? [], [data])
  const classesOf = (id: string) => data?.classes.filter((c) => data.assignments.get(id)?.includes(c.id)) ?? []
  const coordinatorsOf = (classId: string) => coordinators.filter((p) => p.active && data?.assignments.get(p.id)?.includes(classId))

  return (
    <AreaShell area={area} title="Coordinators">
      <p className="mt-1 max-w-[720px] px-1 text-[16px] font-semibold leading-6 text-ink-2">
        Choose who works the gate and which classes they look after. A pickup or drop-off is announced on the iPads of that class's coordinators. If none of them is on duty, it goes to every coordinator on duty.
      </p>

      {loadError ? (
        <div className="card mt-5 rounded-[30px] p-6 text-center">
          <p className="text-[16px] font-bold text-danger">{loadError}</p>
          <Button className="mt-4" variant="secondary" icon={<RotateCcw />} onClick={() => void reload()}>Try again</Button>
        </div>
      ) : !data ? (
        <ul className="mt-5 grid gap-3 md:grid-cols-2" aria-label="Loading">{[0, 1, 2, 3].map((i) => <li key={i} className="card h-[86px] animate-pulse rounded-[26px]" />)}</ul>
      ) : (
        <>
          <section className="mt-6" aria-labelledby="classes-title">
            <h2 id="classes-title" className="px-1 text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-2">Classes</h2>
            {data.classes.length === 0 ? (
              <p className="card mt-2 rounded-[24px] p-5 text-[15px] font-semibold text-ink-2">No class groups yet. The admin adds them in People → Classes.</p>
            ) : (
              <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.classes.map((c) => {
                  const who = coordinatorsOf(c.id)
                  return (
                    <li key={c.id} className="card flex items-center gap-3 rounded-[24px] p-3.5">
                      <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: childColor(c.id) }} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-[18px] font-bold leading-6">{c.name}</p>
                        {who.length ? (
                          <p className="truncate text-[14px] font-semibold text-ink-2">{who.map((p) => p.full_name.split(' ')[0]).join(', ')}</p>
                        ) : (
                          <p className="flex items-center gap-1.5 text-[14px] font-bold text-flag"><TriangleAlert className="size-4 shrink-0" aria-hidden />No coordinator: goes to everyone on duty</p>
                        )}
                      </div>
                      {who.length > 0 && <span className="rounded-full bg-sunken px-2.5 py-1 text-[13px] font-extrabold tabular-nums text-ink-2">{who.length}</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="mt-8" aria-labelledby="coordinators-title">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 id="coordinators-title" className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-2">Coordinators · {coordinators.length}</h2>
              <Button icon={<Plus />} onClick={() => setAdding(true)}>Add coordinator</Button>
            </div>
            {coordinators.length === 0 ? (
              <div className="mt-3"><Empty>No coordinators yet. Add the people who work the gate, and choose their classes.</Empty></div>
            ) : (
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {coordinators.map((p) => {
                  const classes = classesOf(p.id)
                  return (
                    <Row key={p.id} avatar={<Avatar name={p.full_name} color={childColor(p.id)} />} title={p.id === myId ? `${p.full_name} (you)` : p.full_name}
                      detail={contact(p)}
                      badges={<>
                        {!p.active && <Tag tone="flag">Access off</Tag>}
                        {classes.length ? classes.map((c) => <Tag key={c.id}>{c.name}</Tag>) : <Tag tone="flag">No classes yet</Tag>}
                      </>}
                      action={<Button size="md" variant="secondary" onClick={() => setEditing(p)}>Edit</Button>} />
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing.full_name.split(' ')[0]}'s classes` : 'Classes'}>
        {editing && data && (
          <EditCoordinator key={editing.id} person={editing} classes={data.classes} initial={data.assignments.get(editing.id) ?? []}
            onDone={() => { setEditing(null); void reload() }} />
        )}
      </Sheet>
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a coordinator">
        {adding && data && <AddCoordinator data={data} area={area} onDone={() => { setAdding(false); void reload() }} />}
      </Sheet>
    </AreaShell>
  )
}

function useSave() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(action: () => Promise<void>, onDone: () => void) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onDone()
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function EditCoordinator({ person, classes, initial, onDone }: { person: Profile; classes: ClassRow[]; initial: string[]; onDone: () => void }) {
  const [picked, setPicked] = useState(initial)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const save = useSave()
  const unchanged = picked.length === initial.length && picked.every((id) => initial.includes(id))
  return (
    <>
      <p className="text-[15px] font-semibold leading-[22px] text-ink-2">
        {person.full_name} hears pickups and drop-offs for these classes while on duty.
      </p>
      <div className="mt-4">{classes.length ? <ClassPicker classes={classes} value={picked} onChange={setPicked} /> : <p className="text-[15px] font-semibold text-ink-2">No class groups yet.</p>}</div>
      {picked.length === 0 && <p className="mt-3 flex items-center gap-2 text-[14px] font-bold text-ink-2"><BellRing className="size-4 text-rb-orange" aria-hidden />With no classes, they hear only requests nobody else has answered.</p>}
      {save.error && <p className="mt-3 text-[15px] font-bold text-danger" role="alert">{save.error}</p>}
      <Button size="xl" className="mt-6 w-full" icon={<Check />} loading={save.busy && !confirmRemove} disabled={unchanged}
        onClick={() => void save.run(() => setCoordinator(person.id, picked), onDone)}>
        Save classes
      </Button>

      <div className="mt-6 border-t border-line pt-5">
        {confirmRemove ? (
          <>
            <p className="text-[15px] font-bold leading-[22px] text-ink">Remove {person.full_name.split(' ')[0]} as a coordinator? They stop hearing announcements and can no longer run the gate. Their other roles stay.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmRemove(false)}>Keep</Button>
              <Button variant="danger" icon={<UserMinus />} loading={save.busy} onClick={() => void save.run(() => removeCoordinator(person.id), onDone)}>Remove</Button>
            </div>
          </>
        ) : (
          <Button variant="quiet" className="w-full" icon={<UserMinus />} onClick={() => setConfirmRemove(true)}>Remove Coordinator role</Button>
        )}
      </div>
    </>
  )
}

function AddCoordinator({ data, area, onDone }: { data: CoordinatorData; area: 'admin' | 'core'; onDone: () => void }) {
  const [query, setQuery] = useState('')
  const [person, setPerson] = useState<Profile | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const save = useSave()

  const q = query.trim().toLowerCase()
  const candidates = data.people
    .filter((p) => p.active && !data.roles.get(p.id)?.includes('coordinator'))
    .filter((p) => !q || [p.full_name, p.email, p.phone].some((v) => v?.toLowerCase().includes(q)))
    // Staff first: they are the usual choice; parents are listed after them.
    .sort((a, b) => Number(!data.roles.get(a.id)?.length) - Number(!data.roles.get(b.id)?.length))

  if (person) {
    const isParent = data.parentIds.has(person.id)
    return (
      <>
        <div className="card flex items-center gap-3 rounded-[22px] p-3">
          <Avatar name={person.full_name} color={childColor(person.id)} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[18px] font-bold">{person.full_name}</p>
            <p className="truncate text-[14px] font-semibold text-ink-2">{contact(person)}</p>
          </div>
          <Button size="md" variant="quiet" onClick={() => setPerson(null)}>Change</Button>
        </div>
        {isParent && (
          <p className="mt-3 flex gap-2 rounded-[18px] bg-flag-soft px-4 py-3 text-[14px] font-bold leading-5 text-flag">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {person.full_name.split(' ')[0]} is also a parent here. As a coordinator they will see every child's pickup details.
          </p>
        )}
        <p className="mt-5 text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-2">Their classes</p>
        <div className="mt-2">{data.classes.length ? <ClassPicker classes={data.classes} value={picked} onChange={setPicked} /> : <p className="text-[15px] font-semibold text-ink-2">No class groups yet. You can choose classes later.</p>}</div>
        {save.error && <p className="mt-3 text-[15px] font-bold text-danger" role="alert">{save.error}</p>}
        <Button size="xl" className="mt-6 w-full" icon={<Check />} loading={save.busy} onClick={() => void save.run(() => setCoordinator(person.id, picked), onDone)}>
          Make coordinator
        </Button>
      </>
    )
  }

  return (
    <>
      <p className="text-[15px] font-semibold leading-[22px] text-ink-2">
        Choose someone the admin has already added. {area === 'core' && 'The core team can give the Coordinator role; only the admin gives Admin or Core team.'}
      </p>
      <label className="card mt-4 flex h-12 items-center gap-2 rounded-full px-4">
        <Search className="size-5 shrink-0 text-ink-3" aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or phone" aria-label="Search people"
          className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold outline-none placeholder:text-ink-3" />
      </label>
      {candidates.length === 0 ? (
        <p className="mt-4 text-center text-[15px] font-semibold text-ink-2">{q ? 'Nobody matches your search.' : 'Everyone registered is already a coordinator. The admin adds new staff in People.'}</p>
      ) : (
        <ul className="mt-4 grid max-h-[50dvh] gap-2 overflow-y-auto pb-1">
          {candidates.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setPerson(p)}
                className="flex w-full items-center gap-3 rounded-[22px] bg-sunken p-3 text-left transition-transform duration-200 ease-spring active:scale-[0.98] motion-reduce:active:scale-100">
                <Avatar name={p.full_name} color={childColor(p.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[18px] font-bold">{p.full_name}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {(data.roles.get(p.id) ?? []).map((r) => <Tag key={r}>{AREA_LABEL[r]}</Tag>)}
                    {data.parentIds.has(p.id) && <Tag>Parent</Tag>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
