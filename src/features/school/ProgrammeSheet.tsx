import { useState } from 'react'
import { Check, RotateCcw } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { SelectField, TextField } from '../../ui/Field'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { Switch } from '../../ui/Switch'
import { useToast } from '../../ui/Toast'
import { formatTime, toMinutes, type Minutes } from '../../domain/time'
import { explainDbError, type ClassRow, type Directory, type ProgrammeRow } from '../admin/api'
import { levelOf } from '../admin/programmeCatalogue'
import { formatRange } from '../trips/rules'
import { saveProgramme, type ProgrammeAbout } from './api'
import { DayBar } from './DayBar'
import { GATE_CLOSES, GATE_OPENS, ruleWindows, timingProblems, type Range } from './timings'

const m = (t?: string | null) => (t ? toMinutes(t.slice(0, 5)) : 0)
const hhmm = (x: Minutes) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
const steps = (a: Minutes, b: Minutes, step: number) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step)
const DAYS = {
  weekdays: { label: 'Monday to Friday', weekdays: [1, 2, 3, 4, 5], rule: 'every' },
  saturdays: { label: 'Monday to Saturday', weekdays: [1, 2, 3, 4, 5, 6], rule: 'every' },
  some: { label: 'Monday to Saturday, not the 2nd or last Saturday', weekdays: [1, 2, 3, 4, 5, 6], rule: 'except_2nd_and_last' },
} as const
type DaysKey = keyof typeof DAYS | 'current'
function daysKey(p: ProgrammeRow | null): DaysKey {
  if (!p) return 'weekdays'
  const w = [...(p.weekdays ?? [])].sort().join()
  const hit = (Object.keys(DAYS) as Array<keyof typeof DAYS>).find((k) => DAYS[k].weekdays.join() === w && DAYS[k].rule === (p.saturday_rule ?? 'every'))
  return hit ?? 'current'
}

/** Keeps a value that's off the list (an old 5-minute time) selectable, so opening the sheet never changes it. */
const withCurrent = (list: Minutes[], cur: Minutes) => (list.includes(cur) ? list : [...list, cur].sort((a, b) => a - b))

/**
 * A programme's timings: the hours and the drop-off and pickup windows, each set by hand (D35). The windows follow the
 * hours by the school's rule until someone sets them; "Use the 15-minute rule" puts them back. The admin also names a
 * new programme and chooses its days; the core team changes timings only.
 */
export function ProgrammeSheet({ programme, cls, dir, admin, onClose, onSaved }: {
  programme: ProgrammeRow | null
  cls: ClassRow
  dir: Directory
  admin: boolean
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const toast = useToast()
  const p = programme
  const [starts, setStarts] = useState(p ? m(p.starts) : 540)
  const [ends, setEnds] = useState(p ? m(p.ends) : 780)
  const [extended, setExtended] = useState(!!p?.extended)
  const initialRule = ruleWindows(starts, ends, extended)
  const [dropoff, setDropoff] = useState<Range>(p?.dropoff_from && p.dropoff_to ? [m(p.dropoff_from), m(p.dropoff_to)] : initialRule.dropoff)
  const [pickup, setPickup] = useState<Range>(p?.pickup_from && p.pickup_to ? [m(p.pickup_from), m(p.pickup_to)] : initialRule.pickup)
  const same = (a: Range, b: Range) => a[0] === b[0] && a[1] === b[1]
  // The windows move with the hours while they match the rule; once set by hand they stay put.
  const [followRule, setFollowRule] = useState(same(dropoff, initialRule.dropoff) && same(pickup, initialRule.pickup))
  const originalPlan = p ? levelOf(p).plan ?? '' : ''
  const [plan, setPlan] = useState(originalPlan)
  const [days, setDays] = useState<DaysKey>(daysKey(p))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rule = ruleWindows(starts, ends, extended)
  const onRule = same(dropoff, rule.dropoff) && same(pickup, rule.pickup)
  const problems = timingProblems(starts, ends, dropoff, pickup)
  const bad = Object.keys(problems).length > 0 || (admin && plan.includes('·'))
  const changed = !p || starts !== m(p.starts) || ends !== m(p.ends) || extended !== !!p.extended || plan !== originalPlan || days !== daysKey(p)
    || !same(dropoff, [m(p.dropoff_from), m(p.dropoff_to)]) || !same(pickup, [m(p.pickup_from), m(p.pickup_to)])
  const kids = p ? dir.children.filter((c) => c.active && c.programme_id === p.id) : []
  const outside = bad ? [] : kids.filter((c) => dir.schedules.some((s) => s.child_id === c.id && (m(s.dropoff) < dropoff[0] || m(s.dropoff) > dropoff[1] || m(s.pickup) < pickup[0] || m(s.pickup) > pickup[1])))
  const title = p ? p.name : `New programme in ${cls.name}`

  function hours(s: Minutes, e: Minutes, ext: boolean) {
    setStarts(s); setEnds(e); setExtended(ext)
    if (followRule) { const r = ruleWindows(s, e, ext); setDropoff(r.dropoff); setPickup(r.pickup) }
  }
  function setWindow(which: 'dropoff' | 'pickup', i: 0 | 1, v: Minutes) {
    setFollowRule(false)
    const set = which === 'dropoff' ? setDropoff : setPickup
    set((r) => (i === 0 ? [v, r[1]] : [r[0], v]))
  }
  function useRule() { setDropoff(rule.dropoff); setPickup(rule.pickup); setFollowRule(true) }

  async function save() {
    setBusy(true)
    setError(null)
    // Only what the admin changed is sent: an unchanged name or days are kept as they are.
    const about: ProgrammeAbout = {}
    if (admin) {
      if (!p) about.classId = cls.id
      if (!p || plan !== originalPlan) about.plan = plan.trim()
      if (days !== 'current' && (!p || days !== daysKey(p))) { about.weekdays = [...DAYS[days].weekdays]; about.saturdayRule = DAYS[days].rule }
    }
    try {
      await saveProgramme(p?.id ?? null, { starts: hhmm(starts), ends: hhmm(ends), extended, dropoff: [hhmm(dropoff[0]), hhmm(dropoff[1])], pickup: [hhmm(pickup[0]), hhmm(pickup[1])] }, about)
      onSaved(p ? 'Saved. Parents, the gate and the programme picker use the new times now.' : `${cls.name}${plan.trim() ? ` · ${plan.trim()}` : ''} is added. Choose it for a child from their record.`)
    } catch (e) {
      const text = explainDbError(e as { code?: string; message?: string })
      setError(text)
      toast(text)
    } finally {
      setBusy(false)
    }
  }

  const timeSelect = (label: string, value: Minutes, list: Minutes[], onChange: (v: Minutes) => void, err?: string) => (
    <SelectField label={label} value={value} error={err ?? null} onValue={(v) => onChange(Number(v))}>
      {withCurrent(list, value).map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
    </SelectField>
  )

  return (
    <Sheet open onClose={onClose} title={title} description={admin && !p ? 'Name it, choose its days, then set the times.' : 'Set the class hours, then when children are dropped off and picked up.'}>
      {admin && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <TextField label="Programme name" value={plan} maxLength={40} onChange={(e) => setPlan(e.target.value)}
            placeholder="Half day, 360°…" error={plan.includes('·') ? 'Leave out "·".' : null}
            hint={plan.trim() ? `Shown as ${cls.name} · ${plan.trim()}` : `Shown as ${cls.name}. Leave empty if it's the class's only programme.`} />
          <SelectField label="Days" value={days} onValue={(v) => setDays(v as DaysKey)}>
            {days === 'current' && <option value="current">As they are now</option>}
            {(Object.keys(DAYS) as Array<keyof typeof DAYS>).map((k) => <option key={k} value={k}>{DAYS[k].label}</option>)}
          </SelectField>
        </div>
      )}

      <p className="kicker mb-2.5">Class hours</p>
      <div className="grid gap-4 min-[400px]:grid-cols-2">
        {timeSelect(extended ? 'Must be in from' : 'Starts', starts, steps(540, 1110, 15), (v) => hours(v, ends, extended))}
        {timeSelect(extended ? 'Until' : 'Ends', ends, steps(570, 1140, 15), (v) => hours(starts, v, extended), problems.hours)}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-sunken py-1 pl-1 pr-3.5">
        <Switch on={extended} label="Extended day" onChange={(v) => hours(starts, ends, v)} />
        <p className="text-small font-semibold text-ink-2"><b className="text-ink">Extended day</b>: in for these hours, picked up any time until 7:00 PM</p>
      </div>

      <div className="mt-6 mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="kicker">Drop-off and pickup</p>
        {onRule
          ? <span className="text-caption font-bold text-ink-3">The school's 15-minute rule</span>
          : <button type="button" className="linkbtn inline-flex items-center gap-1.5 [&_svg]:size-4" onClick={useRule}><RotateCcw aria-hidden />Use the 15-minute rule</button>}
      </div>
      <div className="grid gap-3">
        <fieldset className="grid gap-3 rounded-xl bg-sunken p-3 min-[400px]:grid-cols-2">
          <legend className="sr-only">Drop-off</legend>
          {timeSelect('Drop-off from', dropoff[0], steps(GATE_OPENS, 1140, 5), (v) => setWindow('dropoff', 0, v), problems.dropoff)}
          {timeSelect('Drop-off until', dropoff[1], steps(GATE_OPENS + 5, 1140, 5), (v) => setWindow('dropoff', 1, v))}
        </fieldset>
        <fieldset className="grid gap-3 rounded-xl bg-sunken p-3 min-[400px]:grid-cols-2">
          <legend className="sr-only">Pickup</legend>
          {timeSelect('Pickup from', pickup[0], steps(540, GATE_CLOSES - 5, 5), (v) => setWindow('pickup', 0, v), problems.pickup)}
          {timeSelect('Pickup until', pickup[1], steps(545, GATE_CLOSES, 5), (v) => setWindow('pickup', 1, v))}
        </fieldset>
      </div>

      {!bad && (
        <div className="card mt-4 grid gap-3 rounded-xl p-4">
          <DayBar hours={[starts, ends]} dropoff={dropoff} pickup={pickup} extended={extended} />
          <p className="text-small font-semibold text-ink-2">
            Drop-off <b className="tabular-nums text-ink">{formatRange({ from: dropoff[0], to: dropoff[1] })}</b>, pickup <b className="tabular-nums text-ink">{formatRange({ from: pickup[0], to: pickup[1] })}</b>
          </p>
        </div>
      )}
      {outside.length > 0 && (
        <Notice tone="warning" className="mt-4">{outside.map((c) => c.preferred_name ?? c.full_name.split(' ')[0]).join(', ')} {outside.length === 1 ? 'has' : 'have'} regular times outside the new windows. Update them in Schedules after saving.</Notice>
      )}
      {error && <Notice tone="danger" className="mt-4">{error}</Notice>}
      <SheetFooter>
        <Button size="xl" className="w-full" icon={<Check />} loading={busy} disabled={bad || !changed} onClick={() => void save()}>
          {p ? 'Save the timings' : 'Add the programme'}
        </Button>
      </SheetFooter>
    </Sheet>
  )
}
