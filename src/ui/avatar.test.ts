import { describe, expect, it } from 'vitest'
import { adultKind, childKind } from './Avatar'

describe('3D figures for people (D39)', () => {
  it('shows a child as a boy, a girl, or a neutral child', () => {
    expect(childKind('boy')).toBe('boy')
    expect(childKind('girl')).toBe('girl')
    expect(childKind(null)).toBe('child')
  })
  it("reads an adult's relation, in English and the family words used at home", () => {
    expect(adultKind('Mother')).toBe('woman')
    expect(adultKind('Father')).toBe('man')
    expect(adultKind('Grandmother')).toBe('old-woman')
    expect(adultKind('Aaji')).toBe('old-woman')
    expect(adultKind('Ajoba')).toBe('old-man')
    expect(adultKind('Mausi')).toBe('woman')
    expect(adultKind('Uncle')).toBe('man')
    expect(adultKind('Driver')).toBe('person')
    expect(adultKind(null)).toBe('person')
  })
})
