import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, CalendarDays, Check, Clock, Plus, Sparkles, Sun, Utensils } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { formatTime, toMinutes } from '../../domain/time'
import { addClass, explainDbError, type ClassRow, type ProgrammeRow } from './api'
import { formatAge, LEVELS, levelOf, planInfo, planRank, suggestedLevel, type LevelKey } from './programmeCatalogue'

const hhmm = (t: string | null | undefined) => (t ? formatTime(toMinutes(t.slice(0, 5))) : '')
const range = (a?: string | null, b?: string | null) => `${hhmm(a)} – ${hhmm(b)}`

function days(p: ProgrammeRow): string {
  const d = p.weekdays ?? []
  if (d.length === 5 && !d.includes(6)) return 'Mon–Fri'
  if (d.includes(6)) return p.saturday_rule === 'except_2nd_and_last' ? 'Mon–Sat (not the 2nd or last Sat)' : 'Mon–Sat'
  return d.map((n) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n - 1]).join(', ')
}

function term(p: ProgrammeRow): string {
  if (!p.term_start || !p.term_end) return 'All year'
  const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleString('en-IN', { month: 'short' })
  return `${fmt(p.term_start)}–${fmt(p.term_end)}`
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-2 [&_svg]:size-4 [&_svg]:shrink-0">{icon}{children}</span>
}

export interface PickerValue { programmeId: string; classId: string }

/**
 * Programme and class picker for a child (PRD D19, §5): level → plan with its timings → class group.
 * Suggests the level from the child's age on 1 June. Timings come from the database, so the core team's edits show here.
 */
export function ProgrammePicker({
  open, onClose, onPick, programmes, classes, onClassAdded, childName, dateOfBirth, initial,
}: {
  open: boolean
  onClose: () => void
  onPick: (v: PickerValue) => void
  programmes: ProgrammeRow[]
  classes: ClassRow[]
  onClassAdded: (c: ClassRow) => void
  childName: string
  dateOfBirth: string
  initial: Partial<PickerValue>
}) {
  const initialProgramme = programmes.find((p) => p.id === initial.programmeId)
  const [level, setLevel] = useState<LevelKey | null>(initialProgramme ? levelOf(initialProgramme).level : null)
  const [programmeId, setProgrammeId] = useState<string | null>(initial.programmeId ?? null)
  const [classId, setClassId] = useState<string | null>(initial.classId ?? null)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [newClass, setNewClass] = useState('')
  const [classError, setClassError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const suggestion = suggestedLevel(dateOfBirth)
  const plans = useMemo(
    () => programmes.filter((p) => levelOf(p).level === level).sort((a, b) => planRank(levelOf(a).plan) - planRank(levelOf(b).plan)),
    [programmes, level],
  )
  const chosen = programmes.find((p) => p.id === programmeId) ?? null
  const available = LEVELS.filter((l) => programmes.some((p) => levelOf(p).level === l.key))
  const firstName = childName.trim().split(' ')[0] || 'the child'

  function chooseLevel(key: LevelKey) {
    setLevel(key)
    const options = programmes.filter((p) => levelOf(p).level === key)
    if (options.length === 1) {
      // Standalone programmes have one plan: go straight to the class group.
      setProgrammeId(options[0]!.id)
      setStep(3)
    } else {
      if (!options.some((p) => p.id === programmeId)) setProgrammeId(null)
      setStep(2)
    }
  }

  async function createClass() {
    if (!newClass.trim()) return setClassError('Give the class a name, for example "Sunflowers".')
    setAdding(true)
    setClassError(null)
    try {
      const c = await addClass(newClass)
      onClassAdded(c)
      setClassId(c.id)
      setNewClass('')
    } catch (e) {
      const err = e as { code?: string }
      setClassError(err.code === '23505' ? 'A class with this name already exists.' : explainDbError(err))
    } finally {
      setAdding(false)
    }
  }

  const titles = { 1: `Which programme is ${firstName} joining?`, 2: 'Choose the plan', 3: `Which class group is ${firstName} in?` }

  return (
    <Sheet open={open} onClose={onClose} title={titles[step]} wide>
      {/* Steps: level → plan → class */}
      <div className="mb-5 flex items-center gap-2" aria-label={`Step ${step} of 3`}>
        {step > 1 && (
          <Button size="md" variant="quiet" icon={<ArrowLeft />} onClick={() => setStep(step === 3 && level && LEVELS.find((l) => l.key === level)?.standalone ? 1 : ((step - 1) as 1 | 2))}>
            Back
          </Button>
        )}
        <div className="ml-auto flex gap-1.5" aria-hidden>
          {[1, 2, 3].map((s) => (
            <span key={s} className="h-2 w-10 rounded-full" style={{ background: s <= step ? ['var(--rb-red)', 'var(--rb-yellow)', 'var(--rb-blue)'][s - 1] : 'var(--line-strong)' }} />
          ))}
        </div>
      </div>

      {step === 1 && (
        <>
          {dateOfBirth && suggestion && (
            <p className="mb-4 flex items-center gap-2 rounded-[18px] bg-[color-mix(in_oklab,var(--rb-yellow)_22%,transparent)] px-4 py-3 text-[15px] font-bold">
              <Sparkles className="size-5 shrink-0 text-rb-orange" aria-hidden />
              {firstName} is {formatAge(dateOfBirth)} today. Suggested: {LEVELS.find((l) => l.key === suggestion)?.label}.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {available.map((l) => {
              const selected = l.key === level
              return (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => chooseLevel(l.key)}
                  aria-pressed={selected}
                  className={`card relative flex items-start gap-4 rounded-[26px] p-4 text-left transition-transform duration-200 ease-spring active:scale-[0.98] ${selected ? 'ring-[3px] ring-accent' : ''}`}
                >
                  <span className="grid size-14 shrink-0 place-items-center rounded-[18px] font-display text-[22px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${l.color}, color-mix(in oklab, ${l.color} 60%, white))`, boxShadow: `0 10px 22px -10px ${l.color}` }} aria-hidden>
                    {l.label.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[21px] font-bold leading-6">{l.label}</span>
                      {l.key === suggestion && <span className="rounded-full bg-[color-mix(in_oklab,var(--rb-yellow)_35%,transparent)] px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.06em]">Suggested</span>}
                    </span>
                    <span className="mt-0.5 block text-[14px] font-extrabold text-ink">{l.ages}</span>
                    <span className="mt-1 block text-[14px] font-semibold leading-5 text-ink-2">{l.blurb}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {step === 2 && (
        <div className="grid gap-3">
          {plans.map((p) => {
            const info = planInfo(levelOf(p).plan ?? '')
            const selected = p.id === programmeId
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { setProgrammeId(p.id); setStep(3) }}
                aria-pressed={selected}
                className={`card rounded-[26px] p-5 text-left transition-transform duration-200 ease-spring active:scale-[0.99] ${selected ? 'ring-[3px] ring-accent' : ''}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-display text-[22px] font-bold">{info.title}</span>
                  <span className="font-display text-[22px] font-bold tabular-nums text-accent-ink">{range(p.starts, p.ends)}</span>
                </div>
                <p className="mt-1 text-[15px] font-semibold text-ink-2">{info.blurb}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  <Fact icon={<CalendarDays />}>{days(p)} · {term(p)}</Fact>
                  <Fact icon={<Utensils />}>{info.meals}</Fact>
                  {p.flexible ? (
                    <Fact icon={<Sun />}>Flexible drop-off and pickup within the hours</Fact>
                  ) : (
                    <Fact icon={<Clock />}>Drop-off {range(p.dropoff_from, p.dropoff_to)} · Pickup {range(p.pickup_from, p.pickup_to)}</Fact>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {step === 3 && (
        <>
          {chosen && (
            <p className="mb-4 rounded-[18px] bg-sunken px-4 py-3 text-[15px] font-bold">
              {chosen.name} · <span className="tabular-nums">{range(chosen.starts, chosen.ends)}</span>
            </p>
          )}
          {classes.length > 0 ? (
            <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Class group">
              {classes.filter((c) => c.active).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={c.id === classId}
                  onClick={() => setClassId(c.id)}
                  className={`flex h-12 items-center gap-2 rounded-full px-5 text-[16px] font-extrabold transition-transform duration-200 ease-spring active:scale-95 ${
                    c.id === classId ? 'bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[var(--accent-glow)]' : 'card'
                  }`}
                >
                  {c.id === classId && <Check className="size-4" aria-hidden />}
                  {c.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[15px] font-semibold text-ink-2">No class groups yet. Add the first one below.</p>
          )}
          <div className="mt-5 flex gap-2">
            <input
              value={newClass}
              onChange={(e) => { setNewClass(e.target.value); setClassError(null) }}
              placeholder="New class group, e.g. Sunflowers"
              aria-label="New class group name"
              className="card h-12 min-w-0 flex-1 rounded-full px-5 text-[16px] font-semibold outline-none placeholder:text-ink-3 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_45%,transparent)]"
            />
            <Button size="md" variant="secondary" icon={<Plus />} loading={adding} onClick={() => void createClass()}>
              Add
            </Button>
          </div>
          {classError && <p className="mt-2 text-[14px] font-bold text-danger" role="alert">{classError}</p>}
          <Button size="xl" className="mt-6 w-full" icon={<Check />} disabled={!programmeId || !classId} onClick={() => programmeId && classId && onPick({ programmeId, classId })}>
            Use this programme and class
          </Button>
        </>
      )}
    </Sheet>
  )
}
