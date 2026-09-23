import { useState, type FormEvent } from 'react'
import { Check, ChevronRight, Plus, UserPlus, X } from 'lucide-react'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/Field'
import { normalizeEmail, normalizeIndianMobile } from '../../domain/contact'
import type { StaffRole } from '../auth/session'
import { AREA_LABEL } from '../auth/AreaShell'
import { addChild, addPerson, explainDbError, type ClassRow, type Directory } from './api'
import { formatAge } from './programmeCatalogue'
import { ProgrammePicker } from './ProgrammePicker'

const ROLES: StaffRole[] = ['admin', 'core', 'coordinator']
const ROLE_HELP: Record<StaffRole, string> = {
  admin: 'Everything: people, roles, settings and reports',
  core: 'Programme timings, children’s times and attendance',
  coordinator: 'The gate on an iPad: announcements and handovers',
}
const RELATIONS = ['Mother', 'Father', 'Grandmother', 'Grandfather', 'Guardian']

/** Add a parent or a staff member (PRO-1, PRO-4). An email or a mobile is needed so they can sign in. */
export function AddPersonForm({ kind, onDone }: { kind: 'parent' | 'staff'; onDone: () => void }) {
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
    const cleanPhone = phone.trim() ? normalizeIndianMobile(phone) : null
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
      onDone()
    } catch (err) {
      setErrors({ form: explainDbError(err as { code?: string }) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <TextField label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
      <TextField label="Email" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)}
        error={errors.email} hint="They sign in with a code sent here." />
      <TextField label="Mobile (optional)" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
      {kind === 'staff' && (
        <fieldset>
          <legend className="mb-1.5 px-1 text-[14px] font-extrabold text-ink-2">Roles</legend>
          <div className="grid gap-2">
            {ROLES.map((r) => {
              const on = roles.includes(r)
              return (
                <button key={r} type="button" role="checkbox" aria-checked={on} onClick={() => setRoles(on ? roles.filter((x) => x !== r) : [...roles, r])}
                  className={`flex items-center gap-3 rounded-[20px] p-3.5 text-left transition-transform duration-200 ease-spring active:scale-[0.98] ${on ? 'bg-[color-mix(in_oklab,var(--accent)_12%,var(--glass-strong))] ring-2 ring-accent' : 'card'}`}>
                  <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${on ? 'bg-accent text-white' : 'bg-sunken'}`} aria-hidden>{on && <Check className="size-4" />}</span>
                  <span>
                    <span className="block text-[16px] font-extrabold">{AREA_LABEL[r]}</span>
                    <span className="block text-[13px] font-semibold text-ink-2">{ROLE_HELP[r]}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {errors.roles && <p className="mt-1.5 px-1 text-[14px] font-bold text-danger" role="alert">{errors.roles}</p>}
        </fieldset>
      )}
      {errors.form && <p className="rounded-[16px] bg-danger-soft px-4 py-3 text-[15px] font-bold text-danger" role="alert">{errors.form}</p>}
      <Button type="submit" size="xl" className="w-full" icon={<UserPlus />} loading={busy}>
        {kind === 'staff' ? 'Add staff member' : 'Add parent'}
      </Button>
    </form>
  )
}

/** Add a child with their programme, class group and guardians in one step (PRO-1, PRO-2, D19). */
export function AddChildForm({ directory, onDone, onClassAdded }: { directory: Directory; onDone: () => void; onClassAdded: (c: ClassRow) => void }) {
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
      onDone()
    } catch (err) {
      setErrors({ form: explainDbError(err as { code?: string; message?: string }) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <form onSubmit={submit} noValidate className="grid gap-4">
      <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Called at school (optional)" placeholder="e.g. Aaru" value={preferred} onChange={(e) => setPreferred(e.target.value)} />
        <TextField label="Date of birth" type="date" max={today} value={dob} onChange={(e) => setDob(e.target.value)} error={errors.dob}
          hint={dob && dob <= today ? `${formatAge(dob)} today` : undefined} />
      </div>

      <div>
        <p className="mb-1.5 px-1 text-[14px] font-extrabold text-ink-2">Programme and class</p>
        <button type="button" onClick={() => setPickerOpen(true)}
          className={`card flex w-full items-center gap-4 rounded-[22px] p-4 text-left transition-transform duration-200 ease-spring active:scale-[0.99] ${errors.programme ? 'shadow-[0_0_0_2px_var(--danger)]' : ''}`}>
          {programme && klass ? (
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[19px] font-bold">{programme.name}</span>
              <span className="block text-[14px] font-semibold text-ink-2">Class group: {klass.name}</span>
            </span>
          ) : (
            <span className="flex-1 text-[16px] font-bold text-ink-2">Choose the programme, plan and class group</span>
          )}
          <ChevronRight className="size-5 text-ink-3" aria-hidden />
        </button>
        {errors.programme && <p className="mt-1.5 px-1 text-[14px] font-bold text-danger" role="alert">{errors.programme}</p>}
      </div>

      <fieldset>
        <legend className="mb-1.5 px-1 text-[14px] font-extrabold text-ink-2">Parents and guardians</legend>
        {guardians.map((g, i) => {
          const person = parents.find((p) => p.id === g.guardian_id)
          return (
            <div key={g.guardian_id} className="card mb-2 flex items-center gap-2 rounded-[20px] p-2 pl-4">
              <span className="min-w-0 flex-1 truncate text-[16px] font-extrabold">{person?.full_name}</span>
              <select aria-label={`Relation of ${person?.full_name}`} value={g.relation}
                onChange={(e) => setGuardians(guardians.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)))}
                className="h-10 rounded-full bg-sunken px-3 text-[14px] font-bold">
                {RELATIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
              <Button size="md" variant="quiet" icon={<X />} aria-label={`Remove ${person?.full_name}`} onClick={() => setGuardians(guardians.filter((_, j) => j !== i))} />
            </div>
          )
        })}
        {parents.filter((p) => !guardians.some((g) => g.guardian_id === p.id)).length > 0 ? (
          <select aria-label="Add a parent or guardian" value="" onChange={(e) => e.target.value && setGuardians([...guardians, { guardian_id: e.target.value, relation: guardians.length === 0 ? 'Mother' : 'Father' }])}
            className="card h-12 w-full rounded-full px-4 text-[15px] font-bold text-ink-2">
            <option value="">+ Link a parent already added…</option>
            {parents.filter((p) => !guardians.some((g) => g.guardian_id === p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}{p.email ? ` · ${p.email}` : ''}</option>
            ))}
          </select>
        ) : (
          <p className="px-1 text-[14px] font-semibold text-ink-2">
            <Plus className="mr-1 inline size-4" aria-hidden />Add the parents first (Parents tab), then link them here.
          </p>
        )}
        {errors.guardians && <p className="mt-1.5 px-1 text-[14px] font-bold text-danger" role="alert">{errors.guardians}</p>}
      </fieldset>

      {errors.form && <p className="rounded-[16px] bg-danger-soft px-4 py-3 text-[15px] font-bold text-danger" role="alert">{errors.form}</p>}
      <Button type="submit" size="xl" className="w-full" icon={<UserPlus />} loading={busy}>Add child</Button>
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
