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
import { GATE_ROLES, gateRolesOf, loadCoordinators, removeCoordinator, setCoordinator, type CoordinatorData, type GateRole } from './api'

const contact = (p: Profile) => p.phone ? formatMobile(p.phone) : 'No contact details'
const firstName = (p: Profile) => p.full_name.split(' ')[0]
const roleNames = (roles: readonly GateRole[]) => roles.map((r) => ROLE[r].name.toLowerCase()).join(' and ')

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

/** Center coordinator and/or Center leader: what each does, chosen with one tap (at least one). */
function RolePicker({ value, onChange }: { value: GateRole[]; onChange: (roles: GateRole[]) => void }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2" role="group" aria-label="Gate role">
      {GATE_ROLES.map((r) => {
        const on = value.includes(r)
        return (
          <button key={r} type="button" role="checkbox" aria-checked={on} className="choice flex items-center gap-3 p-3.5 text-left"
            onClick={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])}>
            <span className={`grid size-11 shrink-0 place-items-center rounded-sm [&_svg]:size-[22px] ${on ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-2'}`} aria-hidden>{ROLE[r].icon}</span>
            <span className="min-w-0"><span className="block text-h4">{ROLE[r].name}</span><span className="block text-small font-semibold text-ink-2">{ROLE[r].does}</span></span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * The gate team (PRD D11, D23; 0038): Center coordinators run the gate (check-ins, handovers, codes); Center leaders hear
 * it, acknowledge and mark children Ready. Both hear the classes chosen here. Open to the head office and the admin; the
 * database lets the head office give or remove only these two roles.
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

  const team = useMemo(() => data?.people.filter((p) => gateRolesOf(data.roles.get(p.id)).length > 0) ?? [], [data])
  const classesOf = (id: string) => data?.classes.filter((c) => data.assignments.get(id)?.includes(c.id)) ?? []
  const teamOf = (classId: string) => team.filter((p) => p.active && data?.assignments.get(p.id)?.includes(classId))
  // Refresh first, so the list already shows the change when the sheet closes and the toast confirms it.
  const done = async (message: string) => { await reload(); setEditing(null); setAdding(false); toast(message) }
  // Someone not at the school yet: the admin's staff form, with Center coordinator already chosen (only the admin adds people).
  const [newPerson, setNewPerson] = useState<Directory | null>(null)
  // Opens over the Add sheet (Cancel goes back to the list; saving closes both), so two sheets never pass each other.
  async function addNew() {
    try { setNewPerson(await loadDirectory()) } catch (e) { toast(explainDbError(e as { code?: string; message?: string }), { tone: 'danger' }) }
  }

  return (
    <AreaShell area={area} title="Gate team"
      subtitle="Center coordinators run the gate. Center leaders hear it, acknowledge and mark children ready."
      actions={data && <Button icon={<Plus />} onClick={() => setAdding(true)}>Add to the gate team</Button>}>
      {loadError ? (
        <div className="mt-6"><ErrorState title="Couldn't load the gate team" onRetry={() => void reload()}>{loadError}</ErrorState></div>
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
                  const who = teamOf(c.id)
                  const runs = who.some((p) => data.roles.get(p.id)?.includes('coordinator'))
                  return (
                    <li key={c.id} className="card flex items-center gap-3 rounded-xl p-3.5">
                      <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-sunken text-ink-2 [&_svg]:size-5" aria-hidden><School /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-h4">{c.name}</p>
                        {who.length ? (
                          <>
                            <p className="truncate text-small font-semibold text-ink-2">{who.map(firstName).join(', ')}</p>
                            {!runs && <p className="text-caption font-bold text-warning">No center coordinator: every coordinator on duty hears it</p>}
                          </>
                        ) : (
                          <p className="flex items-center gap-1.5 text-small font-bold text-warning"><TriangleAlert className="size-4 shrink-0" aria-hidden />Nobody assigned: goes to everyone on duty</p>
                        )}
                      </div>
                      {who.length > 0 && <Pill icon={<UsersRound />}>{who.length}</Pill>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="mt-10" aria-labelledby="team-title">
            <h2 id="team-title" className="kicker px-0.5">Gate team · {team.length}</h2>
            {team.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="Nobody on the gate team yet" action={<Button icon={<Plus />} onClick={() => setAdding(true)}>Add to the gate team</Button>}>
                  Add the people who work the gate, and choose their classes.
                </EmptyState>
              </div>
            ) : (
              <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {team.map((p) => {
                  const classes = classesOf(p.id)
                  return (
                    <ListRow key={p.id} avatar={<Avatar name={p.full_name} color={childColor(p.id)} />} title={p.id === myId ? `${p.full_name} (you)` : p.full_name}
                      detail={contact(p)}
                      badges={<>
                        {gateRolesOf(data.roles.get(p.id)).map((r) => <Pill key={r} tone={r === 'coordinator' ? 'accent' : undefined} icon={ROLE[r].icon}>{ROLE[r].name}</Pill>)}
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

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `${firstName(editing)} on the gate` : 'Gate team'}
        description={editing ? `${editing.full_name} hears pickups and drop-offs for these classes while on duty.` : undefined}>
        {editing && data && (
          <EditMember key={editing.id} person={editing} classes={data.classes} initialRoles={gateRolesOf(data.roles.get(editing.id))}
            lastRoles={(data.roles.get(editing.id) ?? []).every((r) => r === 'coordinator' || r === 'leader')} initialClasses={data.assignments.get(editing.id) ?? []} onDone={done} />
        )}
      </Sheet>
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add to the gate team">
        {adding && data && <AddMember data={data} area={area} onDone={done} onNew={area === 'admin' ? () => void addNew() : undefined} />}
      </Sheet>
      {newPerson && (
        <StaffSheet open dir={newPerson} initialRoles={['coordinator']} onClose={() => setNewPerson(null)}
          onSaved={(m) => void reload().then(() => { setNewPerson(null); setAdding(false); toast(m) })} />
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

const sameSet = <T,>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x) => b.includes(x))

/**
 * Saves gate roles and classes: roles added first (so the classes always have a gate role to belong to), then the classes,
 * then roles taken away. Never leaves the person without a role mid-way.
 */
async function saveMember(person: Profile, roles: GateRole[], before: GateRole[], classes: string[]) {
  const added = roles.filter((r) => !before.includes(r))
  for (const r of added) await setCoordinator(person.id, classes, r)
  if (!added.length) await setCoordinator(person.id, classes, roles[0]!)
  const removed = before.filter((r) => !roles.includes(r))
  if (removed.length) await removeCoordinator(person.id, removed)
}

function EditMember({ person, classes, initialRoles, lastRoles, initialClasses, onDone }: {
  person: Profile; classes: ClassRow[]; initialRoles: GateRole[]; lastRoles: boolean; initialClasses: string[]; onDone: (message: string) => void | Promise<void>
}) {
  const [roles, setRoles] = useState<GateRole[]>(initialRoles)
  const [picked, setPicked] = useState(initialClasses)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const save = useSave()
  const unchanged = sameSet(picked, initialClasses) && sameSet(roles, initialRoles)
  return (
    <>
      <p className="kicker mb-2.5">Role</p>
      <RolePicker value={roles} onChange={setRoles} />
      {roles.length === 0 && <Notice tone="warning" className="mt-3">Choose a role, or use Remove from the gate team below.</Notice>}
      <p className="kicker mb-2.5 mt-6">Classes</p>
      {classes.length ? <ClassPicker classes={classes} value={picked} onChange={setPicked} /> : <Notice>No class groups yet.</Notice>}
      {picked.length === 0 && <Notice tone="warning" className="mt-4">With no classes, they hear only requests nobody else has answered.</Notice>}
      {save.error && <Notice tone="danger" className="mt-4">{save.error}</Notice>}

      <div className="mt-8 border-t border-line pt-5">
        {confirmRemove ? (
          <>
            <p className="text-body font-bold">Remove {firstName(person)} from the gate team? They stop hearing announcements and can no longer act at the gate. {lastRoles
              ? 'This is their only role: they stay under People → Staff as "No role" until you give them one.'
              : 'Their other roles stay.'}</p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Button variant="secondary" onClick={() => setConfirmRemove(false)}>Keep</Button>
              <Button variant="danger" icon={<UserMinus />} loading={save.busy} onClick={() => void save.run(() => removeCoordinator(person.id), () => onDone(`${firstName(person)} is no longer on the gate team.`))}>Remove</Button>
            </div>
          </>
        ) : (
          <Button variant="quiet" className="w-full" icon={<UserMinus />} onClick={() => setConfirmRemove(true)}>Remove from the gate team</Button>
        )}
      </div>
      <SheetFooter>
        <Button size="xl" className="w-full" icon={<Check />} loading={save.busy && !confirmRemove} disabled={unchanged || roles.length === 0}
          onClick={() => void save.run(() => saveMember(person, roles, initialRoles, picked), () => onDone(`${firstName(person)} is a ${roleNames(roles)}. Saved.`))}>
          Save
        </Button>
      </SheetFooter>
    </>
  )
}

function AddMember({ data, area, onDone, onNew }: { data: CoordinatorData; area: 'admin' | 'core'; onDone: (message: string) => void | Promise<void>; onNew?: () => void }) {
  const [query, setQuery] = useState('')
  const [person, setPerson] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<GateRole[]>(['coordinator'])
  const [picked, setPicked] = useState<string[]>([])
  const save = useSave()

  const q = query.trim().toLowerCase()
  const candidates = data.people
    .filter((p) => p.active && gateRolesOf(data.roles.get(p.id)).length === 0)
    .filter((p) => !q || [p.full_name, p.phone].some((v) => v?.toLowerCase().includes(q)))
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
          <Notice tone="warning" className="mt-3">{firstName(person)} is also a parent here. On the gate team they will see every child's pickup details.</Notice>
        )}
        <p className="kicker mb-2.5 mt-6">Role</p>
        <RolePicker value={roles} onChange={setRoles} />
        <p className="kicker mt-6">Their classes</p>
        <div className="mt-3">{data.classes.length ? <ClassPicker classes={data.classes} value={picked} onChange={setPicked} /> : <Notice>No class groups yet. You can choose classes later.</Notice>}</div>
        {save.error && <Notice tone="danger" className="mt-4">{save.error}</Notice>}
        <SheetFooter>
          <Button size="xl" className="w-full" icon={<BellRing />} loading={save.busy} disabled={roles.length === 0}
            onClick={() => void save.run(() => saveMember(person, roles, [], picked), () => onDone(`${firstName(person)} is now a ${roleNames(roles)}.`))}>
            {roles.length === 1 ? `Make ${ROLE[roles[0]!].name.toLowerCase()}` : 'Add to the gate team'}
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
            <span className="block text-small font-semibold text-ink-2">Their name, mobile, role and classes. They get an invitation.</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
        </button>
      )}
      <p className={`text-body text-ink-2 ${onNew ? 'mt-5' : ''}`}>
        {onNew ? 'Or choose someone already at the school.' : 'Choose someone the admin has already added.'} {area === 'core' && 'The head office can give the two gate roles; only the admin gives Admin or Head office.'}
      </p>
      <SearchField label="Search people" className="mt-4" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or phone" autoFocus />
      {candidates.length === 0 ? (
        <p className="mt-6 text-center text-body text-ink-2">{q ? 'Nobody matches your search.' : (onNew ? 'Everyone here is already on the gate team. Use Add someone new above.' : 'Everyone registered is already on the gate team. The admin adds new staff in People.')}</p>
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
