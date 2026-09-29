import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BellRing, Check, ChevronRight, Plus, School, TriangleAlert, UserMinus, UserPlus, UsersRound } from '../../ui/icons'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { SearchField } from '../../ui/Field'
import { ListRow } from '../../ui/ListRow'
import { Pill } from '../../ui/Pill'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { EmptyState, ErrorState, Notice, SkeletonList } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { childColor } from '../../ui/childColor'
import { formatMobile } from '../../domain/contact'
import { AREA_ICON, AreaShell } from '../auth/AreaShell'
import { ROLE } from '../admin/roles'
import { useSession, type Area } from '../auth/session'
import { explainDbError, loadDirectory, type ClassRow, type Directory, type Profile } from '../admin/api'
import { StaffSheet } from '../admin/StaffSheet'
import { loadCoordinators, removeCoordinator, setCoordinator, type CoordinatorData } from './api'

const contact = (p: Profile) => [p.email, p.phone && formatMobile(p.phone)].filter(Boolean).join(' · ') || 'No contact details'
const firstName = (p: Profile) => p.full_name.split(' ')[0]

/** Multi-select class chips. */
function ClassPicker({ classes, value, onChange }: { classes: ClassRow[]; value: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-3" role="group" aria-label="Classes">
      {classes.map((c) => {
        const on = value.includes(c.id)
        return (
          <button key={c.id} type="button" role="checkbox" aria-checked={on}
            onClick={() => onChange(on ? value.filter((id) => id !== c.id) : [...value, c.id])}
            className="choice flex h-12 items-center gap-2 px-5 text-h4 [&_svg]:size-[18px] [&_svg]:text-ink-3">
            <School aria-hidden />
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
  const toast = useToast()
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
  // Refresh first, so the list already shows the change when the sheet closes and the toast confirms it.
  const done = async (message: string) => { await reload(); setEditing(null); setAdding(false); toast(message) }
  // Someone not at the school yet: the admin's staff form, with Center leader already chosen (only the admin adds people).
  const [newLeader, setNewLeader] = useState<Directory | null>(null)
  // Opens over the Add sheet (Cancel goes back to the list; saving closes both), so two sheets never pass each other.
  async function addNew() {
    try { setNewLeader(await loadDirectory()) } catch (e) { toast(explainDbError(e as { code?: string; message?: string }), { tone: 'danger' }) }
  }

  return (
    <AreaShell area={area} title="Center leaders"
      subtitle="Who works the gate, and which classes they hear."
      actions={data && <Button icon={<Plus />} onClick={() => setAdding(true)}>Add center leader</Button>}>
      {loadError ? (
        <div className="mt-6"><ErrorState title="Couldn't load center leaders" onRetry={() => void reload()}>{loadError}</ErrorState></div>
      ) : !data ? (
        <div className="mt-6"><SkeletonList /></div>
      ) : (
        <>
          <section className="mt-8" aria-labelledby="classes-title">
            <h2 id="classes-title" className="kicker px-0.5">Classes</h2>
            {data.classes.length === 0 ? (
              <Notice className="mt-3">
                No classes yet.{' '}
                {area === 'admin' ? <Link to="/admin" className="font-extrabold text-accent-ink underline underline-offset-2">Add them in People → Classes</Link> : 'The admin adds them in People → Classes.'}
              </Notice>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.classes.map((c) => {
                  const who = coordinatorsOf(c.id)
                  return (
                    <li key={c.id} className="card flex items-center gap-3 rounded-xl p-3.5">
                      <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-sunken text-ink-2 [&_svg]:size-5" aria-hidden><School /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-h4">{c.name}</p>
                        {who.length ? (
                          <p className="truncate text-small font-semibold text-ink-2">{who.map(firstName).join(', ')}</p>
                        ) : (
                          <p className="flex items-center gap-1.5 text-small font-bold text-warning"><TriangleAlert className="size-4 shrink-0" aria-hidden />No center leader: goes to everyone on duty</p>
                        )}
                      </div>
                      {who.length > 0 && <Pill icon={<UsersRound />}>{who.length}</Pill>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="mt-10" aria-labelledby="coordinators-title">
            <h2 id="coordinators-title" className="kicker px-0.5">Center leaders · {coordinators.length}</h2>
            {coordinators.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No center leaders yet" action={<Button icon={<Plus />} onClick={() => setAdding(true)}>Add center leader</Button>}>
                  Add the people who work the gate, and choose their classes.
                </EmptyState>
              </div>
            ) : (
              <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {coordinators.map((p) => {
                  const classes = classesOf(p.id)
                  return (
                    <ListRow key={p.id} avatar={<Avatar name={p.full_name} color={childColor(p.id)} />} title={p.id === myId ? `${p.full_name} (you)` : p.full_name}
                      detail={contact(p)}
                      badges={<>
                        {!p.active && <Pill tone="warning">Access off</Pill>}
                        {classes.length ? classes.map((c) => <Pill key={c.id} icon={<School />}>{c.name}</Pill>) : <Pill tone="warning">No classes yet</Pill>}
                      </>}
                      action={<Button size="md" variant="secondary" onClick={() => setEditing(p)}>Edit</Button>} />
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `${firstName(editing)}'s classes` : 'Classes'}
        description={editing ? `${editing.full_name} hears pickups and drop-offs for these classes while on duty.` : undefined}>
        {editing && data && (
          <EditCoordinator key={editing.id} person={editing} classes={data.classes} initial={data.assignments.get(editing.id) ?? []} onDone={done} />
        )}
      </Sheet>
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a center leader">
        {adding && data && <AddCoordinator data={data} area={area} onDone={done} onNew={area === 'admin' ? () => void addNew() : undefined} />}
      </Sheet>
      {newLeader && (
        <StaffSheet open dir={newLeader} initialRoles={['coordinator']} onClose={() => setNewLeader(null)}
          onSaved={(m) => void reload().then(() => { setNewLeader(null); setAdding(false); toast(m) })} />
      )}
    </AreaShell>
  )
}

function useSave() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(action: () => Promise<void>, onDone: () => void | Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onDone()
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function EditCoordinator({ person, classes, initial, onDone }: { person: Profile; classes: ClassRow[]; initial: string[]; onDone: (message: string) => void | Promise<void> }) {
  const [picked, setPicked] = useState(initial)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const save = useSave()
  const unchanged = picked.length === initial.length && picked.every((id) => initial.includes(id))
  return (
    <>
      {classes.length ? <ClassPicker classes={classes} value={picked} onChange={setPicked} /> : <Notice>No class groups yet.</Notice>}
      {picked.length === 0 && <Notice tone="warning" className="mt-4">With no classes, they hear only requests nobody else has answered.</Notice>}
      {save.error && <Notice tone="danger" className="mt-4">{save.error}</Notice>}

      <div className="mt-8 border-t border-line pt-5">
        {confirmRemove ? (
          <>
            <p className="text-body font-bold">Remove {firstName(person)} as a center leader? They stop hearing announcements and can no longer run the gate. Their other roles stay.</p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Button variant="secondary" onClick={() => setConfirmRemove(false)}>Keep</Button>
              <Button variant="danger" icon={<UserMinus />} loading={save.busy} onClick={() => void save.run(() => removeCoordinator(person.id), () => onDone(`${firstName(person)} is no longer a center leader.`))}>Remove</Button>
            </div>
          </>
        ) : (
          <Button variant="quiet" className="w-full" icon={<UserMinus />} onClick={() => setConfirmRemove(true)}>Remove Center leader role</Button>
        )}
      </div>
      <SheetFooter>
        <Button size="xl" className="w-full" icon={<Check />} loading={save.busy && !confirmRemove} disabled={unchanged}
          onClick={() => void save.run(() => setCoordinator(person.id, picked), () => onDone(`${firstName(person)}'s classes saved.`))}>
          Save classes
        </Button>
      </SheetFooter>
    </>
  )
}

function AddCoordinator({ data, area, onDone, onNew }: { data: CoordinatorData; area: 'admin' | 'core'; onDone: (message: string) => void | Promise<void>; onNew?: () => void }) {
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
        <div className="flex items-center gap-3 rounded-lg bg-sunken p-3">
          <Avatar name={person.full_name} color={childColor(person.id)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-h4">{person.full_name}</p>
            <p className="truncate text-small font-semibold text-ink-2">{contact(person)}</p>
          </div>
          <Button size="md" variant="quiet" onClick={() => setPerson(null)}>Change</Button>
        </div>
        {isParent && (
          <Notice tone="warning" className="mt-3">{firstName(person)} is also a parent here. As a center leader they will see every child's pickup details.</Notice>
        )}
        <p className="kicker mt-6">Their classes</p>
        <div className="mt-3">{data.classes.length ? <ClassPicker classes={data.classes} value={picked} onChange={setPicked} /> : <Notice>No class groups yet. You can choose classes later.</Notice>}</div>
        {save.error && <Notice tone="danger" className="mt-4">{save.error}</Notice>}
        <SheetFooter>
          <Button size="xl" className="w-full" icon={<BellRing />} loading={save.busy} onClick={() => void save.run(() => setCoordinator(person.id, picked), () => onDone(`${firstName(person)} is now a center leader.`))}>
            Make center leader
          </Button>
        </SheetFooter>
      </>
    )
  }

  return (
    <>
      {onNew && (
        <button type="button" onClick={onNew} className="choice flex w-full items-center gap-3.5 p-3.5 text-left">
          <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent [&_svg]:size-[22px]" aria-hidden><UserPlus /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-h4">Add someone new</span>
            <span className="block text-small font-semibold text-ink-2">Their name, email and classes. They get an invitation.</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
        </button>
      )}
      <p className={`text-body text-ink-2 ${onNew ? 'mt-5' : ''}`}>
        {onNew ? 'Or choose someone already at the school.' : 'Choose someone the admin has already added.'} {area === 'core' && 'The head office can give the Center leader role; only the admin gives Admin or Head office.'}
      </p>
      <SearchField label="Search people" className="mt-4" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or phone" autoFocus />
      {candidates.length === 0 ? (
        <p className="mt-6 text-center text-body text-ink-2">{q ? 'Nobody matches your search.' : (onNew ? 'Everyone here is already a center leader. Use Add someone new above.' : 'Everyone registered is already a center leader. The admin adds new staff in People.')}</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {candidates.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setPerson(p)} className="choice flex w-full items-center gap-3 p-3">
                <Avatar name={p.full_name} color={childColor(p.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-h4">{p.full_name}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    {(data.roles.get(p.id) ?? []).map((r) => <Pill key={r} icon={ROLE[r].icon}>{ROLE[r].name}</Pill>)}
                    {data.parentIds.has(p.id) && <Pill icon={AREA_ICON.parent}>Parent</Pill>}
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
