import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Baby, CircleCheck, Hourglass, Plus, RotateCcw, School, Search, ShieldOff, UserCog, Users } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { Mascot } from '../../ui/Backdrop'
import { childColor } from '../../ui/childColor'
import { formatIndianMobile } from '../../domain/contact'
import { AREA_LABEL, AreaShell } from '../auth/AreaShell'
import { useSession } from '../auth/session'
import { addClass, explainDbError, loadDirectory, setPersonActive, type ClassRow, type Directory, type Profile } from './api'
import { AddChildForm, AddPersonForm } from './AdminForms'
import { formatAge } from './programmeCatalogue'

type Tab = 'children' | 'parents' | 'staff' | 'classes'
const TABS: Array<{ key: Tab; label: string; icon: ReactNode; color: string }> = [
  { key: 'children', label: 'Children', icon: <Baby />, color: 'var(--rb-orange)' },
  { key: 'parents', label: 'Parents', icon: <Users />, color: 'var(--rb-blue)' },
  { key: 'staff', label: 'Staff', icon: <UserCog />, color: 'var(--rb-violet)' },
  { key: 'classes', label: 'Classes', icon: <School />, color: 'var(--rb-green)' },
]

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-full font-display text-[20px] font-bold text-white ring-[3px] ring-white/70"
      style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 62%, white))`, boxShadow: `0 10px 20px -10px ${color}` }} aria-hidden>
      {name[0]}
    </span>
  )
}

function Status({ person }: { person: Profile }) {
  if (!person.active) return <span className="inline-flex items-center gap-1 rounded-full bg-stale-soft px-2.5 py-1 text-[12px] font-extrabold text-stale"><ShieldOff className="size-3.5" aria-hidden />Access off</span>
  if (person.user_id) return <span className="inline-flex items-center gap-1 rounded-full bg-live-soft px-2.5 py-1 text-[12px] font-extrabold text-live"><CircleCheck className="size-3.5" aria-hidden />Signed in</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-recent-soft px-2.5 py-1 text-[12px] font-extrabold text-recent"><Hourglass className="size-3.5" aria-hidden />Invited</span>
}

function Row({ avatar, title, detail, badges, action }: { avatar: ReactNode; title: string; detail: ReactNode; badges?: ReactNode; action?: ReactNode }) {
  return (
    <li className="card flex items-center gap-3.5 rounded-[26px] p-3.5 pr-4">
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[19px] font-bold leading-6">{title}</p>
        <p className="truncate text-[14px] font-semibold text-ink-2">{detail}</p>
        {badges && <div className="mt-1.5 flex flex-wrap gap-1.5">{badges}</div>}
      </div>
      {action}
    </li>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="card flex flex-col items-center rounded-[30px] p-8 text-center">
      <Mascot size={96} />
      <p className="mt-2 max-w-[420px] text-[16px] font-semibold text-ink-2">{children}</p>
    </div>
  )
}

/** Admin: people and classes (J10, PRO-1…PRO-4). The admin alone adds, edits or removes children and parents (D1). */
export function AdminPeople() {
  const { state } = useSession()
  const [dir, setDir] = useState<Directory | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('children')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<Tab | null>(null)
  const [confirm, setConfirm] = useState<Profile | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
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
    try {
      await setPersonActive(person.id, !person.active)
      setConfirm(null)
      await reload()
    } catch (e) {
      setActionError(explainDbError(e as { code?: string }))
    }
  }

  async function createClass() {
    if (!newClass.trim()) return
    try {
      await addClass(newClass)
      setNewClass('')
      await reload()
    } catch (e) {
      const err = e as { code?: string }
      setActionError(err.code === '23505' ? 'A class with this name already exists.' : explainDbError(err))
    }
  }

  const onClassAdded = (c: ClassRow) => setDir((d) => (d ? { ...d, classes: [...d.classes, c].sort((a, b) => a.name.localeCompare(b.name)) } : d))
  const addLabel: Record<Tab, string> = { children: 'Add child', parents: 'Add parent', staff: 'Add staff', classes: 'Add class' }

  return (
    <AreaShell area="admin" title="People">
      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="glass flex gap-1 overflow-x-auto rounded-full p-1.5" role="tablist" aria-label="People">
          {TABS.map((t) => {
            const on = t.key === tab
            const count = lists ? lists[t.key].length : null
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                className={`flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-extrabold transition-colors [&_svg]:size-[18px] ${on ? 'text-white' : 'text-ink-2'}`}
                style={on ? { background: `linear-gradient(135deg, ${t.color}, color-mix(in oklab, ${t.color} 70%, white))`, boxShadow: `0 10px 20px -10px ${t.color}` } : undefined}>
                <span style={on ? undefined : { color: t.color }}>{t.icon}</span>
                {t.label}
                {count !== null && <span className={`rounded-full px-1.5 text-[12px] ${on ? 'bg-white/25' : 'bg-sunken'}`}>{count}</span>}
              </button>
            )
          })}
        </div>
        <label className="card flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full px-4">
          <Search className="size-5 shrink-0 text-ink-3" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or phone" aria-label="Search"
            className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold outline-none placeholder:text-ink-3" />
        </label>
        {tab !== 'classes' && <Button icon={<Plus />} onClick={() => setAdding(tab)}>{addLabel[tab]}</Button>}
      </div>

      {actionError && <p className="mt-4 rounded-[18px] bg-danger-soft px-4 py-3 text-[15px] font-bold text-danger" role="alert">{actionError}</p>}

      <section className="mt-5" aria-live="polite">
        {loadError ? (
          <div className="card rounded-[30px] p-6 text-center">
            <p className="text-[16px] font-bold text-danger">{loadError}</p>
            <Button className="mt-4" variant="secondary" icon={<RotateCcw />} onClick={() => void reload()}>Try again</Button>
          </div>
        ) : !dir || !lists ? (
          <ul className="grid gap-3 md:grid-cols-2" aria-label="Loading">
            {[0, 1, 2, 3].map((i) => <li key={i} className="card h-[86px] animate-pulse rounded-[26px]" />)}
          </ul>
        ) : tab === 'children' ? (
          lists.children.length === 0 ? (
            <Empty>{q ? 'No children match your search.' : 'No children yet. Add the parents first, then add each child and link them.'}</Empty>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {lists.children.map((c) => {
                const programme = dir.programmes.find((p) => p.id === c.programme_id)
                const klass = dir.classes.find((k) => k.id === c.class_id)
                const guardians = dir.guardianships.filter((g) => g.child_id === c.id).map((g) => `${dir.profiles.find((p) => p.id === g.guardian_id)?.full_name ?? '—'} (${g.relation})`)
                return (
                  <Row key={c.id} avatar={<Avatar name={c.full_name} color={childColor(c.id)} />} title={c.full_name}
                    detail={`${programme?.name ?? 'Programme not found'} · ${klass?.name ?? '—'} · ${formatAge(c.date_of_birth)}`}
                    badges={guardians.length ? <span className="text-[13px] font-bold text-ink-2">{guardians.join(', ')}</span> : null} />
                )
              })}
            </ul>
          )
        ) : tab === 'classes' ? (
          <>
            <div className="mb-4 flex gap-2">
              <input value={newClass} onChange={(e) => setNewClass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void createClass()} placeholder="New class group, e.g. Sunflowers" aria-label="New class group name"
                className="card h-12 min-w-0 flex-1 rounded-full px-5 text-[16px] font-semibold outline-none placeholder:text-ink-3" />
              <Button icon={<Plus />} onClick={() => void createClass()}>Add class</Button>
            </div>
            {lists.classes.length === 0 ? (
              <Empty>No class groups yet. Coordinators are assigned to classes, and each child belongs to one.</Empty>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lists.classes.map((k) => (
                  <Row key={k.id} avatar={<Avatar name={k.name} color={childColor(k.id)} />} title={k.name} detail={`${dir.children.filter((c) => c.class_id === k.id).length} children`} />
                ))}
              </ul>
            )}
          </>
        ) : (
          (tab === 'parents' ? lists.parents : lists.staff).length === 0 ? (
            <Empty>{q ? 'Nobody matches your search.' : tab === 'parents' ? 'No parents yet. Add each parent with the email they will sign in with.' : 'No staff yet. Add coordinators and the core team with their roles.'}</Empty>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {(tab === 'parents' ? lists.parents : lists.staff).map((p) => {
                const roles = dir.roles.get(p.id) ?? []
                const kids = dir.guardianships.filter((g) => g.guardian_id === p.id).length
                return (
                  <Row key={p.id} avatar={<Avatar name={p.full_name} color={childColor(p.id)} />} title={p.full_name}
                    detail={[p.email, p.phone && formatIndianMobile(p.phone)].filter(Boolean).join(' · ') || 'No contact details'}
                    badges={<>
                      <Status person={p} />
                      {roles.map((r) => <span key={r} className="rounded-full bg-sunken px-2.5 py-1 text-[12px] font-extrabold text-ink-2">{AREA_LABEL[r]}</span>)}
                      {tab === 'parents' && <span className="rounded-full bg-sunken px-2.5 py-1 text-[12px] font-extrabold text-ink-2">{kids} {kids === 1 ? 'child' : 'children'}</span>}
                    </>}
                    action={p.id === myId ? null : (
                      <Button size="md" variant={p.active ? 'quiet' : 'secondary'} onClick={() => setConfirm(p)}>{p.active ? 'Turn off' : 'Turn on'}</Button>
                    )} />
                )
              })}
            </ul>
          )
        )}
      </section>

      <Sheet open={adding === 'children'} onClose={() => setAdding(null)} title="Add a child" wide>
        {dir && adding === 'children' && <AddChildForm directory={dir} onClassAdded={onClassAdded} onDone={() => { setAdding(null); void reload() }} />}
      </Sheet>
      <Sheet open={adding === 'parents'} onClose={() => setAdding(null)} title="Add a parent">
        {adding === 'parents' && <AddPersonForm kind="parent" onDone={() => { setAdding(null); void reload() }} />}
      </Sheet>
      <Sheet open={adding === 'staff'} onClose={() => setAdding(null)} title="Add a staff member">
        {adding === 'staff' && <AddPersonForm kind="staff" onDone={() => { setAdding(null); void reload() }} />}
      </Sheet>
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.active ? `Turn off ${confirm?.full_name}?` : `Turn on ${confirm?.full_name ?? ''}?`}>
        <p className="text-[16px] font-semibold leading-6 text-ink-2">
          {confirm?.active
            ? 'They lose access straight away and are signed out on every device. Their records stay.'
            : 'They can sign in again with their email.'}
        </p>
        <div className="mt-6 grid gap-2">
          <Button variant={confirm?.active ? 'danger' : 'primary'} onClick={() => confirm && void toggleActive(confirm)}>{confirm?.active ? 'Turn off access' : 'Turn on access'}</Button>
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
        </div>
      </Sheet>
    </AreaShell>
  )
}
