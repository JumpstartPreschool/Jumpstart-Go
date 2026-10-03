import { describe, expect, it } from 'vitest'
import { isEmail, passwordFor, patternProblem } from './passwordPattern'

describe('password pattern', () => {
  it('builds the password from words in the email, keeping fixed text and case', () => {
    expect(passwordFor('{First}@{domain}#2026', 'Priya.Sharma92@gmail.com')).toBe('Priya@gmail#2026')
    expect(passwordFor('{last}{digits}!{FIRST}', 'priya.sharma92@gmail.com')).toBe('sharma92!PRIYA')
    expect(passwordFor('{Name}-js', 'priya.sharma92@gmail.com')).toBe('Priya.sharma92-js')
  })

  it('uses the one word as both first and last, and nothing for missing digits', () => {
    expect(passwordFor('{first}{last}{digits}xx', 'ravi@school.in')).toBe('raviravixx')
  })

  it('accepts a good pattern', () => {
    expect(patternProblem('{First}@{domain}#2026')).toBeNull()
  })

  it('refuses patterns that give everyone the same password, are too short, or are malformed', () => {
    expect(patternProblem('')).toMatch(/Type a pattern/)
    expect(patternProblem('Jumpstart2026!')).toMatch(/at least one word/)
    expect(patternProblem('{digits}Jumpstart')).toMatch(/at least one word/)
    expect(patternProblem('{first}12')).toMatch(/at least 8/)
    expect(patternProblem('{first@2026xx')).toMatch(/both braces/)
    expect(patternProblem('{surname}#2026xx')).toMatch(/isn't a word/)
    expect(patternProblem(`{first}${'x'.repeat(70)}`)).toMatch(/under 64/)
  })

  it('every accepted pattern gives at least 8 characters, even for the shortest email', () => {
    const p = '{first}{last}#2026x'
    expect(patternProblem(p)).toBeNull()
    expect(passwordFor(p, 'a@b.co').length).toBeGreaterThanOrEqual(8)
  })

  it('recognises an email address', () => {
    expect(isEmail('priya@gmail.com')).toBe(true)
    expect(isEmail('priya@gmail')).toBe(false)
    expect(isEmail('priya gmail.com')).toBe(false)
  })
})
