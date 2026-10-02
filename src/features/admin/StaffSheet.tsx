import { Link } from 'react-router'
import { useState } from 'react'
import { Check, Lock, Smartphone, UserPlus } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/Field'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { formatMobile, normalizeMobile } from '../../domain/contact'
import type { StaffRole } from '../auth/session'
import { gateRolesOf, setCoordinator } from '../coordinators/api'
import { addPerson, explainDbError, updatePerson, type Directory, type Profile } from './api'
import { ROLE } from './roles'

const GIVEN: StaffRole[] = ['core', 'pro', 'coordinator', 'leader']

/**
 * Add a staff member: name, mobile for the sign-in code, roles and (for coordinators) their classes. Admin is shown
 * locked: only Ankit Singh and Aditya Tapadia hold it (D27), and the database refuses it from the app.
 */
export function StaffSheet({ dir, open, onClose, onSaved, initialRoles = [] }: { dir: Directory; open: boolean; onClose: () => void; onSaved: (message: string) => void; initialRoles?: StaffRole[] }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [roles, setRoles] = useState<StaffRole[]>(initialRoles)
  const [classes, setClasses] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  async function save() {
    const e: Record<string, string> = {}
    const cleanPhone = phone.trim() ? normalizeMobile(phone) : null
    if (name.trim().split(/\s+/).length < 2) e.name = 'Enter the first and last name.'
    if (!cleanPhone) e.phone = phone.trim() ? '10-digit mobile, or + and a country code.' : 'A mobile is needed: the sign-in code goes there.'
    else if (dir.profiles.some((p) => p.phone === cleanPhone)) e.phone = 'Someone at the school already has this mobile.'
    if (!roles.length) e.roles = 'Choose at least one role.'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    setFormError(null)
    try {
      const id = await addPerson({ fullName: name.trim().replace(/\s+/g, ' '), phone: cleanPhone!, roles })
      const gate = gateRolesOf(roles)[0]
      if (gate && classes.length) {
        try {
          await setCoordinator(id, classes, gate)
        } catch {
          return onSaved(`${name.trim().split(' ')[0]} added, but their classes weren't saved. Choose them in Gate team.`)
        }
      }
      onSaved(`${name.trim().split(' ')[0]} added. They sign in with a code sent on WhatsApp to ${formatMobile(cleanPhone!)}.`)
    } catch (err) {
      setFormError(explainDbError(err as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add a staff member" description="They sign in with a code sent on WhatsApp to this mobile. Nobody else can sign up.">
      <div className="grid gap-4">
        <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="off" error={errors.name} autoFocus />
        <TextField label="Mobile, for the sign-in code" type="tel" inputMode="tel" icon={<Smartphone aria-hidden />} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" hint="With a country code if they are abroad, for example +971 50 123 4567." error={errors.phone} />
        <fieldset>
          <legend className="mb-2 px-0.5 text-small font-bold text-ink-2">Roles, one or more</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="choice flex items-center gap-3 p-3.5 opacity-70" aria-disabled="true">
              <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-sunken text-ink-3 [&_svg]:size-[22px]" aria-hidden><Lock /></span>
              <span className="min-w-0"><span className="block text-h4">Admin</span><span className="block text-small font-semibold text-ink-2">Only Ankit Singh and Aditya Tapadia</span></span>
            </div>
            {GIVEN.map((r) => {
              const on = roles.includes(r)
              return (
                <button key={r} type="button" role="checkbox" aria-checked={on} onClick={() => setRoles(toggle(roles, r))} className="choice flex items-center gap-3 p-3.5 text-left">
                  <span className={`grid size-11 shrink-0 place-items-center rounded-sm [&_svg]:size-[22px] ${on ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-2'}`} aria-hidden>{ROLE[r].icon}</span>
                  <span className="min-w-0"><span className="block text-h4">{ROLE[r].name}</span><span className="block text-small font-semibold text-ink-2">{ROLE[r].does}</span></span>
                </button>
              )
            })}
          </div>
          {errors.roles && <p className="mt-2 px-0.5 text-small font-bold text-danger" role="alert">{errors.roles}</p>}
        </fieldset>
        {gateRolesOf(roles).length > 0 && (
          <fieldset>
            <legend className="mb-2 px-0.5 text-small font-bold text-ink-2">Gate classes</legend>
            <div className="flex flex-wrap gap-2.5">
              {dir.classes.filter((c) => c.active).map((c) => (
                <button key={c.id} type="button" role="checkbox" aria-checked={classes.includes(c.id)} onClick={() => setClasses(toggle(classes, c.id))} className="choice h-12 px-4 text-h4">{c.name}</button>
              ))}
            </div>
          </fieldset>
        )}
        {formError && <Notice tone="danger">{formError}</Notice>}
      </div>
      <SheetFooter>
        <Button size="xl" className="w-full" icon={<UserPlus />} loading={busy} onClick={() => void save()}>Add {name.trim().split(' ')[0] || 'staff member'}</Button>
      </SheetFooter>
    </Sheet>
  )
}

/** Edit a staff member's name and mobile. A new mobile moves their sign-in, so their next code goes there. */
export function EditStaffSheet({ dir, person, onClose, onSaved }: { dir: Directory; person: Profile; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(person.full_name)
  const [phone, setPhone] = useState(person.phone ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const first = person.full_name.split(' ')[0]
  async function save() {
    const e: Record<string, string> = {}
    const mobile = phone.trim() ? normalizeMobile(phone) : null
    if (name.trim().split(/\s+/).length < 2) e.name = 'First and last name.'
    if (!mobile) e.phone = phone.trim() ? '10-digit mobile, or + and a country code.' : 'A mobile is needed: the sign-in code goes there.'
    else if (dir.profiles.some((x) => x.id !== person.id && x.phone === mobile)) e.phone = 'Someone else here already uses this mobile.'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      await updatePerson(person.id, null, { full_name: name.trim(), email: person.email, phone: mobile!, app_access: true })
      onSaved(person.user_id && mobile !== person.phone ? `Saved. ${first}'s sign-in code now goes to ${formatMobile(mobile!)}.` : 'Saved.')
    } catch (err) {
      setErrors({ form: explainDbError(err as { code?: string; message?: string }) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open onClose={onClose} title={`Edit ${first}`} description={<>Their details are here. <Link to="/admin/coordinators" className="font-extrabold text-accent-ink underline underline-offset-2">Change gate roles and classes in Gate team</Link>.</>}>
      <div className="grid gap-4">
        <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" error={errors.name} />
        <TextField label="Mobile, for the sign-in code" type="tel" inputMode="tel" icon={<Smartphone aria-hidden />} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" error={errors.phone} />
        {person.user_id && phone.trim() && normalizeMobile(phone) && normalizeMobile(phone) !== person.phone && <Notice>{first} has signed in before. From now on they sign in with the new mobile.</Notice>}
        {errors.form && <Notice tone="danger">{errors.form}</Notice>}
      </div>
      <SheetFooter><Button size="xl" className="w-full" icon={<Check />} loading={busy} onClick={() => void save()}>Save changes</Button></SheetFooter>
    </Sheet>
  )
}
