import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Backpack, BookOpen, CalendarDays, Check, Clock, GraduationCap, HouseHeart, Plus, Puzzle, School, Shapes, Sparkles, Sprout, Sun, Utensils } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { formatTime, toMinutes } from '../../domain/time'
import { addClass, explainDbError, type ClassRow, type ProgrammeRow } from './api'
import { formatAge, LEVELS, levelOf, planInfo, planRank, suggestedLevel, type LevelKey } from './programmeCatalogue'

/** Each class level has its own icon (the same as the Screen Book), so levels are told apart without colour. */
export const LEVEL_ICON: Record<LevelKey, ReactNode> = {
  Playgroup: <Shapes />,
  Nursery: <Puzzle />,
  'Jr KG': <BookOpen />,
  'Sr KG': <GraduationCap />,
  'Learning Center': <HouseHeart />,
  'Preschool Readiness Program': <Sprout />,
  'After School Program': <Backpack />,
}

const hhmm = (t: string | null | undefined) => (t ? formatTime(toMinutes(t.slice(0, 5))) : '')
const range = (a?: string | null, b?: string | null) => `${hhmm(a)} to ${hhmm(b)}`

function days(p: ProgrammeRow): string {
  const d = p.weekdays ?? []
  if (d.length === 5 && !d.includes(6)) return 'Mon to Fri'
  if (d.includes(6)) return p.saturday_rule === 'except_2nd_and_last' ? 'Mon to Sat (not the 2nd or last Sat)' : 'Mon to Sat'
  return d.map((n) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n - 1]).join(', ')
}

function term(p: ProgrammeRow): string {
  if (!p.term_start || !p.term_end) return 'All year'
  const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleString('en-IN', { month: 'short' })
  return `${fmt(p.term_start)} to ${fmt(p.term_end)}`
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 text-small font-semibold text-ink-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-3">{icon}{children}</span>
}

const STEPS = ['Level', 'Programme', 'Class group'] as const

export interface PickerValue { programmeId: string; classId: string }

/**
 * Programme and class picker for a child (PRD D19, §5): level → programme with its timings → class group.
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
  const standalone = !!level && !!LEVELS.find((l) => l.key === level)?.standalone

  function chooseLevel(key: LevelKey) {
    setLevel(key)
    const options = programmes.filter((p) => levelOf(p).level === key)
    if (options.length === 1) {
      // Standalone programmes have a single option: go straight to the class group.
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

  const titles = { 1: `Which level is ${firstName} joining?`, 2: 'Choose the programme', 3: `Which class group is ${firstName} in?` }

  return (
    <Sheet open={open} onClose={onClose} title={titles[step]} wide>
      <div className="mb-6 flex items-center gap-3">
        {step > 1 && (
          <Button size="md" variant="quiet" icon={<ArrowLeft />} onClick={() => setStep(step === 3 && standalone ? 1 : ((step - 1) as 1 | 2))}>
            Back
          </Button>
        )}
        <ol className="ml-auto grid w-full max-w-[360px] grid-cols-3 gap-2" aria-label={`Step ${step} of 3: ${STEPS[step - 1]}`}>
          {STEPS.map((label, i) => (
            <li key={label} className={`grid gap-1.5 text-caption font-bold ${i < step ? 'text-accent-ink' : 'text-ink-3'}`} aria-current={i + 1 === step ? 'step' : undefined}>
              <span className={`h-1.5 rounded-full transition-colors duration-200 ${i < step ? 'bg-accent' : 'bg-line-2'}`} aria-hidden />
              {label}
            </li>
          ))}
        </ol>
      </div>

      {step === 1 && (
        <div key="levels" className="page-in">
          {dateOfBirth && suggestion && (
            <Notice className="mb-4" icon={<Sparkles aria-hidden />}>
              {firstName} is {formatAge(dateOfBirth)} today. Suggested: {LEVELS.find((l) => l.key === suggestion)?.label}.
            </Notice>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {available.map((l) => (
              <button key={l.key} type="button" onClick={() => chooseLevel(l.key)} aria-pressed={l.key === level} className="choice flex items-start gap-3.5 p-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-md bg-accent-soft text-accent [&_svg]:size-6" aria-hidden>{LEVEL_ICON[l.key]}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-h3">{l.label}</span>
                    {l.key === suggestion && <Pill tone="accent" icon={<Sparkles />}>Suggested</Pill>}
                  </span>
                  <span className="mt-0.5 block text-small font-bold text-ink">{l.ages}</span>
                  <span className="mt-1 block text-small font-medium text-ink-2">{l.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div key="plans" className="page-in grid gap-3">
          {plans.map((p) => {
            const info = planInfo(levelOf(p).plan ?? '')
            return (
              <button key={p.id} type="button" onClick={() => { setProgrammeId(p.id); setStep(3) }} aria-pressed={p.id === programmeId} className="choice p-5">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-h3">{info.title}</span>
                  <span className="text-h3 tabular-nums text-accent-ink">{range(p.starts, p.ends)}</span>
                </span>
                {info.blurb && <span className="mt-1 block text-body text-ink-2">{info.blurb}</span>}
                <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  <Fact icon={<CalendarDays />}>{days(p)}, {term(p)}</Fact>
                  {info.meals && <Fact icon={<Utensils />}>{info.meals}</Fact>}
                  {p.flexible ? (
                    <Fact icon={<Sun />}>Drop-off and pickup any time within the hours</Fact>
                  ) : (
                    <Fact icon={<Clock />}>Drop-off {range(p.dropoff_from, p.dropoff_to)}, pickup {range(p.pickup_from, p.pickup_to)}</Fact>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {step === 3 && (
        <div key="classes" className="page-in">
          {chosen && (
            <p className="mb-5 flex flex-wrap items-center gap-x-2 rounded-md bg-sunken px-4 py-3 text-small font-bold">
              <span className="[&_svg]:size-4 [&_svg]:text-accent" aria-hidden>{LEVEL_ICON[levelOf(chosen).level]}</span>
              {chosen.name}
              <span className="font-semibold text-ink-2 tabular-nums">{range(chosen.starts, chosen.ends)}</span>
            </p>
          )}
          {classes.some((c) => c.active) ? (
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Class group">
              {classes.filter((c) => c.active).map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={c.id === classId} onClick={() => setClassId(c.id)}
                  className="choice flex h-12 items-center gap-2 px-5 text-h4 [&_svg]:size-[18px] [&_svg]:text-ink-3">
                  <School aria-hidden />
                  {c.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-body text-ink-2">No class groups yet. Add the first one below.</p>
          )}
          <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); void createClass() }}>
            <label className="input input--sm min-w-0 flex-1">
              <input value={newClass} onChange={(e) => { setNewClass(e.target.value); setClassError(null) }} placeholder="New class group, e.g. Sunflowers" aria-label="New class group name" />
            </label>
            <Button type="submit" size="md" variant="secondary" icon={<Plus />} loading={adding}>Add</Button>
          </form>
          {classError && <p className="mt-2 text-small font-bold text-danger" role="alert">{classError}</p>}
          <SheetFooter>
            <Button size="xl" className="w-full" icon={<Check />} disabled={!programmeId || !classId} onClick={() => programmeId && classId && onPick({ programmeId, classId })}>
              Use this programme and class
            </Button>
          </SheetFooter>
        </div>
      )}
    </Sheet>
  )
}
