import { expect, it } from 'vitest'
import { passwordProblem, passwordStrength } from './password'

const email = 'priya.shah@example.com'

it('refuses short, common, repeated and email-based passwords', () => {
  expect(passwordProblem('short1', email)).toMatch(/at least 8/)
  expect(passwordProblem('Password123', email)).toMatch(/too easy/)
  expect(passwordProblem('aaaaaaaaaa', email)).toMatch(/too easy/)
  expect(passwordProblem('priya.shah2026', email)).toMatch(/email/)
  expect(passwordProblem('x'.repeat(40) + 'é'.repeat(20), email)).toMatch(/shorter/)
  expect(passwordProblem('blue kite river', email)).toBeNull()
})

it('grades what it accepts', () => {
  expect(passwordStrength('password', email)).toBe('weak')
  expect(passwordStrength('kitebird9', email)).toBe('okay')
  expect(passwordStrength('Kite-bird-92', email)).toBe('strong')
  expect(passwordStrength('blue kite river', email)).toBe('strong')
})
