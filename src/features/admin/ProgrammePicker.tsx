import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Backpack, BookOpen, CalendarDays, Check, Clock, GraduationCap, HouseHeart, Puzzle, Shapes, Sparkles, Sprout, Sun, Utensils } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { formatTime, toMinutes } from '../../domain/time'
import type { ProgrammeRow } from './api'
import { formatAge, levelInfo, levelOf, planInfo, planRank, suggestedLevel, type KnownLevel, type LevelKey } from './programmeCatalogue'

/** Each class level has its own icon (the same as the Screen Book), so levels are told apart without colour. */
const LEVEL_ICON: Record<KnownLevel, ReactNode> = {
  Playgroup: <Shapes />,
  Nursery: <Puzzle />,
  'Jr KG': <BookOpen />,
  'Sr KG': <GraduationCap />,
  'Learning Center': <HouseHeart />,
  'Preschool Readiness Program': <Sprout />,
  'After School Program': <Backpack />,
}
/** A class's icon; classes the admin adds share the mortarboard. */
export const levelIcon = (key: LevelKey): ReactNode => LEVEL_ICON[key as KnownLevel] ?? <GraduationCap />

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

const STEPS = ['Class', 'Programme'] as const
const ORDER: LevelKey[] = ['Playgroup', 'Nursery', 'Jr KG', 'Sr KG', 'Learning Center', 'Preschool Readiness Program', 'After School Program']
const rank = (k: LevelKey) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length)

/**
 * The class and programme for a child (PRD D18, D19, D28): the class (a level, suggested from the age on 1 June), then
 * the programme with its timings. The class follows from the programme; timings come from the database.
 */
export function ProgrammePicker({ open, onClose, onPick, programmes, childName, dateOfBirth, initial }: {
  open: boolean
  onClose: () => void
  onPick: (programmeId: string) => void
  programmes: ProgrammeRow[]
  childName: string
  dateOfBirth: string
  initial: string | null
}) {
  const initialProgramme = programmes.find((p) => p.id === initial)
  const [level, setLevel] = useState<LevelKey | null>(initialProgramme ? levelOf(initialProgramme).level : null)
  const [programmeId, setProgrammeId] = useState<string | null>(initial)
  const [step, setStep] = useState<1 | 2>(1)

  const suggestion = suggestedLevel(dateOfBirth)
  const plans = useMemo(
    () => programmes.filter((p) => levelOf(p).level === level).sort((a, b) => planRank(levelOf(a).plan) - planRank(levelOf(b).plan)),
    [programmes, level],
  )
  const chosen = programmes.find((p) => p.id === programmeId) ?? null
  // Every class with a programme: the school's own in their usual order, then any the admin added.
  const available = [...new Set(programmes.map((p) => levelOf(p).level))].map((k) => levelInfo(k, programmes))
    .sort((a, b) => rank(a.key) - rank(b.key))
  const firstName = childName.trim().split(' ')[0] || 'the child'

  function chooseLevel(key: LevelKey) {
    setLevel(key)
    const options = programmes.filter((p) => levelOf(p).level === key)
    // A programme of its own (the Learning Center) has one option: it's chosen already.
    setProgrammeId(options.length === 1 ? options[0]!.id : options.some((p) => p.id === programmeId) ? programmeId : null)
    setStep(2)
  }

  const titles = { 1: `Which class is ${firstName} joining?`, 2: `Which programme, ${firstName}?` }

  return (
    <Sheet open={open} onClose={onClose} title={titles[step]} wide>
      <div className="mb-6 flex items-center gap-3">
        {step > 1 && (
          <Button size="md" variant="quiet" className="shrink-0" icon={<ArrowLeft />} onClick={() => setStep(1)}>All classes</Button>
        )}
        <ol className="ml-auto grid w-full max-w-[240px] grid-cols-2 gap-2" aria-label={`Step ${step} of 2: ${STEPS[step - 1]}`}>
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
              {firstName} is {formatAge(dateOfBirth)} today. Suggested: {levelInfo(suggestion, programmes).label}.
            </Notice>
          )}
          <p className="kicker mb-2.5">Preschool classes</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {available.filter((l) => !l.standalone).map((l) => (
              <button key={l.key} type="button" onClick={() => chooseLevel(l.key)} aria-pressed={l.key === level} className="choice flex items-start gap-3.5 p-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-md bg-accent-soft text-accent [&_svg]:size-6" aria-hidden>{levelIcon(l.key)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-h3">{l.label}</span>
                    {l.key === suggestion && <Pill tone="accent" icon={<Sparkles />}>Suggested</Pill>}
                  </span>
                  {l.ages && <span className="mt-0.5 block text-small font-bold text-ink">{l.ages}</span>}
                  {l.blurb && <span className="mt-1 block text-small font-medium text-ink-2">{l.blurb}</span>}
                </span>
              </button>
            ))}
          </div>
          <p className="kicker mb-2.5 mt-6">Programmes of their own</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {available.filter((l) => l.standalone).map((l) => (
              <button key={l.key} type="button" onClick={() => chooseLevel(l.key)} aria-pressed={l.key === level} className="choice flex items-start gap-3.5 p-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-md bg-accent-soft text-accent [&_svg]:size-6" aria-hidden>{levelIcon(l.key)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-h3">{l.label}</span>
                    {l.key === suggestion && <Pill tone="accent" icon={<Sparkles />}>Suggested</Pill>}
                  </span>
                  {l.ages && <span className="mt-0.5 block text-small font-bold text-ink">{l.ages}</span>}
                  {l.blurb && <span className="mt-1 block text-small font-medium text-ink-2">{l.blurb}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div key="plans" className="page-in grid gap-3" role="radiogroup" aria-label="Programme">
          <p className="text-body text-ink-2">Each programme has its own drop-off and pickup times.</p>
          {plans.map((p) => {
            const info = planInfo(levelOf(p).plan ?? '')
            return (
              <button key={p.id} type="button" role="radio" onClick={() => setProgrammeId(p.id)} aria-checked={p.id === programmeId} className="choice p-5">
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

      {step === 2 && (
        <SheetFooter>
          <Button size="xl" className="w-full" icon={<Check />} disabled={!programmeId} onClick={() => programmeId && onPick(programmeId)}>
            {chosen ? `Use ${chosen.name}` : 'Choose a programme'}
          </Button>
        </SheetFooter>
      )}
    </Sheet>
  )
}
