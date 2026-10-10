import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BLOCKS, DEFAULT_POLICY, RECOMMENDED, SPECIALS, checkPattern, cryptoInt, generate, isEmail, lengthOf, passwordProblem,
  policyProblem, randomBits, rulesText, summary, type Block, type Policy,
} from './passwordPattern'

const priya = { full_name: 'Priya Sharma', email: 'priya.sharma@example.com' }
const policy = (over: Partial<Policy> = {}): Policy => ({ ...DEFAULT_POLICY, ...over })
/** Hands out the given numbers in order, so a test can say exactly which "random" character each block gets. */
const seq = (...values: number[]) => { const q = [...values]; return () => q.shift() ?? 0 }
const n = (type: 'EMAIL_FIRST' | 'EMAIL_LAST' | 'FIRST_NAME' | 'LAST_NAME' | 'RANDOM_NUMBER' | 'RANDOM_LETTER' | 'RANDOM_UPPER' | 'RANDOM_LOWER' | 'RANDOM_SPECIAL', count: number): Block => ({ type, n: count })

afterEach(() => vi.restoreAllMocks())

describe('generate', () => {
  it('makes the recommended pattern for Priya from exactly the random numbers it is given', () => {
    // EMAIL_FIRST 4 = "priy"; RANDOM_UPPER 2 = A, Z; RANDOM_NUMBER 4 = 1234; RANDOM_SPECIAL 1 = SPECIALS[2] = "#"
    expect(generate(RECOMMENDED, priya, seq(0, 25, 1, 2, 3, 4, 2))).toBe('priyAZ1234#')
    expect(SPECIALS[2]).toBe('#')
  })

  it('draws each random block from its own alphabet', () => {
    expect(generate([n('RANDOM_NUMBER', 2)], priya, (m) => m - 1)).toBe('99')
    expect(generate([n('RANDOM_UPPER', 2)], priya, (m) => m - 1)).toBe('ZZ')
    expect(generate([n('RANDOM_LOWER', 2)], priya, (m) => m - 1)).toBe('zz')
    expect(generate([n('RANDOM_LETTER', 2)], priya, (m) => m - 1)).toBe('ZZ')
    expect(generate([n('RANDOM_LETTER', 1)], priya, () => 0)).toBe('a')
    expect(generate([n('RANDOM_SPECIAL', 2)], priya, (m) => m - 1)).toBe('==')
  })

  it('takes name and email blocks as small letters, and keeps fixed text as typed', () => {
    const blocks: Block[] = [n('FIRST_NAME', 3), n('LAST_NAME', 3), n('EMAIL_FIRST', 2), n('EMAIL_LAST', 2), { type: 'FIXED_TEXT', text: 'Ab#1' }]
    expect(generate(blocks, { full_name: 'Priya Sharma', email: 'raj.kumar@example.com' }, () => 0)).toBe('prisharakuAb#1')
  })

  it('pads a short name with random small letters, so the length is always lengthOf(blocks)', () => {
    const blocks = [n('FIRST_NAME', 6), n('RANDOM_NUMBER', 4)]
    const out = generate(blocks, { full_name: 'Al Bo', email: 'x@y.com' }, seq(0, 1, 2, 3, 0, 0, 0, 0))
    expect(out).toBe('alabcd' + '0000')
    expect(out).toHaveLength(lengthOf(blocks))
    // an email with no letters at all is filled entirely
    expect(generate([n('EMAIL_FIRST', 4)], { full_name: '', email: '1234@y.com' }, () => 2)).toBe('cccc')
  })

  it('strips accents from names', () => {
    expect(generate([n('FIRST_NAME', 3), n('LAST_NAME', 8)], { full_name: 'Zoë Ångström', email: 'z@y.com' }, () => 0)).toBe('zoe' + 'angstrom')
  })
})

describe('checkPattern', () => {
  it('accepts the recommended pattern under the default rules as acceptable', () => {
    const c = checkPattern(RECOMMENDED, DEFAULT_POLICY)
    expect(c.problem).toBeNull()
    expect(c.length).toBe(11)
    expect(c.bits).toBeCloseTo(2 * Math.log2(26) + 4 * Math.log2(10) + Math.log2(12), 5)
    expect(c.strength).toBe('acceptable')
  })

  it('refuses for each reason, in the documented order', () => {
    const p = DEFAULT_POLICY
    expect(checkPattern([], p).problem).toBe('Add at least one block.')
    expect(checkPattern(Array.from({ length: 13 }, () => n('RANDOM_NUMBER', 1)), p).problem).toBe('Use at most 12 blocks.')
    expect(checkPattern([{ type: 'FIXED_TEXT', text: 'has space' }, n('RANDOM_UPPER', 8)], p).problem).toMatch(/^Fixed text needs 1 to 16/)
    expect(checkPattern([{ type: 'FIXED_TEXT', text: '' }, n('RANDOM_UPPER', 8)], p).problem).toMatch(/^Fixed text/)
    expect(checkPattern([{ type: 'FIXED_TEXT', text: 'x'.repeat(17) }, n('RANDOM_UPPER', 8)], p).problem).toMatch(/^Fixed text/)
    expect(checkPattern([n('RANDOM_UPPER', 0)], p).problem).toMatch(/choose 1 to 16 characters/)
    expect(checkPattern([n('RANDOM_UPPER', 17)], p).problem).toMatch(/choose 1 to 16 characters/)
    expect(checkPattern([n('RANDOM_UPPER', 1.5)], p).problem).toMatch(/choose 1 to 16 characters/)
    expect(checkPattern([{ type: 'NOPE', n: 3 } as unknown as Block], p).problem).toMatch(/isn't one the pattern knows/)
    expect(checkPattern([n('EMAIL_FIRST', 12)], p).problem).toMatch(/^Add a random block/)
    expect(checkPattern([n('EMAIL_FIRST', 9), n('RANDOM_NUMBER', 1)], p).problem).toMatch(/^The random part is too small: about 3 bits, and at least 24 are needed/)
    // 24+ bits of randomness but only 6 characters long
    expect(checkPattern([n('RANDOM_UPPER', 6)], p).problem).toBe('Passwords would be only 6 characters; the rules need at least 10.')
    expect(checkPattern([n('RANDOM_LETTER', 16), n('RANDOM_LETTER', 16), n('RANDOM_LETTER', 16), n('RANDOM_LETTER', 16), n('RANDOM_LETTER', 16)], p).problem)
      .toBe('Passwords would be 80 characters; the rules allow at most 64.')
  })

  it('reports the first fault when a pattern has several', () => {
    // bad fixed text beats "no random block"; "no random block" beats length and classes
    expect(checkPattern([{ type: 'FIXED_TEXT', text: 'a b' }], DEFAULT_POLICY).problem).toMatch(/^Fixed text/)
    expect(checkPattern([n('EMAIL_FIRST', 2)], DEFAULT_POLICY).problem).toMatch(/^Add a random block/)
    // too small a random part beats too short
    expect(checkPattern([n('EMAIL_FIRST', 4), n('RANDOM_NUMBER', 2)], DEFAULT_POLICY).problem).toMatch(/random part is too small/)
  })

  it('refuses a pattern that can miss a required kind of character', () => {
    const p = DEFAULT_POLICY
    expect(checkPattern([n('EMAIL_FIRST', 4), n('RANDOM_LOWER', 6), n('RANDOM_NUMBER', 4), n('RANDOM_SPECIAL', 1)], p).problem).toMatch(/need a capital/)
    expect(checkPattern([n('RANDOM_UPPER', 6), n('RANDOM_NUMBER', 4), n('RANDOM_SPECIAL', 1)], p).problem).toMatch(/need a small letter/)
    expect(checkPattern([n('EMAIL_FIRST', 4), n('RANDOM_UPPER', 6), n('RANDOM_SPECIAL', 1)], p).problem).toMatch(/need a digit/)
    expect(checkPattern([n('EMAIL_FIRST', 4), n('RANDOM_UPPER', 2), n('RANDOM_NUMBER', 6)], p).problem).toMatch(/need a symbol/)
  })

  it('counts fixed text as guaranteeing a kind, and only a kind that is required', () => {
    const noSymbol = [n('EMAIL_FIRST', 4), n('RANDOM_UPPER', 2), n('RANDOM_NUMBER', 6)]
    expect(checkPattern([...noSymbol, { type: 'FIXED_TEXT', text: '#' }], DEFAULT_POLICY).problem).toBeNull()
    expect(checkPattern(noSymbol, policy({ require_special: false })).problem).toBeNull()
  })

  it('does not treat RANDOM_LETTER as guaranteeing a capital or a small letter', () => {
    const blocks = [n('RANDOM_LETTER', 8), n('RANDOM_NUMBER', 3), n('RANDOM_SPECIAL', 1)]
    expect(checkPattern(blocks, DEFAULT_POLICY).problem).toMatch(/need a capital/)
    expect(checkPattern(blocks, policy({ require_upper: false })).problem).toMatch(/need a small letter/)
    expect(checkPattern(blocks, policy({ require_upper: false, require_lower: false })).problem).toBeNull()
  })

  it('grades strength: refused is weak, 24 to 39 bits acceptable, 40 and over strong', () => {
    expect(checkPattern([], DEFAULT_POLICY).strength).toBe('weak')
    expect(checkPattern([n('EMAIL_FIRST', 9), n('RANDOM_NUMBER', 1)], DEFAULT_POLICY).strength).toBe('weak')
    const accept = checkPattern(RECOMMENDED, DEFAULT_POLICY)
    expect(accept.bits).toBeGreaterThanOrEqual(24)
    expect(accept.bits).toBeLessThan(40)
    expect(accept.strength).toBe('acceptable')
    const strong = checkPattern([...RECOMMENDED, n('RANDOM_LETTER', 6)], DEFAULT_POLICY)
    expect(strong.bits).toBeGreaterThanOrEqual(40)
    expect(strong.problem).toBeNull()
    expect(strong.strength).toBe('strong')
  })
})

describe('randomBits and lengthOf', () => {
  it('count only random blocks as bits, and every block as length', () => {
    expect(randomBits([n('EMAIL_FIRST', 8), { type: 'FIXED_TEXT', text: 'abc' }])).toBe(0)
    expect(randomBits([n('RANDOM_NUMBER', 3)])).toBeCloseTo(3 * Math.log2(10), 8)
    expect(randomBits([n('RANDOM_LETTER', 2)])).toBeCloseTo(2 * Math.log2(52), 8)
    expect(lengthOf([n('FIRST_NAME', 5), { type: 'FIXED_TEXT', text: 'abc' }, n('RANDOM_SPECIAL', 2)])).toBe(10)
  })

  it('has a builder entry for every block type', () => {
    expect(BLOCKS.map((b) => b.type).sort()).toEqual(
      ['EMAIL_FIRST', 'EMAIL_LAST', 'FIRST_NAME', 'FIXED_TEXT', 'LAST_NAME', 'RANDOM_LETTER', 'RANDOM_LOWER', 'RANDOM_NUMBER', 'RANDOM_SPECIAL', 'RANDOM_UPPER'])
    expect(summary(RECOMMENDED)).toBe('Email first 4 → Random capitals 2 → Random digits 4 → Symbol 1')
    expect(summary([{ type: 'FIXED_TEXT', text: 'Zz' }])).toBe('"Zz"')
  })
})

describe('randomness', () => {
  it('10,000 passwords from the real random source all pass the default rules at the expected length', () => {
    for (let i = 0; i < 10_000; i++) {
      const pw = generate(RECOMMENDED, priya)
      expect(passwordProblem(pw, DEFAULT_POLICY), pw).toBeNull()
      expect(pw).toHaveLength(lengthOf(RECOMMENDED))
      expect(pw.startsWith('priy')).toBe(true)
    }
  })

  it('cryptoInt never returns max or more, and reaches every value', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 5_000; i++) {
      const v = cryptoInt(12)
      expect(Number.isInteger(v) && v >= 0 && v < 12).toBe(true)
      seen.add(v)
    }
    expect(seen.size).toBe(12)
    expect(cryptoInt(1)).toBe(0)
  })

  it('cryptoInt redraws a value from the incomplete last range instead of folding it back (no modulo bias)', () => {
    // for max 12 the last full range ends at 4294967292, so 4294967295 must be thrown away
    const draws = [4_294_967_295, 4_294_967_292, 7]
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(((buf: Uint32Array) => { buf[0] = draws.shift()!; return buf }) as typeof crypto.getRandomValues)
    expect(cryptoInt(12)).toBe(7)
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('never uses Math.random in the source', () => {
    const code = readFileSync(new URL('./passwordPattern.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('Math.random')
    expect(code).toContain('crypto.getRandomValues')
  })
})

describe('passwordProblem', () => {
  const p = DEFAULT_POLICY
  it('accepts a password that follows the rules', () => {
    expect(passwordProblem('Garden-Swing-42', p)).toBeNull()
  })

  it('names the first rule a password breaks', () => {
    expect(passwordProblem('Ab1!', p)).toBe('Use at least 10 characters.')
    expect(passwordProblem('a'.repeat(65), p)).toBe('Use at most 64 characters.')
    expect(passwordProblem('garden-swing-42', p)).toBe('Add a capital letter.')
    expect(passwordProblem('GARDEN-SWING-42', p)).toBe('Add a small letter.')
    expect(passwordProblem('Garden-Swing-xx', p)).toBe('Add a digit.')
    expect(passwordProblem('GardenSwing42', p)).toBe('Add a symbol, like ! or #.')
  })

  it('refuses what bcrypt would silently cut: more than 72 bytes, even under the character limit', () => {
    expect(passwordProblem('Aaé1!' + 'é'.repeat(30), policy({ max_length: 72 }))).toBeNull()
    expect(passwordProblem('Aaé1!' + 'é'.repeat(40), policy({ max_length: 72 }))).toBe('Use at most 72 characters.')
  })

  it('skips a kind the school does not require', () => {
    expect(passwordProblem('gardenswingxx', policy({ require_upper: false, require_number: false, require_special: false }))).toBeNull()
    expect(passwordProblem('gardenswingxx', policy({ require_upper: false, require_number: false }))).toBe('Add a symbol, like ! or #.')
  })
})

describe('policyProblem', () => {
  it('accepts the default and the limits themselves', () => {
    expect(policyProblem(DEFAULT_POLICY)).toBeNull()
    expect(policyProblem(policy({ min_length: 64, max_length: 72, temp_expiry_hours: 168, reuse_count: 24, max_failed: 20, lock_minutes: 1440 }))).toBeNull()
    expect(policyProblem(policy({ min_length: 10, max_length: 10, temp_expiry_hours: 1, reuse_count: 0, max_failed: 3, lock_minutes: 1 }))).toBeNull()
  })

  it('refuses each value outside its limit, naming it', () => {
    expect(policyProblem(policy({ min_length: 9 }))).toBe('Shortest password: choose 10 to 64.')
    expect(policyProblem(policy({ min_length: 65 }))).toMatch(/^Shortest password/)
    expect(policyProblem(policy({ max_length: 73 }))).toBe('Longest password: choose 10 to 72.')
    expect(policyProblem(policy({ temp_expiry_hours: 0 }))).toMatch(/^Temporary password lasts/)
    expect(policyProblem(policy({ temp_expiry_hours: 169 }))).toMatch(/^Temporary password lasts/)
    expect(policyProblem(policy({ reuse_count: -1 }))).toMatch(/^Recent passwords/)
    expect(policyProblem(policy({ reuse_count: 25 }))).toMatch(/^Recent passwords/)
    expect(policyProblem(policy({ max_failed: 2 }))).toMatch(/^Wrong tries/)
    expect(policyProblem(policy({ lock_minutes: 1441 }))).toMatch(/^Lock lasts/)
    expect(policyProblem(policy({ lock_minutes: 1.5 }))).toMatch(/^Lock lasts/)
    expect(policyProblem(policy({ max_failed: Number.NaN }))).toMatch(/^Wrong tries/)
  })

  it('refuses a longest password shorter than the shortest', () => {
    expect(policyProblem(policy({ min_length: 20, max_length: 15 }))).toBe('The longest password must be at least as long as the shortest.')
  })
})

describe('rulesText', () => {
  it('lists the required kinds in words', () => {
    expect(rulesText(DEFAULT_POLICY)).toBe('At least 10 characters, with a capital, a small letter, a digit and a symbol.')
    expect(rulesText(policy({ require_upper: false, require_lower: false, require_special: false }))).toBe('At least 10 characters, with a digit.')
    expect(rulesText(policy({ min_length: 12, require_lower: false, require_special: false }))).toBe('At least 12 characters, with a capital and a digit.')
    expect(rulesText(policy({ require_upper: false, require_lower: false, require_number: false, require_special: false }))).toBe('At least 10 characters.')
  })
})

describe('isEmail', () => {
  it('recognises an email address', () => {
    expect(isEmail('priya@gmail.com')).toBe(true)
    expect(isEmail(' priya@gmail.com ')).toBe(true)
    expect(isEmail('priya@gmail')).toBe(false)
    expect(isEmail('priya gmail.com')).toBe(false)
  })
})
