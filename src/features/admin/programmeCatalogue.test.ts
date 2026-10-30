import { describe, expect, it } from 'vitest'
import { ageInMonths, formatAge, levelOf, planInfo, suggestedLevel } from './programmeCatalogue'

const today = new Date('2026-09-24T10:00:00')

describe('programme catalogue', () => {
  it('reads level and plan from the programme name', () => {
    expect(levelOf({ id: '1', name: 'Nursery · 360°', flexible: false, starts: '11:45', ends: '17:30' })).toEqual({ level: 'Nursery', plan: '360°' })
    expect(levelOf({ id: '2', name: 'Learning Center', flexible: true, starts: '09:00', ends: '19:00' })).toEqual({ level: 'Learning Center', plan: null })
  })
  it('suggests the class level from the age on 1 June', () => {
    expect(suggestedLevel('2023-08-10', today)).toBe('Playgroup') // 33 months on 1 June 2026
    expect(suggestedLevel('2023-05-01', today)).toBe('Nursery') // 37 months
    expect(suggestedLevel('2020-09-01', today)).toBe('Sr KG') // 68 months
    expect(suggestedLevel('2024-09-01', today)).toBe('Preschool Readiness Program') // 21 months
    expect(suggestedLevel('2025-03-01', today)).toBe('Learning Center') // 15 months: too young for a class
    expect(suggestedLevel('', today)).toBeNull()
  })
  it('works out ages', () => {
    expect(ageInMonths('2022-09-24', today)).toBe(48)
    expect(ageInMonths('2022-09-25', today)).toBe(47)
    expect(formatAge('2022-06-24', today)).toBe('4 y 3 m')
    expect(formatAge('2026-03-01', today)).toBe('6 months')
  })
  it('describes the plans like the website', () => {
    expect(planInfo('Half day (morning)').title).toBe('Half day · morning')
    expect(planInfo('360°').meals).toBe('Meals included')
    expect(planInfo('Half day').meals).toContain('not included')
  })
})
