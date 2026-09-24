import { useState, type ReactNode } from 'react'
import { ChevronLeft, Globe, Heart, LogOut, Lock, Pencil, Trash2, UserPlus, UserRound } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/Field'
import { Pill } from '../../ui/Pill'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { Switch } from '../../ui/Switch'
import { useToast } from '../../ui/Toast'
import { childColor } from '../../ui/childColor'
import { formatMobile } from '../../domain/contact'
import { formatTime, toMinutes } from '../../domain/time'
import { childLeft, explainDbError, removeGuardian, setAppAccess, updateChild, type Child, type Directory, type Profile } from './api'
import { AddGuardianSheet } from './ChildForms'
import { formatAge, levelOf } from './programmeCatalogue'
import { LEVEL_ICON, ProgrammePicker } from './ProgrammePicker'

const hm = (t?: string | null) => (t ? formatTime(toMinutes(t.slice(0, 5))) : '')

/** Signed in, invited (not yet signed in), or no app access: said in words and colour. */
export function AccessState({ person }: { person: Profile }) {
  const [label, cls] = !person.app_access ? ['No app access', 'text-ink-3'] : person.user_id ? ['Signed in', 'text-live'] : ['Invited', 'text-warning']
  return <span className={`inline-flex items-center gap-1.5 text-caption font-bold ${cls}`}><span className="size-2 rounded-full bg-current" aria-hidden />{label}</span>
}

/** The confirmation before anything that signs someone out or takes a child off the lists. */
function Confirm({ open, title, body, action, icon, busy, error, onYes, onNo }: { open: boolean; title: string; body: string; action: string; icon: ReactNode; busy: boolean; error: string | null; onYes: () => void; onNo: () => void }) {
  return (
    <Sheet open={open} onClose={onNo} title={title} description={body}>
      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Button variant="secondary" onClick={onNo}>Cancel</Button>
        <Button variant="danger" icon={icon} loading={busy} onClick={onYes}>{action}</Button>
      </div>
    </Sheet>
  )
}

type Pending = { kind: 'access'; person: Profile } | { kind: 'remove'; person: Profile } | { kind: 'left' } | null

/**
 * A child's page (Screen Book v3, admin): class and programme with its windows and coordinators; parents and family with
 * their app access; edit details; and "has left the school".
 */
export function ChildPage({ dir, child, onBack, onChanged }: { dir: Directory; child: Child; onBack: () => void; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const first = child.preferred_name ?? child.full_name.split(' ')[0]!
  const programme = dir.programmes.find((p) => p.id === child.programme_id)
  const klass = dir.classes.find((c) => c.id === child.class_id)
  const coordinators = dir.coordinatorClasses.filter((a) => a.class_id === child.class_id).map((a) => dir.profiles.find((p) => p.id === a.profile_id)).filter((p): p is Profile => !!p?.active)
  const regular = dir.schedules.filter((s) => s.child_id === child.id)
  const people = dir.guardianships.filter((g) => g.child_id === child.id).map((g) => ({ g, p: dir.profiles.find((x) => x.id === g.guardian_id) })).filter((x): x is { g: typeof x.g; p: Profile } => !!x.p)
  const [sheet, setSheet] = useState<null | 'programme' | 'add' | 'edit'>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [edit, setEdit] = useState({ name: child.full_name, called: child.preferred_name ?? '', dob: child.date_of_birth })
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  /** Runs a change, refreshes the page and says so; true when it worked (the error shows in the open sheet otherwise). */
  async function run(fn: () => Promise<void>, done: string): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await onChanged()
      setPending(null)
      setSheet(null)
      toast(done)
      return true
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
      return false
    } finally {
      setBusy(false)
    }
  }

  function toggleAccess(p: Profile) {
    if (p.app_access) return setPending({ kind: 'access', person: p })
    if (!p.email) return toast(`${p.full_name.split(' ')[0]} has no email yet. Add them again with an email to give app access.`)
    void run(() => setAppAccess(p.id, true), `${p.full_name.split(' ')[0]} can sign in with a code sent to ${p.email}.`)
  }

  function saveEdit() {
    const e: Record<string, string> = {}
    if (edit.name.trim().split(/\s+/).length < 2) e.name = 'Enter the first and last name.'
    if (!edit.dob || edit.dob > new Date().toISOString().slice(0, 10)) e.dob = 'Check the date of birth.'
    setEditErrors(e)
    if (Object.keys(e).length) return
    void run(() => updateChild(child.id, { full_name: edit.name.trim().replace(/\s+/g, ' '), preferred_name: edit.called.trim() || null, date_of_birth: edit.dob }), 'Saved.')
  }

  const row = ({ g, p }: (typeof people)[number]) => (
    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
      <Avatar name={p.full_name} color={g.kind === 'parent' ? 'var(--rb-blue)' : 'var(--ink-3)'} size="sm" />
      <div className="min-w-0 flex-1 basis-[160px]">
        <p className="truncate text-h4">{p.full_name}</p>
        <p className="truncate text-small font-semibold text-ink-2">
          {g.relation}{p.abroad ? ', lives outside India' : ''}{p.email || p.phone ? `, ${[p.email, p.phone && formatMobile(p.phone)].filter(Boolean).join(', ')}` : ''}
        </p>
      </div>
      <AccessState person={p} />
      <Switch on={p.app_access} label={`App access for ${p.full_name}`} busy={busy} onChange={() => toggleAccess(p)} />
      <Button size="md" variant="quiet" icon={<Trash2 />} aria-label={`Remove ${p.full_name}`} onClick={() => { setError(null); setPending({ kind: 'remove', person: p }) }} />
    </li>
  )
  const parents = people.filter((x) => x.g.kind === 'parent')
  const family = people.filter((x) => x.g.kind === 'family')

  return (
    <div className="page-in mt-4 grid gap-5">
      <Button size="md" variant="quiet" icon={<ChevronLeft />} className="justify-self-start" onClick={onBack}>Children</Button>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={first} color={childColor(child.id)} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-h1 text-balance">{child.full_name}</h2>
          <p className="text-body text-ink-2">Called {first}, born {new Date(`${child.date_of_birth}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}, {formatAge(child.date_of_birth)}</p>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="card grid gap-4 rounded-2xl p-5" aria-labelledby="class-h">
          <h3 id="class-h" className="kicker">Class and programme</h3>
          <div className="flex items-center gap-3.5">
            <span className="grid size-12 shrink-0 place-items-center rounded-md bg-accent-soft text-accent [&_svg]:size-6" aria-hidden>{programme ? LEVEL_ICON[levelOf(programme).level] : null}</span>
            <div className="min-w-0 flex-1">
              <p className="text-h3">{programme?.name ?? 'Programme not found'}</p>
              <p className="text-small font-semibold text-ink-2">{programme ? `${hm(programme.starts)} to ${hm(programme.ends)}` : ''}{klass ? `, class ${klass.name}` : ''}</p>
            </div>
            <Button size="md" variant="secondary" onClick={() => setSheet('programme')}>Change</Button>
          </div>
          {programme && (
            <div className="grid grid-cols-2 gap-2.5">
              {(['dropoff', 'pickup'] as const).map((d) => {
                const [from, to] = programme.flexible ? [programme.starts, programme.ends] : d === 'dropoff' ? [programme.dropoff_from, programme.dropoff_to] : [programme.pickup_from, programme.pickup_to]
                const usual = regular[0]?.[d]
                return (
                  <div key={d} className="rounded-lg bg-sunken px-3.5 py-2.5">
                    <p className="kicker">{d === 'dropoff' ? 'Drop-off' : 'Pickup'}</p>
                    <p className="mt-0.5 text-h4 tabular-nums">{hm(from)} to {hm(to)}</p>
                    {usual && <p className="text-caption font-semibold text-ink-2">Usually {hm(usual)}</p>}
                  </div>
                )
              })}
            </div>
          )}
          <div>
            <p className="kicker">Coordinators for {klass?.name ?? 'this class'}</p>
            <p className={`mt-1 text-small font-bold ${coordinators.length ? '' : 'text-warning'}`}>{coordinators.length ? coordinators.map((c) => c.full_name).join(', ') : 'Nobody yet, so it is announced to everyone'}</p>
          </div>
        </section>

        <section className="card grid gap-2 rounded-2xl p-5" aria-labelledby="people-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="people-h" className="kicker">Parents and family</h3>
            <Button size="md" variant="secondary" icon={<UserPlus />} onClick={() => setSheet('add')}>Add a parent or relative</Button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-small font-bold text-ink-2 [&_svg]:size-4"><UserRound aria-hidden />Parents</p>
          {parents.length ? <ul className="divide-y divide-line">{parents.map(row)}</ul> : <p className="text-small font-semibold text-ink-3">No parent added.</p>}
          <p className="mt-2 flex items-center gap-1.5 text-small font-bold text-ink-2 [&_svg]:size-4"><Heart aria-hidden />Family who can collect</p>
          {family.length ? <ul className="divide-y divide-line">{family.map(row)}</ul> : <p className="text-small font-semibold text-ink-3">Nobody yet. If the parents live abroad, add the family {first} lives with.</p>}
          {parents.some((x) => x.p.abroad) && <Pill icon={<Globe />} className="mt-1">A parent lives outside India: they get every update, and the family here collects</Pill>}
          <p className="mt-2 text-caption font-semibold text-ink-3">Parents and family collect from the gate without a link. Switching access off signs that person out everywhere at once. The last person can't be removed.</p>
        </section>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Button size="md" variant="secondary" icon={<Pencil />} onClick={() => { setEdit({ name: child.full_name, called: child.preferred_name ?? '', dob: child.date_of_birth }); setEditErrors({}); setError(null); setSheet('edit') }}>Edit details</Button>
        <Button size="md" variant="danger" icon={<LogOut />} className="ml-auto" onClick={() => { setError(null); setPending({ kind: 'left' }) }}>{first} has left the school</Button>
      </div>

      {sheet === 'programme' && (
        <ProgrammePicker open onClose={() => setSheet(null)} programmes={dir.programmes} childName={first} dateOfBirth={child.date_of_birth} initial={child.programme_id}
          onPick={(id) => void run(() => updateChild(child.id, { programme_id: id }), `${first} is now in ${dir.programmes.find((p) => p.id === id)?.name}.`)
            .then((ok) => ok || toast("Couldn't change the programme. Check the connection and try again."))} />
      )}
      {sheet === 'add' && <AddGuardianSheet open dir={dir} child={child} onClose={() => setSheet(null)} onSaved={(m) => void onChanged().then(() => { setSheet(null); toast(m) })} />}
      <Sheet open={sheet === 'edit'} onClose={() => setSheet(null)} title="Edit details" description="Changes show everywhere at once.">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Full name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} error={editErrors.name} />
            <TextField label="Called at school" value={edit.called} onChange={(e) => setEdit({ ...edit, called: e.target.value })} />
          </div>
          <TextField label="Date of birth" type="date" value={edit.dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setEdit({ ...edit, dob: e.target.value })} error={editErrors.dob}
            hint={edit.dob ? formatAge(edit.dob) : undefined} />
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
        <SheetFooter><Button size="xl" className="w-full" loading={busy} onClick={saveEdit}>Save</Button></SheetFooter>
      </Sheet>

      <Confirm open={pending?.kind === 'access'} busy={busy} error={error} icon={<Lock />} onNo={() => setPending(null)}
        title={pending?.kind === 'access' ? `Turn off app access for ${pending.person.full_name.split(' ')[0]}?` : ''}
        body={pending?.kind === 'access' ? `${pending.person.full_name.split(' ')[0]} is signed out everywhere at once. They stay listed, so the gate can still hand ${first} over to them.` : ''}
        action="Turn off access" onYes={() => pending?.kind === 'access' && void run(() => setAppAccess(pending.person.id, false), `${pending.person.full_name.split(' ')[0]} is signed out everywhere.`)} />
      <Confirm open={pending?.kind === 'remove'} busy={busy} error={error} icon={<Trash2 />} onNo={() => setPending(null)}
        title={pending?.kind === 'remove' ? `Remove ${pending.person.full_name.split(' ')[0]} from ${first}'s record?` : ''}
        body={`They can no longer collect ${first} from the gate or see ${first} in the app. Their other children stay as they are.`}
        action="Remove" onYes={() => pending?.kind === 'remove' && void run(() => removeGuardian(child.id, pending.person.id), `${pending.person.full_name.split(' ')[0]} is no longer listed for ${first}.`)} />
      <Confirm open={pending?.kind === 'left'} busy={busy} error={error} icon={<LogOut />} onNo={() => setPending(null)}
        title={`${first} has left the school?`}
        body={`${first} leaves every list today. Attendance is kept for the school's records. Parents with no other child here lose app access.`}
        action={`Yes, ${first} has left`} onYes={() => void run(() => childLeft(child.id), `${first} has been removed from today's lists.`).then((ok) => ok && onBack())} />
    </div>
  )
}
