/**
 * How Jumpstart describes its programmes (jumpstartpreschool.in, PRD §5), used to present the programmes
 * stored in the database. Programme names follow "<Level> · <Plan>", e.g. "Nursery · 360°".
 * Timings always come from the database, so the core team's edits show here straight away.
 */
import type { ProgrammeRow } from './api'

export type LevelKey = 'Playgroup' | 'Nursery' | 'Jr KG' | 'Sr KG' | 'Learning Center' | 'After School Program' | 'Preschool Readiness Program'

export interface Level {
  key: LevelKey
  label: string
  ages: string
  /** Age range in months, for the suggestion from the date of birth (upper bound exclusive). */
  months: [number, number]
  color: string
  blurb: string
  /** Standalone programmes have no plans to choose from. */
  standalone: boolean
}

export const LEVELS: Level[] = [
  { key: 'Playgroup', label: 'Playgroup', ages: '2–3 years', months: [24, 36], color: 'var(--rb-red)', blurb: 'Independent learners, social skills and motor skills.', standalone: false },
  { key: 'Nursery', label: 'Nursery', ages: '3–4 years', months: [36, 48], color: 'var(--rb-orange)', blurb: 'Learning through exploration and early academic readiness.', standalone: false },
  { key: 'Jr KG', label: 'Jr KG', ages: '4–5 years', months: [48, 60], color: 'var(--rb-green)', blurb: 'Logic, reasoning and more focus on academic readiness.', standalone: false },
  { key: 'Sr KG', label: 'Sr KG', ages: '5–6 years', months: [60, 72], color: 'var(--rb-teal)', blurb: 'Preparation for primary school and confidence building.', standalone: false },
  { key: 'Learning Center', label: 'Learning Center', ages: '6 months–8 years', months: [6, 96], color: 'var(--rb-blue)', blurb: 'Daycare with meals and activities; parents choose their hours between 9 AM and 7 PM.', standalone: true },
  { key: 'Preschool Readiness Program', label: 'Preschool Readiness', ages: '18 months–2 years', months: [18, 24], color: 'var(--rb-violet)', blurb: 'A 3-month course that gets toddlers ready for Playgroup.', standalone: true },
  { key: 'After School Program', label: 'After School', ages: '4–8 years', months: [48, 96], color: 'var(--rb-yellow)', blurb: 'Sports, art, language and life skills after primary school.', standalone: true },
]

export interface PlanInfo { title: string; blurb: string; meals: string }

/** The plans a class level offers, as the website describes them. */
export function planInfo(plan: string): PlanInfo {
  if (plan.startsWith('Half day')) {
    const shift = plan.includes('morning') ? ' · morning' : plan.includes('afternoon') ? ' · afternoon' : ''
    return { title: `Half day${shift}`, blurb: 'The core preschool hours.', meals: 'Meals not included (available at extra cost)' }
  }
  if (plan === '360°+') return { title: '360°+', blurb: 'Preschool plus the Learning Center all year (June–May), 9 AM to 7 PM.', meals: 'Meals included' }
  if (plan === '360°') return { title: '360°', blurb: 'Full-day preschool: lunch, milk, snacks, fruit and a 45-minute rest.', meals: 'Meals included' }
  return { title: plan, blurb: '', meals: '' }
}

/** Order plans the way the website lists them: half day (morning, afternoon), 360°, 360°+. */
export function planRank(plan: string | null): number {
  if (!plan) return 0
  if (plan.startsWith('Half day')) return plan.includes('afternoon') ? 2 : 1
  return plan === '360°' ? 3 : plan === '360°+' ? 4 : 5
}

export function levelOf(programme: ProgrammeRow): { level: LevelKey; plan: string | null } {
  const [level, plan] = programme.name.split(' · ') as [string, string | undefined]
  return { level: level as LevelKey, plan: plan ?? null }
}

/** Age in whole months on a date (for the level suggestion). */
export function ageInMonths(dateOfBirth: string, on: Date): number {
  const dob = new Date(`${dateOfBirth}T00:00:00`)
  let months = (on.getFullYear() - dob.getFullYear()) * 12 + (on.getMonth() - dob.getMonth())
  if (on.getDate() < dob.getDate()) months -= 1
  return months
}

/** The class level that fits a child's age at the start of the academic year (1 June). */
export function suggestedLevel(dateOfBirth: string, today = new Date()): LevelKey | null {
  if (!dateOfBirth) return null
  const yearStart = new Date(today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1, 5, 1)
  const months = ageInMonths(dateOfBirth, yearStart)
  const classLevel = LEVELS.find((l) => !l.standalone && months >= l.months[0] && months < l.months[1])
  if (classLevel) return classLevel.key
  if (months >= 18 && months < 24) return 'Preschool Readiness Program'
  return months >= 6 && months < 96 ? 'Learning Center' : null
}

export function formatAge(dateOfBirth: string, today = new Date()): string {
  const m = ageInMonths(dateOfBirth, today)
  if (m < 0) return ''
  const years = Math.floor(m / 12)
  const months = m % 12
  return years === 0 ? `${months} months` : months === 0 ? `${years} y` : `${years} y ${months} m`
}
