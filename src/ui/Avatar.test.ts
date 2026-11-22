import { expect, it } from 'vitest'
import { initials } from './Avatar'

it('takes the first and last names, ignoring notes in brackets', () => {
  expect(initials('Aarav Kulkarni')).toBe('AK')
  expect(initials('Isha')).toBe('I')
  expect(initials('Priya Mehta (Test)')).toBe('PM')
  expect(initials('  ankit   singh ')).toBe('AS')
})
