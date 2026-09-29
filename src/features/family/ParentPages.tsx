import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CalendarDays, CalendarX, Check, MessageSquare, ChevronLeft, CircleCheck, Eye, Globe, House, LogOut, Megaphone, Navigation, Phone, Plus, School, Trash2, UserPlus, X } from '../../ui/icons'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { SelectField, TextField } from '../../ui/Field'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { EmptyState, ErrorState, Notice, SkeletonList } from '../../ui/States'
import { Switch } from '../../ui/Switch'
import { useToast } from '../../ui/Toast'
import { addDays, daysBetween, RangeCalendar, shortDate, type Range } from '../../ui/RangeCalendar'
import { childColor } from '../../ui/childColor'
import { SignOutButton } from '../../ui/SignOutButton'
import { formatMobile, normalizeMobile } from '../../domain/contact'
import { supabase } from '../../lib/supabase'
import { AreaShell } from '../auth/AreaShell'
import { useSession } from '../auth/session'
import { explainDbError } from '../admin/api'
import { todayInIndia, useTodayTrips, type Trip } from '../trips/api'
import { clockTime } from '../trips/rules'
import { addRelative, markAnnouncementRead, myFamily, removeRelative, removeSavedPerson, reportAbsenceRange, savePerson, setMyNotifications, useLive, type Announcement, type FamilyMember, type SavedPerson } from '../school/api'
import { Thread } from '../school/Messages'
import { PushSwitch } from '../notifications/PushSwitch'
import { useMyAnnouncements, useMyClasses, useMyId } from './parentData'

interface Kid { id: string; full_name: string; preferred_name: string | null; gender?: string | null }
const first = (k: Kid) => k.preferred_name ?? k.full_name.split(' ')[0]!

/** This parent's own children (a staff member may be a parent too). */
function useMyKids() {
  const me = useMyId()
  return useLive<Kid>(['children', 'guardianships'], () =>
    supabase.from('children').select('id, full_name, preferred_name, gender, guardianships!inner(guardian_id)').eq('active', true).eq('guardianships.guardian_id', me ?? '').order('full_name'), [me])
}

// ---- Updates ------------------------------------------------------------------------------------------------------------

interface Update { key: string; at: string; icon: ReactNode; tone: string; title: string; text: string; announcement?: Announcement; unread?: boolean }

/** Today's trips as the parent's feed: sent, seen, ready, collected, checked in, cancelled. */
function tripUpdates(t: Trip, kid: Kid, me: string | null): Update[] {
  const who = t.created_by === me ? 'You' : t.traveller_name.split(' ')[0]!
  const word = t.direction === 'pickup' ? 'pickup' : 'drop-off'
  const out: Update[] = [{ key: `${t.id}-sent`, at: t.created_at, icon: <Navigation />, tone: 'bg-accent-soft text-accent-ink', title: `${first(kid)}'s ${word}: on the way`, text: `${who}, about ${clockTime(t.arrive_at)}${t.phoned_in_by ? ', phoned in to the school' : ''}.` }]
  if (t.acknowledged_at) out.push({ key: `${t.id}-seen`, at: t.acknowledged_at, icon: <Eye />, tone: 'bg-accent-soft text-accent-ink', title: 'The school has seen it', text: `They're getting ${first(kid)} ready.` })
  if (t.ready_at) out.push({ key: `${t.id}-ready`, at: t.ready_at, icon: <CircleCheck />, tone: 'bg-live-soft text-live', title: `${first(kid)} is ready at the gate`, text: `Ready at ${clockTime(t.ready_at)}.` })
  if (t.closed_at && t.status === 'handed_over') out.push({ key: `${t.id}-done`, at: t.closed_at, icon: <House />, tone: 'bg-live-soft text-live', title: `${first(kid)} has been collected`, text: `At ${clockTime(t.closed_at)}${t.handed_to_name ? `, by ${t.handed_to_name.split(' ')[0]}` : ''}.` })
  if (t.closed_at && t.status === 'checked_in') out.push({ key: `${t.id}-in`, at: t.closed_at, icon: <School />, tone: 'bg-live-soft text-live', title: `${first(kid)} checked in`, text: `At ${clockTime(t.closed_at)}.` })
  if (t.closed_at && t.status === 'cancelled') out.push({ key: `${t.id}-x`, at: t.closed_at, icon: <X />, tone: 'bg-sunken text-ink-2', title: `${first(kid)}'s ${word} cancelled`, text: 'The gate has been told.' })
  return out
}

export function ParentUpdates() {
  const me = useMyId()
  const kids = useMyKids()
  const trips = useTodayTrips()
  const ann = useMyAnnouncements()
  const [open, setOpen] = useState<Announcement | null>(null)
  const list: Update[] | null = kids.rows && trips.trips && ann.list ? [
    ...trips.trips.flatMap((t) => { const k = kids.rows!.find((x) => x.id === t.child_id); return k ? tripUpdates(t, k, me) : [] }),
    ...ann.list.map((a) => ({ key: a.id, at: a.created_at, icon: <Megaphone />, tone: 'bg-warning-soft text-warning', title: a.title, text: a.body, announcement: a, unread: !ann.read.has(a.id) })),
  ].sort((a, b) => b.at.localeCompare(a.at)) : null

  async function openAnnouncement(a: Announcement) {
    setOpen(a)
    if (!ann.read.has(a.id)) { await markAnnouncementRead(a.id).catch(() => {}); ann.reload() }
  }
  async function readAll() {
    await Promise.all((ann.list ?? []).filter((a) => !ann.read.has(a.id)).map((a) => markAnnouncementRead(a.id).catch(() => {})))
    ann.reload()
  }

  return (
    <AreaShell area="parent" title="Updates" actions={ann.unread > 0 && <Button variant="quiet" icon={<Check />} onClick={() => void readAll()}>Mark all read</Button>}>
      <section className="mt-6" aria-busy={!list}>
        {ann.error || trips.error ? <ErrorState title="Couldn't load updates" onRetry={() => { ann.reload(); void trips.reload() }}>Check your connection and try again.</ErrorState>
          : !list ? <SkeletonList count={4} className="grid gap-2.5" height="h-[76px]" />
          : list.length === 0 ? <EmptyState title="Nothing new">Check-ins, pickups and school news appear here.</EmptyState>
          : (
            <ul className="card divide-y divide-line rounded-2xl px-4">
              {list.map((u) => {
                const body = (
                  <>
                    <span className={`grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-5 ${u.tone}`} aria-hidden>{u.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-h4">{u.title}</span>
                      <span className="line-clamp-2 block text-small font-semibold text-ink-2">{u.text}</span>
                    </span>
                    <span className="shrink-0 text-caption font-bold text-ink-2 tabular-nums">{clockTime(u.at)}</span>
                    {u.unread && <span className="size-2.5 shrink-0 rounded-full bg-accent" aria-label="New" />}
                  </>
                )
                return (
                  <li key={u.key}>
                    {u.announcement
                      ? <button type="button" onClick={() => void openAnnouncement(u.announcement!)} className="flex w-full items-center gap-3 py-3 text-left">{body}</button>
                      : <div className="flex items-center gap-3 py-3">{body}</div>}
                  </li>
                )
              })}
            </ul>
          )}
      </section>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''} description={open ? `From ${open.sender_name.split(' ')[0]}, ${open.sender_role}, at ${clockTime(open.created_at)}` : ''}>
        <p className="whitespace-pre-wrap text-body">{open?.body}</p>
        <SheetFooter><Button variant="secondary" className="w-full" onClick={() => setOpen(null)}>Close</Button></SheetFooter>
      </Sheet>
    </AreaShell>
  )
}

// ---- Messages -----------------------------------------------------------------------------------------------------------

export function ParentMessages() {
  const me = useMyId()
  const { childId } = useParams()
  const navigate = useNavigate()
  const kids = useMyKids()
  const messages = useLive<{ child_id: string; body: string; sender: string; sender_name: string; created_at: string }>('messages', () => supabase.from('messages').select('child_id, body, sender, sender_name, created_at').order('created_at'), [])
  const kid = kids.rows?.find((k) => k.id === childId)
  // Phones: the list, or one conversation. Wide screens: both side by side.
  return (
    <AreaShell area="parent" title="Messages" subtitle="A conversation with the school for each of your children.">
      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <section className={`lg:sticky lg:top-28 ${kid ? 'max-lg:hidden' : ''}`} aria-busy={!kids.rows} aria-label="Conversations">
          {kids.error ? <ErrorState title="Couldn't load messages" onRetry={() => void kids.reload()}>Check your connection and try again.</ErrorState>
            : !kids.rows ? <SkeletonList count={2} className="grid gap-2.5" />
            : kids.rows.length === 0 ? <EmptyState title="No children yet">No children are linked to your account yet. Please contact the school.</EmptyState>
            : (
              <ul className="grid gap-2.5 md:max-lg:grid-cols-2">
                {kids.rows.map((k) => {
                  const last = messages.rows?.filter((m) => m.child_id === k.id).at(-1)
                  return (
                    <li key={k.id}>
                      <button type="button" onClick={() => navigate(`/parent/messages/${k.id}`)} aria-current={k.id === childId || undefined}
                        className="card flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-shadow duration-150 hover:shadow-[var(--shadow-lift)] aria-[current]:shadow-[inset_0_0_0_2px_var(--accent)]">
                        <Avatar name={first(k)} color={childColor(k.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-h4">{first(k)} and the school</span>
                          <span className="block truncate text-small font-semibold text-ink-2">{last ? `${last.sender === me ? 'You' : last.sender_name.split(' ')[0]}: ${last.body}` : 'No messages yet.'}</span>
                        </span>
                        {last && <span className="text-caption font-bold text-ink-2 tabular-nums">{clockTime(last.created_at)}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
        </section>

        <section className={kid ? '' : 'max-lg:hidden'} aria-label="Conversation">
          {kid ? (
            <div className="card grid gap-4 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <Button size="md" variant="quiet" icon={<ChevronLeft />} className="lg:hidden" aria-label="All conversations" onClick={() => navigate('/parent/messages')} />
                <Avatar name={first(kid)} color={childColor(kid.id)} />
                <div><h2 className="text-h2">{first(kid)} and the school</h2><p className="text-small font-semibold text-ink-2">The head office and the front desk</p></div>
              </div>
              <Thread childId={kid.id} mine={(m) => m.sender === me} footnote="Messages are for everyday things. To change a pickup, use Change time on Today." />
            </div>
          ) : (
            <div className="grid min-h-[360px] place-items-center rounded-2xl border-2 border-dashed border-line p-8 text-center">
              <div className="grid justify-items-center gap-2">
                <MessageSquare className="size-10 text-ink-3" aria-hidden />
                <p className="text-h4">Choose a conversation</p>
                <p className="max-w-[36ch] text-small font-semibold text-ink-2">Each child has their own conversation with the school.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </AreaShell>
  )
}

// ---- Account ------------------------------------------------------------------------------------------------------------

const PERSON_RELATIONS = ['Driver', 'Family friend', 'Neighbour', 'Nanny', 'Relative the school has not added', 'Other'] as const

function PersonSheet({ me, onClose, onSaved }: { me: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [relation, setRelation] = useState<string>('Driver')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  async function save() {
    const e: Record<string, string> = {}
    const mobile = normalizeMobile(phone)
    if (name.trim().length < 2) e.name = 'Enter their full name.'
    if (!mobile) e.phone = 'Enter a 10-digit mobile number, or + and the country code.'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      await savePerson(me, { full_name: name.trim(), phone: mobile!, relation })
      toast(`${name.trim().split(' ')[0]} is saved.`)
      onSaved()
    } catch (err) {
      setErrors({ form: (err as { code?: string }).code === '23505' ? 'Someone with this number is already saved.' : explainDbError(err as { code?: string; message?: string }) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open onClose={onClose} title="Add a person" description="Someone outside the family, like a driver.">
      <div className="grid gap-4">
        <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" error={errors.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Mobile" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" error={errors.phone} />
          <SelectField label="Relation" value={relation} onValue={(v) => setRelation(v)}>{PERSON_RELATIONS.map((r) => <option key={r}>{r}</option>)}</SelectField>
        </div>
        {errors.form && <Notice tone="danger">{errors.form}</Notice>}
      </div>
      <SheetFooter><Button size="xl" className="w-full" icon={<UserPlus />} loading={busy} onClick={() => void save()}>Save</Button></SheetFooter>
    </Sheet>
  )
}

const WHY = ['Unwell', 'Family event', 'Travelling', 'Something else'] as const

/** Report an absence (Screen Book): the child, the days (one, or first and last on the calendar) and why. The school sees it at once and those days' trips are cancelled. */
export function AbsenceSheet({ kids, initialChild, onClose, onSaved }: { kids: Kid[]; initialChild?: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const today = todayInIndia()
  const [child, setChild] = useState(initialChild ?? kids[0]?.id ?? '')
  const [range, setRange] = useState<Range>({ from: today, to: today })
  const [why, setWhy] = useState<string>('Unwell')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const k = kids.find((x) => x.id === child)
  const span = daysBetween(range.from, range.to) + 1
  const tooLong = span > 31
  const when = span === 1 ? (range.from === today ? 'Today' : shortDate(range.from)) : `${shortDate(range.from)} to ${shortDate(range.to)}`
  async function save() {
    setBusy(true)
    setError(null)
    try {
      const n = await reportAbsenceRange(child, range.from, range.to, why === 'Something else' ? other.trim() : why)
      const name = k ? first(k) : 'Your child'
      toast(span === 1 ? `${name} is marked absent ${range.from === today ? 'today' : `on ${when}`}.` : `${name} is marked absent for ${n} school ${n === 1 ? 'day' : 'days'}.`)
      onSaved()
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }
  const chips = <T extends string>(label: string, items: Array<[T, string]>, value: T, set: (v: T) => void) => (
    <fieldset><legend className="kicker mb-2">{label}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>{items.map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => set(v)} className="choice h-11 px-4 text-small font-bold">{t}</button>)}</div>
    </fieldset>
  )
  return (
    <Sheet open onClose={onClose} title="Report an absence" description="Tap a day, or the first and last day. The school is told at once.">
      <div className="grid gap-5">
        {kids.length > 1 && chips('Child', kids.map((x) => [x.id, first(x)]), child, setChild)}
        <div className="grid gap-2">
          <RangeCalendar value={range} onChange={setRange} min={today} max={addDays(today, 120)} />
          <p className={`flex items-center gap-2 px-0.5 text-small font-bold ${tooLong ? 'text-danger' : ''}`} aria-live="polite">
            <CalendarDays className="size-5 shrink-0" aria-hidden />
            {tooLong ? 'Up to 31 days at a time. For longer, call the school.' : `${when}${span > 1 ? ` · ${span} days` : ''}`}
          </p>
        </div>
        {chips('Why', WHY.map((w) => [w, w] as [string, string]), why, setWhy)}
        {why === 'Something else' && <label className="input input--sm"><input value={other} onChange={(e) => setOther(e.target.value)} maxLength={80} placeholder="A few words for the school" aria-label="Reason" /></label>}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
      <SheetFooter><Button size="xl" className="w-full" icon={<CalendarX />} loading={busy} disabled={!child || tooLong || (why === 'Something else' && !other.trim())} onClick={() => void save()}>Tell the school</Button></SheetFooter>
    </Sheet>
  )
}

const RELATIONS = ['Grandmother', 'Grandfather', 'Aunt', 'Uncle', 'Older sibling', 'Other relative'] as const

/** A parent adds a relative (D45): they collect from the gate like a parent, and with an email they can use the app. */
function RelativeSheet({ kids, onClose, onSaved }: { kids: Kid[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [child, setChild] = useState(kids[0]?.id ?? '')
  const [name, setName] = useState('')
  const [relation, setRelation] = useState<string>('Grandmother')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  async function save() {
    const e: Record<string, string> = {}
    const mobile = normalizeMobile(phone)
    if (name.trim().length < 2) e.name = 'Enter their first and last name.'
    if (!mobile) e.phone = 'Enter a 10-digit mobile number, or + and the country code.'
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.email = "That email doesn't look right."
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      await addRelative(child, { full_name: name.trim(), relation, phone: mobile!, email: email.trim() || null })
      toast(`${name.trim().split(' ')[0]} is added. The school can see them now.`)
      onSaved()
    } catch (err) {
      setErrors({ form: explainDbError(err as { code?: string; message?: string }) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open onClose={onClose} title="Add a relative" description="They can collect from the gate, like you.">
      <div className="grid gap-4">
        {kids.length > 1 && (
          <SelectField label="Child" value={child} onValue={(v) => setChild(v)}>{kids.map((k) => <option key={k.id} value={k.id}>{first(k)}</option>)}</SelectField>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" error={errors.name} />
          <SelectField label="Relation" value={relation} onValue={(v) => setRelation(v)}>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</SelectField>
        </div>
        <TextField label="Mobile" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" error={errors.phone} />
        <TextField label="Email (optional)" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email}
          hint="With an email they can sign in to the app. Leave it empty if they only collect." />
        {errors.form && <Notice tone="danger">{errors.form}</Notice>}
      </div>
      <SheetFooter><Button size="xl" className="w-full" icon={<UserPlus />} loading={busy} disabled={!child} onClick={() => void save()}>Add {name.trim().split(' ')[0] || 'them'}</Button></SheetFooter>
    </Sheet>
  )
}

export function ParentAccount() {
  const toast = useToast()
  const { state, signOut } = useSession()
  const me = useMyId()
  const name = state.status === 'signed-in' ? state.me?.full_name ?? '' : ''
  const kids = useMyKids()
  const classes = useMyClasses(me)
  const people = useLive<SavedPerson>('saved_people', () => supabase.from('saved_people').select('id, full_name, phone, relation').order('created_at'), [])
  const [family, setFamily] = useState<FamilyMember[] | null>(null)
  const [mine, setMine] = useState<{ email: string | null; notify_morning: boolean; notify_family: boolean } | null>(null)
  const [schoolPhone, setSchoolPhone] = useState<string | null>(null)
  const [sheet, setSheet] = useState<null | 'person' | 'relative' | 'absence' | 'signout'>(null)
  const loadFamily = () => void myFamily().then(setFamily, () => setFamily([]))
  useEffect(loadFamily, [classes.rows?.length])
  async function removeFamily(f: FamilyMember) {
    try {
      await removeRelative(f.child_id, f.guardian_id)
      toast(`${f.full_name.split(' ')[0]} is removed from ${kidName(f.child_id)}'s record.`)
      loadFamily()
    } catch (e) {
      toast(explainDbError(e as { code?: string; message?: string }))
    }
  }
  useEffect(() => {
    if (!me) return
    void supabase.from('profiles').select('email, notify_morning, notify_family').eq('id', me).single().then(({ data }) => setMine(data as typeof mine))
    void supabase.from('settings').select('school_phone').single().then(({ data }) => setSchoolPhone((data as { school_phone: string | null } | null)?.school_phone ?? null))
  }, [me])

  async function toggle(key: 'notify_morning' | 'notify_family', v: boolean) {
    if (!mine) return
    const next = { ...mine, [key]: v }
    setMine(next)
    try {
      await setMyNotifications(next.notify_morning, next.notify_family)
      toast(v ? 'Turned on.' : 'Turned off.')
    } catch (e) {
      setMine(mine)
      toast(explainDbError(e as { code?: string; message?: string }))
    }
  }

  const row = (key: string, icon: ReactNode | undefined, title: string, sub: string, control?: ReactNode) => (
    <div key={key} className="flex items-center gap-3 py-3">{icon}<div className="min-w-0 flex-1"><p className="text-h4">{title}</p><p className="text-small font-semibold text-ink-2">{sub}</p></div>{control}</div>
  )
  const kidName = (id: string) => { const k = kids.rows?.find((x) => x.id === id); return k ? first(k) : '' }

  return (
    <AreaShell area="parent" title="Account">
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)] xl:gap-8">
        <div className="profile-hero relative overflow-hidden rounded-[28px] p-6 sm:p-7 lg:col-span-2">
          <div className="relative flex flex-wrap items-center gap-5">
            <Avatar name={name} color="var(--accent)" size="lg" />
            <div className="min-w-0 flex-1">
              <p className="kicker">Signed in as a parent</p>
              <p className="text-h2 text-balance">{name}</p>
              <p className="truncate text-small font-semibold text-ink-2">{mine?.email}</p>
            </div>
            {kids.rows && kids.rows.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Your children">
                {kids.rows.map((k) => (
                  <li key={k.id} className="flex items-center gap-2 rounded-full bg-surface/80 py-1 pl-1 pr-3.5 text-small font-bold shadow-[0_1px_2px_rgb(22_25_58/0.08)]">
                    <Avatar name={first(k)} color={childColor(k.id)} size="sm" />{first(k)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="grid gap-6">
        <section aria-labelledby="fam-h">
          <div className="mb-2 flex items-center justify-between gap-2"><h2 id="fam-h" className="kicker">Parents and family</h2><Button size="md" variant="secondary" className="whitespace-nowrap" icon={<UserPlus />} disabled={!kids.rows?.length} onClick={() => setSheet('relative')}>Add a relative</Button></div>
          <div className="card divide-y divide-line rounded-2xl px-5">
            {family === null ? <div className="my-4 h-12 animate-pulse rounded-lg bg-sunken" /> : family.length === 0 ? <p className="py-4 text-small font-semibold text-ink-2">Nobody else yet. Add a grandparent or relative who collects.</p>
              : family.map((f) => row(`${f.child_id}-${f.guardian_id}`, <Avatar name={f.full_name} color={f.kind === 'parent' ? 'var(--rb-blue)' : 'var(--ink-3)'} size="sm" />, f.full_name,
                `${f.relation} of ${kidName(f.child_id)}${f.abroad ? ', lives outside India' : ''}${f.has_app ? ', has the app' : ''}`,
                f.kind === 'family' ? <Button size="md" variant="quiet" icon={<Trash2 />} aria-label={`Remove ${f.full_name}`} onClick={() => void removeFamily(f)} /> : f.abroad ? <Globe className="size-5 text-ink-3" aria-hidden /> : undefined))}
          </div>
          <p className="mt-2 text-caption font-semibold text-ink-2">Everyone here can collect from the gate. The school changes parents.</p>
        </section>

        <section aria-labelledby="saved-h">
          <div className="mb-2 flex items-center justify-between gap-2"><h2 id="saved-h" className="kicker">Saved people</h2><Button size="md" variant="secondary" className="whitespace-nowrap" icon={<Plus />} onClick={() => setSheet('person')}>Add a person</Button></div>
          <div className="card divide-y divide-line rounded-2xl px-5">
            {!people.rows ? <div className="my-4 h-12 animate-pulse rounded-lg bg-sunken" /> : people.rows.length === 0 ? <p className="py-4 text-small font-semibold text-ink-2">Nobody saved yet. A regular driver saved here is one tap away in Someone else is collecting.</p>
              : people.rows.map((p) => row(p.id, <Avatar name={p.full_name} color="var(--ink-3)" size="sm" />, p.full_name, `${p.relation}, ${formatMobile(p.phone)}`,
                <Button size="md" variant="quiet" icon={<Trash2 />} aria-label={`Remove ${p.full_name}`} onClick={() => void removeSavedPerson(p.id).then(() => { void people.reload(); toast(`${p.full_name.split(' ')[0]} removed from saved people.`) }, (e) => toast(explainDbError(e)))} />))}
          </div>
          <p className="mt-2 text-caption font-semibold text-ink-2">Drivers and friends, not family. They collect with a one-time link.</p>
        </section>

        </div>

        <div className="grid gap-6 lg:sticky lg:top-28">
        <section aria-labelledby="notify-h">
          <h2 id="notify-h" className="kicker mb-2">Notifications</h2>
          <div className="card divide-y divide-line rounded-2xl px-5">
            <PushSwitch label="Notifications on this device" />
            {row('morning', undefined, 'Morning reminder, 8:00 AM', "Today's drop-off and pickup times", <Switch on={!!mine?.notify_morning} busy={!mine} label="Morning reminder" onChange={(v) => void toggle('notify_morning', v)} />)}
            {row('family', undefined, 'When the other parent changes something', 'Time changes, absences, someone else collecting', <Switch on={!!mine?.notify_family} busy={!mine} label="When the other parent changes something" onChange={(v) => void toggle('notify_family', v)} />)}
          </div>
        </section>

        <section aria-labelledby="school-h" className="grid gap-2.5">
          <h2 id="school-h" className="kicker">School</h2>
          <Button variant="secondary" icon={<CalendarX />} disabled={!kids.rows?.length} onClick={() => setSheet('absence')}>Report an absence</Button>
          {schoolPhone && <a className="btn btn--secondary btn--lg" href={`tel:${schoolPhone}`}><Phone aria-hidden />Call the school, {formatMobile(schoolPhone)}</a>}
        </section>

        <SignOutButton onClick={() => setSheet('signout')} />
        </div>
      </div>

      {sheet === 'person' && me && <PersonSheet me={me} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); void people.reload() }} />}
      {sheet === 'relative' && kids.rows && <RelativeSheet kids={kids.rows} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); loadFamily() }} />}
      {sheet === 'absence' && kids.rows && <AbsenceSheet kids={kids.rows} onClose={() => setSheet(null)} onSaved={() => setSheet(null)} />}
      <Sheet open={sheet === 'signout'} onClose={() => setSheet(null)} title="Sign out?" description="You'll need a new email code to sign in again on this device.">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Button variant="secondary" onClick={() => setSheet(null)}>Stay signed in</Button>
          <Button variant="danger" icon={<LogOut />} onClick={() => void signOut()}>Sign out</Button>
        </div>
      </Sheet>
    </AreaShell>
  )
}
