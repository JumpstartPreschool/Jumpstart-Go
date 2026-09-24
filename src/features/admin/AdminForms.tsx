import { useState, type FormEvent, type ReactNode } from 'react'
import { ChevronRight, Link2, Mail, Phone, UserPlus, UserRound, X } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { SelectField, TextField } from '../../ui/Field'
import { SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { childColor } from '../../ui/childColor'
import { normalizeEmail, normalizeMobile } from '../../domain/contact'
import type { StaffRole } from '../auth/session'
import { AREA_ICON, AREA_LABEL } from '../auth/AreaShell'
import { addChild, addPerson, explainDbError, type ClassRow, type Directory } from './api'
import { formatAge, levelOf } from './programmeCatalogue'
import { LEVEL_ICON, ProgrammePicker } from './ProgrammePicker'

const ROLES: StaffRole[] = ['admin', 'core', 'coordinator']
const ROLE_HELP: Record<StaffRole, string> = {
  admin: 'Everything: people, roles, settings and reports',
  core: 'Programme timings, children’s times and attendance',
  coordinator: 'The gate on an iPad: announcements and handovers',
}
const RELATIONS = ['Mother', 'Father', 'Grandmother', 'Grandfather', 'Guardian']

/** A titled group of fields inside a form. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4">
      <legend className="kicker mb-3">{title}</legend>
      {children}
    </fieldset>
  )
}

/** Add a parent or a staff member (PRO-1, PRO-4). An email or a mobile is needed so they can sign in. */
export function AddPersonForm({ kind, onDone }: { kind: 'parent' | 'staff'; onDone: (name: string) => void | Promise<void> }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [roles, setRoles] = useState<StaffRole[]>(kind === 'staff' ? ['coordinator'] : [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    const cleanEmail = email.trim() ? normalizeEmail(email) : null
    const cleanPhone = phone.trim() ? normalizeMobile(phone) : null
    if (name.trim().length < 2) next.name = 'Enter their full name.'
    if (email.trim() && !cleanEmail) next.email = 'This email address looks incomplete.'
    if (phone.trim() && !cleanPhone) next.phone = 'Enter a 10-digit Indian mobile number.'
    if (!email.trim() && !phone.trim()) next.email = 'Add an email so they can sign in.'
    if (kind === 'staff' && roles.length === 0) next.roles = 'Choose at least one role.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await addPerson({ fullName: name, email: cleanEmail, phone: cleanPhone, roles: kind === 'staff' ? roles : [] })
      await onDone(name.trim())
    } catch (err) {
      setErrors({ form: explainDbError(err as { code?: string }) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <TextField label="Full name" icon={<UserRound aria-hidden />} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
      <TextField label="Email" icon={<Mail aria-hidden />} type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)}
        error={errors.email} hint="They sign in with a code sent here." />
      <TextField label="Mobile (optional)" icon={<Phone aria-hidden />} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
      {kind === 'staff' && (
        <fieldset>
          <legend className="mb-2 px-0.5 text-small font-bold text-ink-2">Roles</legend>
          <div className="grid gap-2.5">
            {ROLES.map((r) => {
              const on = roles.includes(r)
              return (
                <button key={r} type="button" role="checkbox" aria-checked={on} onClick={() => setRoles(on ? roles.filter((x) => x !== r) : [...roles, r])}
                  className="choice flex items-center gap-3.5 p-3.5">
                  <span className={`grid size-11 shrink-0 place-items-center rounded-sm [&_svg]:size-[22px] ${on ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-2'}`} aria-hidden>{AREA_ICON[r]}</span>
                  <span className="min-w-0">
                    <span className="block text-h4">{AREA_LABEL[r]}</span>
                    <span className="block text-small font-semibold text-ink-2">{ROLE_HELP[r]}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {errors.roles && <p className="mt-2 px-0.5 text-small font-bold text-danger" role="alert">{errors.roles}</p>}
        </fieldset>
      )}
      {errors.form && <Notice tone="danger">{errors.form}</Notice>}
      <SheetFooter>
        <Button type="submit" size="xl" className="w-full" icon={<UserPlus />} loading={busy}>
          {kind === 'staff' ? 'Add staff member' : 'Add parent'}
        </Button>
      </SheetFooter>
    </form>
  )
}

/** Add a child with their programme, class group and guardians in one step (PRO-1, PRO-2, D19). */
export function AddChildForm({ directory, onDone, onClassAdded }: { directory: Directory; onDone: (name: string) => void | Promise<void>; onClassAdded: (c: ClassRow) => void }) {
  const [name, setName] = useState('')
  const [preferred, setPreferred] = useState('')
  const [dob, setDob] = useState('')
  const [pick, setPick] = useState<{ programmeId?: string; classId?: string }>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [guardians, setGuardians] = useState<Array<{ guardian_id: string; relation: string }>>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  // Anyone active can be a guardian: staff members are sometimes parents too.
  const parents = directory.profiles.filter((p) => p.active)
  const unlinked = parents.filter((p) => !guardians.some((g) => g.guardian_id === p.id))
  const programme = directory.programmes.find((p) => p.id === pick.programmeId)
  const klass = directory.classes.find((c) => c.id === pick.classId)
  const today = new Date().toISOString().slice(0, 10)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (name.trim().length < 2) next.name = "Enter the child's full name."
    if (!dob) next.dob = 'Enter the date of birth.'
    else if (dob > today) next.dob = 'The date of birth cannot be in the future.'
    if (!pick.programmeId || !pick.classId) next.programme = 'Choose the programme and class group.'
    if (guardians.length === 0) next.guardians = 'Link at least one parent or guardian.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await addChild({ fullName: name, preferredName: preferred, dateOfBirth: dob, classId: pick.classId!, programmeId: pick.programmeId!, guardians })
      await onDone(name.trim())
    } catch (err) {
      setErrors({ form: explainDbError(err as { code?: string; message?: string }) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="grid gap-8">
        <Section title="The child">
          <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Called at school (optional)" placeholder="e.g. Aaru" value={preferred} onChange={(e) => setPreferred(e.target.value)} />
            <TextField label="Date of birth" type="date" max={today} value={dob} onChange={(e) => setDob(e.target.value)} error={errors.dob}
              hint={dob && dob <= today ? `${formatAge(dob)} today` : undefined} />
          </div>
        </Section>

        <Section title="Programme">
          <div className="grid gap-1.5">
            <button type="button" onClick={() => setPickerOpen(true)} aria-describedby={errors.programme ? 'programme-msg' : undefined}
              className={`choice flex w-full items-center gap-3.5 p-3.5 ${errors.programme ? '[--edge:var(--danger)]' : ''}`}>
              {programme && klass ? (
                <>
                  <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent [&_svg]:size-[22px]" aria-hidden>{LEVEL_ICON[levelOf(programme).level]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-h4">{programme.name}</span>
                    <span className="block text-small font-semibold text-ink-2">Class group: {klass.name}</span>
                  </span>
                  <span className="text-small font-bold text-accent-ink">Change</span>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 text-h4 text-ink-2">Choose the programme and class group</span>
                  <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
                </>
              )}
            </button>
            {errors.programme && <p id="programme-msg" className="px-0.5 text-small font-bold text-danger" role="alert">{errors.programme}</p>}
          </div>
        </Section>

        <Section title="Parents and guardians">
          {guardians.length > 0 && (
            <ul className="grid gap-2">
              {guardians.map((g, i) => {
                const person = parents.find((p) => p.id === g.guardian_id)
                return (
                  <li key={g.guardian_id} className="flex flex-wrap items-center gap-3 rounded-lg bg-sunken p-2.5 pl-3">
                    <Avatar name={person?.full_name ?? '?'} color={childColor(g.guardian_id)} size="sm" />
                    <span className="min-w-0 flex-1 basis-[140px] truncate text-h4">{person?.full_name}</span>
                    <label className="input input--sm w-[150px] bg-surface">
                      <select aria-label={`How ${person?.full_name} is related`} value={g.relation}
                        onChange={(e) => setGuardians(guardians.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)))}>
                        {RELATIONS.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </label>
                    <Button size="md" variant="quiet" icon={<X />} aria-label={`Remove ${person?.full_name}`} onClick={() => setGuardians(guardians.filter((_, j) => j !== i))} />
                  </li>
                )
              })}
            </ul>
          )}
          {unlinked.length > 0 ? (
            <SelectField label={guardians.length ? 'Link another parent' : 'Link a parent already added'} icon={<Link2 aria-hidden />} value="" error={errors.guardians}
              onChange={(e) => e.target.value && setGuardians([...guardians, { guardian_id: e.target.value, relation: guardians.length === 0 ? 'Mother' : 'Father' }])}>
              <option value="">Choose a parent</option>
              {unlinked.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.email ? `, ${p.email}` : ''}</option>)}
            </SelectField>
          ) : (
            <Notice>Add the parents first (Parents tab), then link them here.</Notice>
          )}
        </Section>

        {errors.form && <Notice tone="danger">{errors.form}</Notice>}
        <SheetFooter>
          <Button type="submit" size="xl" className="w-full" icon={<UserPlus />} loading={busy}>Add child</Button>
        </SheetFooter>
      </form>

      {/* Outside the form, so Enter in the picker's "new class" box doesn't submit the child. */}
      <ProgrammePicker
        key={pickerOpen ? 'open' : 'closed'}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(v) => { setPick(v); setPickerOpen(false); setErrors((e) => ({ ...e, programme: '' })) }}
        programmes={directory.programmes}
        classes={directory.classes}
        onClassAdded={onClassAdded}
        childName={name}
        dateOfBirth={dob}
        initial={pick}
      />
    </>
  )
}
