import { useState } from 'react'
import { Check, Lock, Mail, Smartphone, UserPlus } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/Field'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { normalizeEmail, normalizeMobile } from '../../domain/contact'
import type { StaffRole } from '../auth/session'
import { setCoordinator } from '../coordinators/api'
import { addPerson, explainDbError, updatePerson, type Directory, type Profile } from './api'
import { ROLE } from './roles'

const GIVEN: StaffRole[] = ['core', 'pro', 'coordinator']

/**
 * Add a staff member: name, email for the sign-in code, roles and (for coordinators) their classes. Admin is shown
 * locked: only Ankit Singh and Aditya Tapadia hold it (D27), and the database refuses it from the app.
 */
export function StaffSheet({ dir, open, onClose, onSaved }: { dir: Directory; open: boolean; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [classes, setClasses] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  async function save() {
    const e: Record<string, string> = {}
    const cleanEmail = normalizeEmail(email)
    const cleanPhone = phone.trim() ? normalizeMobile(phone) : null
    if (name.trim().split(/\s+/).length < 2) e.name = 'Enter the first and last name.'
    if (!cleanEmail) e.email = 'Enter a full email address.'
    else if (dir.profiles.some((p) => p.email === cleanEmail)) e.email = 'Someone at the school already has this email.'
    if (phone.trim() && !cleanPhone) e.phone = '10-digit mobile, or + and a country code.'
    if (!roles.length) e.roles = 'Choose at least one role.'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    setFormError(null)
    try {
      const id = await addPerson({ fullName: name.trim().replace(/\s+/g, ' '), email: cleanEmail, phone: cleanPhone, roles })
      if (roles.includes('coordinator') && classes.length) {
        try {
          await setCoordinator(id, classes)
        } catch {
          return onSaved(`${name.trim().split(' ')[0]} added, but their classes weren't saved. Choose them in Center leaders.`)
        }
      }
      onSaved(`${name.trim().split(' ')[0]} added. They sign in with a code sent to ${cleanEmail}.`)
    } catch (err) {
      setFormError(explainDbError(err as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add a staff member" description="They sign in with a code sent to this email. Nobody else can sign up.">
      <div className="grid gap-4">
        <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="off" error={errors.name} autoFocus />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Email, for the sign-in code" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} icon={<Mail aria-hidden />} value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          <TextField label="Mobile (optional)" type="tel" inputMode="tel" icon={<Smartphone aria-hidden />} value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
        </div>
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
        {roles.includes('coordinator') && (
          <fieldset>
            <legend className="mb-2 px-0.5 text-small font-bold text-ink-2">Center leader classes</legend>
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

/** Edit a staff member's name, email and mobile. A new email moves their sign-in, so their next code goes there. */
export function EditStaffSheet({ dir, person, onClose, onSaved }: { dir: Directory; person: Profile; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(person.full_name)
  const [email, setEmail] = useState(person.email ?? '')
  const [phone, setPhone] = useState(person.phone ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const first = person.full_name.split(' ')[0]
  async function save() {
    const e: Record<string, string> = {}
    const mail = normalizeEmail(email)
    const mobile = phone.trim() ? normalizeMobile(phone) : null
    if (name.trim().split(/\s+/).length < 2) e.name = 'First and last name.'
    if (!mail) e.email = 'An email is needed: the sign-in code goes there.'
    else if (dir.profiles.some((x) => x.id !== person.id && x.email === mail)) e.email = 'Someone else here already uses this email.'
    if (phone.trim() && !mobile) e.phone = '10-digit mobile, or + and a country code.'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      await updatePerson(person.id, null, { full_name: name.trim(), email: mail, phone: mobile, app_access: true })
      onSaved(person.user_id && mail !== person.email ? `Saved. ${first}'s sign-in code now goes to ${mail}.` : 'Saved.')
    } catch (err) {
      setErrors({ form: explainDbError(err as { code?: string; message?: string }) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open onClose={onClose} title={`Edit ${first}`} description="Roles and classes are changed in Center leaders; the details are here.">
      <div className="grid gap-4">
        <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" error={errors.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Email, for the sign-in code" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} icon={<Mail aria-hidden />} value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          <TextField label="Mobile (optional)" type="tel" inputMode="tel" icon={<Smartphone aria-hidden />} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" error={errors.phone} />
        </div>
        {person.user_id && normalizeEmail(email) && normalizeEmail(email) !== person.email && <Notice>{first} has signed in before. From now on their sign-in code goes to the new email.</Notice>}
        {errors.form && <Notice tone="danger">{errors.form}</Notice>}
      </div>
      <SheetFooter><Button size="xl" className="w-full" icon={<Check />} loading={busy} onClick={() => void save()}>Save changes</Button></SheetFooter>
    </Sheet>
  )
}
