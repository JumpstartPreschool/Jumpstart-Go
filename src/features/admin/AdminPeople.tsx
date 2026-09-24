import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Baby, CircleCheck, Hourglass, Plus, School, ShieldOff, UserCog, Users } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { SearchField } from '../../ui/Field'
import { ListRow } from '../../ui/ListRow'
import { Pill } from '../../ui/Pill'
import { Sheet } from '../../ui/Sheet'
import { EmptyState, ErrorState, Notice, SkeletonList } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { useToast } from '../../ui/Toast'
import { childColor } from '../../ui/childColor'
import { formatIndianMobile } from '../../domain/contact'
import { AREA_ICON, AREA_LABEL, AreaShell } from '../auth/AreaShell'
import { useSession } from '../auth/session'
import { addClass, explainDbError, loadDirectory, setPersonActive, type ClassRow, type Directory, type Profile } from './api'
import { AddChildForm, AddPersonForm } from './AdminForms'
import { formatAge } from './programmeCatalogue'

type Tab = 'children' | 'parents' | 'staff' | 'classes'
const TABS: Array<{ key: Tab; label: string; icon: ReactNode }> = [
  { key: 'children', label: 'Children', icon: <Baby /> },
  { key: 'parents', label: 'Parents', icon: <Users /> },
  { key: 'staff', label: 'Staff', icon: <UserCog /> },
  { key: 'classes', label: 'Classes', icon: <School /> },
]
const ADD_LABEL: Record<Tab, string> = { children: 'Add child', parents: 'Add parent', staff: 'Add staff', classes: 'Add class' }

function Status({ person }: { person: Profile }) {
  if (!person.active) return <Pill tone="stale" icon={<ShieldOff />}>Access off</Pill>
  if (person.user_id) return <Pill tone="live" icon={<CircleCheck />}>Signed in</Pill>
  return <Pill tone="recent" icon={<Hourglass />}>Invited</Pill>
}

/** Admin: people and classes (J10, PRO-1…PRO-4). The admin alone adds, edits or removes children and parents (D1). */
export function AdminPeople() {
  const { state } = useSession()
  const toast = useToast()
  const [dir, setDir] = useState<Directory | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('children')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<Tab | null>(null)
  const [confirm, setConfirm] = useState<Profile | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newClass, setNewClass] = useState('')

  const reload = useCallback(async () => {
    setLoadError(null)
    try {
      setDir(await loadDirectory())
    } catch (e) {
      setLoadError(explainDbError(e as { code?: string }))
    }
  }, [])
  useEffect(() => { void reload() }, [reload])

  const myId = state.status === 'signed-in' ? state.me?.profile_id : undefined
  const q = query.trim().toLowerCase()

  const lists = useMemo(() => {
    if (!dir) return null
    const match = (...parts: Array<string | null | undefined>) => !q || parts.some((p) => p?.toLowerCase().includes(q))
    const isStaff = (p: Profile) => (dir.roles.get(p.id)?.length ?? 0) > 0
    const guardianIds = new Set(dir.guardianships.map((g) => g.guardian_id))
    return {
      children: dir.children.filter((c) => match(c.full_name, c.preferred_name)),
      parents: dir.profiles.filter((p) => (!isStaff(p) || guardianIds.has(p.id)) && match(p.full_name, p.email, p.phone)),
      staff: dir.profiles.filter((p) => isStaff(p) && match(p.full_name, p.email, p.phone)),
      classes: dir.classes.filter((c) => match(c.name)),
    }
  }, [dir, q])

  async function toggleActive(person: Profile) {
    setActionError(null)
    setBusy(true)
    try {
      await setPersonActive(person.id, !person.active)
      // Show the change straight away; the reload confirms it from the server.
      setDir((d) => d && { ...d, profiles: d.profiles.map((p) => (p.id === person.id ? { ...p, active: !person.active } : p)) })
      setConfirm(null)
      toast(person.active ? `Access turned off for ${person.full_name}.` : `${person.full_name} can sign in again.`)
      void reload()
    } catch (e) {
      setActionError(explainDbError(e as { code?: string }))
    } finally {
      setBusy(false)
    }
  }

  async function createClass() {
    if (!newClass.trim()) return setActionError('Give the class group a name first.')
    setActionError(null)
    try {
      const added = await addClass(newClass)
      onClassAdded(added)
      toast(`Class group ${added.name} added.`)
      setNewClass('')
    } catch (e) {
      const err = e as { code?: string }
      setActionError(err.code === '23505' ? 'A class with this name already exists.' : explainDbError(err))
    }
  }

  /** After a save: refresh the list first, so the new row is already there when the sheet closes and the toast confirms. */
  async function added(what: string) {
    await reload()
    setAdding(null)
    toast(what)
  }

  const onClassAdded = (c: ClassRow) => setDir((d) => (d ? { ...d, classes: [...d.classes, c].sort((a, b) => a.name.localeCompare(b.name)) } : d))
  const people = lists ? (tab === 'parents' ? lists.parents : lists.staff) : []

  return (
    <AreaShell area="admin" title="People" subtitle="Children, their parents and the staff at Karve Road. Only the admin adds or removes them."
      actions={tab !== 'classes' && <Button icon={<Plus />} onClick={() => setAdding(tab)}>{ADD_LABEL[tab]}</Button>}>
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs id="people" label="People" value={tab} onChange={setTab}
          items={TABS.map((t) => ({ ...t, count: lists ? lists[t.key].length : null }))} />
        <SearchField label="Search people" className="min-w-0 lg:flex-1"value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or phone" />
      </div>

      {actionError && <Notice tone="danger" className="mt-4">{actionError}</Notice>}

      <section id="people-panel" role="tabpanel" aria-labelledby={`people-${tab}`} className="mt-5">
        {loadError ? (
          <ErrorState title="Couldn't load people" onRetry={() => void reload()}>{loadError}</ErrorState>
        ) : !dir || !lists ? (
          <SkeletonList />
        ) : tab === 'children' ? (
          lists.children.length === 0 ? (
            q ? <EmptyState title="No children match">Try a different name, or clear the search.</EmptyState>
              : <EmptyState title="No children yet" action={<Button icon={<Plus />} onClick={() => setAdding('children')}>Add child</Button>}>Add the parents first, then add each child and link them.</EmptyState>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {lists.children.map((c) => {
                const programme = dir.programmes.find((p) => p.id === c.programme_id)
                const klass = dir.classes.find((k) => k.id === c.class_id)
                const guardians = dir.guardianships.filter((g) => g.child_id === c.id)
                return (
                  <ListRow key={c.id} avatar={<Avatar name={c.preferred_name ?? c.full_name} color={childColor(c.id)} />} title={c.full_name}
                    detail={[programme?.name ?? 'Programme not found', klass?.name, formatAge(c.date_of_birth)].filter(Boolean).join(' · ')}
                    badges={guardians.length ? guardians.map((g) => (
                      <Pill key={g.guardian_id} icon={<Users />}>{dir.profiles.find((p) => p.id === g.guardian_id)?.full_name ?? 'Unknown'} · {g.relation}</Pill>
                    )) : <Pill tone="warning">No parent linked</Pill>} />
                )
              })}
            </ul>
          )
        ) : tab === 'classes' ? (
          <>
            <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void createClass() }}>
              <label className="input min-w-0 flex-1">
                <School aria-hidden />
                <input value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="New class group, e.g. Sunflowers" aria-label="New class group name" />
              </label>
              <Button type="submit" icon={<Plus />}>Add class</Button>
            </form>
            {lists.classes.length === 0 ? (
              <EmptyState title={q ? 'No classes match' : 'No class groups yet'}>{q ? 'Try a different name, or clear the search.' : 'Coordinators are assigned to classes, and each child belongs to one.'}</EmptyState>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lists.classes.map((k) => {
                  const n = dir.children.filter((c) => c.class_id === k.id).length
                  return <ListRow key={k.id} avatar={<Avatar name={k.name} color={childColor(k.id)} icon={<School />} />} title={k.name} detail={`${n} ${n === 1 ? 'child' : 'children'}`} />
                })}
              </ul>
            )}
          </>
        ) : people.length === 0 ? (
          q ? <EmptyState title="Nobody matches">Try a different name, email or phone number.</EmptyState>
            : tab === 'parents'
              ? <EmptyState title="No parents yet" action={<Button icon={<Plus />} onClick={() => setAdding('parents')}>Add parent</Button>}>Add each parent with the email they will sign in with.</EmptyState>
              : <EmptyState title="No staff yet" action={<Button icon={<Plus />} onClick={() => setAdding('staff')}>Add staff</Button>}>Add coordinators and the core team with their roles.</EmptyState>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {people.map((p) => {
              const roles = dir.roles.get(p.id) ?? []
              const kids = dir.guardianships.filter((g) => g.guardian_id === p.id).length
              return (
                <ListRow key={p.id} avatar={<Avatar name={p.full_name} color={childColor(p.id)} />} title={p.id === myId ? `${p.full_name} (you)` : p.full_name}
                  detail={[p.email, p.phone && formatIndianMobile(p.phone)].filter(Boolean).join(' · ') || 'No contact details'}
                  badges={<>
                    <Status person={p} />
                    {roles.map((r) => <Pill key={r} icon={AREA_ICON[r]}>{AREA_LABEL[r]}</Pill>)}
                    {tab === 'parents' && <Pill icon={<Baby />}>{kids} {kids === 1 ? 'child' : 'children'}</Pill>}
                  </>}
                  action={p.id === myId ? null : (
                    <Button size="md" variant={p.active ? 'secondary' : 'primary'} onClick={() => { setActionError(null); setConfirm(p) }}>{p.active ? 'Turn off' : 'Turn on'}</Button>
                  )} />
              )
            })}
          </ul>
        )}
      </section>

      <Sheet open={adding === 'children'} onClose={() => setAdding(null)} title="Add a child" description="Their details, programme and the parents who can sign in." wide>
        {dir && adding === 'children' && <AddChildForm directory={dir} onClassAdded={onClassAdded} onDone={(name) => added(`${name} added.`)} />}
      </Sheet>
      <Sheet open={adding === 'parents'} onClose={() => setAdding(null)} title="Add a parent" description="They sign in with a one-time code sent to their email.">
        {adding === 'parents' && <AddPersonForm kind="parent" onDone={(name) => added(`${name} added. They can sign in now.`)} />}
      </Sheet>
      <Sheet open={adding === 'staff'} onClose={() => setAdding(null)} title="Add a staff member" description="Choose what they can see and do.">
        {adding === 'staff' && <AddPersonForm kind="staff" onDone={(name) => added(`${name} added. They can sign in now.`)} />}
      </Sheet>
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.active ? `Turn off ${confirm.full_name}?` : `Turn on ${confirm?.full_name ?? ''}?`}
        description={confirm?.active ? 'They lose access straight away and are signed out on every device. Their records stay.' : 'They can sign in again with their email.'}>
        {actionError && <Notice tone="danger" className="mb-4">{actionError}</Notice>}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant={confirm?.active ? 'danger' : 'primary'} icon={confirm?.active ? <ShieldOff /> : <CircleCheck />} loading={busy} onClick={() => confirm && void toggleActive(confirm)}>
            {confirm?.active ? 'Turn off access' : 'Turn on access'}
          </Button>
        </div>
      </Sheet>
    </AreaShell>
  )
}
