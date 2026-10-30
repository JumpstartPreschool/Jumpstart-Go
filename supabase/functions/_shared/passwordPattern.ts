// Temporary passwords from the admin's pattern (D55, 0048). The admin builds a pattern from blocks in Settings →
// Authentication; a temporary password is made from it only when the admin issues one, shown to them once, and swapped
// for the person's own at their first sign-in. Shared by the password-pattern function (which makes the real ones),
// the admin's builder and preview, the choose-password screen and the demo, so they all follow one set of rules.
// The database repeats the pattern and policy checks (app.pattern_problem, 0048) so a bypassed editor changes nothing.
//
// Every pattern needs a random part of at least MIN_RANDOM_BITS: with names alone anyone who knows the pattern could
// work out every password. Randomness comes only from Web Crypto (crypto.getRandomValues), never Math.random.

export type NameBlock = 'FIRST_NAME' | 'LAST_NAME' | 'EMAIL_FIRST' | 'EMAIL_LAST'
export type RandomBlock = 'RANDOM_NUMBER' | 'RANDOM_LETTER' | 'RANDOM_UPPER' | 'RANDOM_LOWER' | 'RANDOM_SPECIAL'
export type Block = { type: NameBlock | RandomBlock; n: number } | { type: 'FIXED_TEXT'; text: string }
export type BlockType = Block['type']

export interface Policy {
  min_length: number
  max_length: number
  require_upper: boolean
  require_lower: boolean
  require_number: boolean
  require_special: boolean
  temp_expiry_hours: number
  reuse_count: number
  max_failed: number
  lock_minutes: number
}

export const DEFAULT_POLICY: Policy = {
  min_length: 10, max_length: 64, require_upper: true, require_lower: true, require_number: true, require_special: true,
  temp_expiry_hours: 48, reuse_count: 5, max_failed: 5, lock_minutes: 15,
}

/** The limits the admin can set; the same as the checks on public.password_policy. */
export const POLICY_LIMITS = {
  min_length: [10, 64], max_length: [10, 72], temp_expiry_hours: [1, 168], reuse_count: [0, 24], max_failed: [3, 20], lock_minutes: [1, 1440],
} as const

export const RECOMMENDED: Block[] = [
  { type: 'EMAIL_FIRST', n: 4 }, { type: 'RANDOM_UPPER', n: 2 }, { type: 'RANDOM_NUMBER', n: 4 }, { type: 'RANDOM_SPECIAL', n: 1 },
]

export const MIN_RANDOM_BITS = 24
export const STRONG_BITS = 40
export const MAX_BLOCKS = 12
export const MAX_COUNT = 16
export const MAX_FIXED = 16

const DIGITS = '0123456789'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = LOWER.toUpperCase()
/** Easy to read out and type on a phone: no quotes, spaces or look-alikes. */
export const SPECIALS = '!@#$%&*?-_+='

export const ALPHABET: Record<RandomBlock, string> = {
  RANDOM_NUMBER: DIGITS, RANDOM_LETTER: LOWER + UPPER, RANDOM_UPPER: UPPER, RANDOM_LOWER: LOWER, RANDOM_SPECIAL: SPECIALS,
}

/** What each block is called in the builder, and in the one-line summary. */
export const BLOCKS: ReadonlyArray<{ type: BlockType; label: string; means: string }> = [
  { type: 'EMAIL_FIRST', label: 'Email first', means: 'letters from the first word of the email' },
  { type: 'EMAIL_LAST', label: 'Email last', means: 'letters from the last word of the email' },
  { type: 'FIRST_NAME', label: 'First name', means: 'letters from their first name' },
  { type: 'LAST_NAME', label: 'Last name', means: 'letters from their last name' },
  { type: 'RANDOM_NUMBER', label: 'Random digits', means: '0 to 9' },
  { type: 'RANDOM_UPPER', label: 'Random capitals', means: 'A to Z' },
  { type: 'RANDOM_LOWER', label: 'Random small letters', means: 'a to z' },
  { type: 'RANDOM_LETTER', label: 'Random letters', means: 'a to z and A to Z' },
  { type: 'RANDOM_SPECIAL', label: 'Symbol', means: SPECIALS },
  { type: 'FIXED_TEXT', label: 'Fixed text', means: 'the same for everyone' },
]
export const labelOf = (t: BlockType) => BLOCKS.find((b) => b.type === t)!.label

const isRandom = (b: Block): b is { type: RandomBlock; n: number } => b.type.startsWith('RANDOM_')

/** Bits of randomness the random blocks add. Names and fixed text add none: anyone may know them. */
export function randomBits(blocks: Block[]): number {
  return blocks.reduce((sum, b) => sum + (isRandom(b) ? b.n * Math.log2(ALPHABET[b.type].length) : 0), 0)
}

/** Every password a pattern makes has exactly this many characters: a short name is filled with random letters. */
export const lengthOf = (blocks: Block[]) => blocks.reduce((sum, b) => sum + (b.type === 'FIXED_TEXT' ? b.text.length : b.n), 0)

function blockProblem(b: Block): string | null {
  if (b.type === 'FIXED_TEXT') {
    if (!/^[\x21-\x7e]{1,16}$/.test(b.text)) return `Fixed text needs 1 to ${MAX_FIXED} letters, digits or symbols, with no spaces.`
    return null
  }
  if (!BLOCKS.some((x) => x.type === b.type)) return "That block isn't one the pattern knows."
  if (!Number.isInteger(b.n) || b.n < 1 || b.n > MAX_COUNT) return `${labelOf(b.type)}: choose 1 to ${MAX_COUNT} characters.`
  return null
}

/** Whether every password from these blocks has this kind of character. Name blocks always give small letters. */
function guarantees(blocks: Block[], kind: 'upper' | 'lower' | 'number' | 'special'): boolean {
  const fixed = (re: RegExp) => blocks.some((b) => b.type === 'FIXED_TEXT' && re.test(b.text))
  if (kind === 'upper') return blocks.some((b) => b.type === 'RANDOM_UPPER') || fixed(/[A-Z]/)
  if (kind === 'lower') return blocks.some((b) => b.type === 'RANDOM_LOWER' || (!isRandom(b) && b.type !== 'FIXED_TEXT')) || fixed(/[a-z]/)
  if (kind === 'number') return blocks.some((b) => b.type === 'RANDOM_NUMBER') || fixed(/[0-9]/)
  return blocks.some((b) => b.type === 'RANDOM_SPECIAL') || fixed(/[^A-Za-z0-9]/)
}

const NEEDS = {
  upper: 'The rules need a capital letter. Add Random capitals, or a capital in fixed text.',
  lower: 'The rules need a small letter. Add Email first, a name block or Random small letters.',
  number: 'The rules need a digit. Add Random digits, or a digit in fixed text.',
  special: 'The rules need a symbol. Add Symbol, or a symbol in fixed text.',
} as const

export type Strength = 'weak' | 'acceptable' | 'strong'
export interface PatternCheck { problem: string | null; bits: number; length: number; strength: Strength }

/** Whether a pattern can be saved under this policy, how random it is, and why not, in words for the admin. */
export function checkPattern(blocks: Block[], policy: Policy): PatternCheck {
  const bits = randomBits(blocks)
  const length = lengthOf(blocks)
  const fail = (problem: string): PatternCheck => ({ problem, bits, length, strength: 'weak' })
  if (blocks.length === 0) return fail('Add at least one block.')
  if (blocks.length > MAX_BLOCKS) return fail(`Use at most ${MAX_BLOCKS} blocks.`)
  for (const b of blocks) {
    const p = blockProblem(b)
    if (p) return fail(p)
  }
  if (!blocks.some(isRandom)) return fail('Add a random block. Without one, anyone who knows the pattern could work out every password.')
  if (bits < MIN_RANDOM_BITS) return fail(`The random part is too small: about ${Math.floor(bits)} bits, and at least ${MIN_RANDOM_BITS} are needed. Add more random characters.`)
  if (length < policy.min_length) return fail(`Passwords would be only ${length} characters; the rules need at least ${policy.min_length}.`)
  if (length > policy.max_length) return fail(`Passwords would be ${length} characters; the rules allow at most ${policy.max_length}.`)
  for (const kind of ['upper', 'lower', 'number', 'special'] as const) {
    if (policy[`require_${kind}`] && !guarantees(blocks, kind)) return fail(NEEDS[kind])
  }
  return { problem: null, bits, length, strength: bits >= STRONG_BITS ? 'strong' : 'acceptable' }
}

/** "Email first 4 → Random capitals 2 → Random digits 4 → Symbol 1" */
export function summary(blocks: Block[]): string {
  return blocks.map((b) => (b.type === 'FIXED_TEXT' ? `"${b.text}"` : `${labelOf(b.type)} ${b.n}`)).join(' → ')
}

/** A whole number from 0 to max - 1 from Web Crypto, without modulo bias (values past the last full range are redrawn). */
export function cryptoInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0]! < limit) return buf[0]! % max
  }
}

/** Letters a to z only, accents removed: what the name blocks take from. */
const words = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/).filter(Boolean)

export interface Person { full_name: string; email: string }

/** A temporary password from this pattern for this person. Call only with a pattern checkPattern accepted. */
export function generate(blocks: Block[], person: Person, randomInt: (max: number) => number = cryptoInt): string {
  const pick = (alphabet: string, n: number) => Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join('')
  const name = words(person.full_name)
  const local = words(person.email.split('@')[0] ?? '')
  const source: Record<NameBlock, string> = {
    FIRST_NAME: name[0] ?? '', LAST_NAME: name[name.length - 1] ?? '',
    EMAIL_FIRST: local[0] ?? '', EMAIL_LAST: local[local.length - 1] ?? '',
  }
  return blocks.map((b) => {
    if (b.type === 'FIXED_TEXT') return b.text
    if (isRandom(b)) return pick(ALPHABET[b.type], b.n)
    const taken = source[b.type as NameBlock].slice(0, b.n)
    return taken + pick(LOWER, b.n - taken.length)
  }).join('')
}

/** Why a password someone chose breaks the rules, in words; null when it is fine. */
export function passwordProblem(password: string, policy: Policy): string | null {
  if (password.length < policy.min_length) return `Use at least ${policy.min_length} characters.`
  // Supabase Auth hashes with bcrypt, which reads only the first 72 bytes.
  if (password.length > policy.max_length || new TextEncoder().encode(password).length > 72) return `Use at most ${policy.max_length} characters.`
  if (policy.require_upper && !/[A-Z]/.test(password)) return 'Add a capital letter.'
  if (policy.require_lower && !/[a-z]/.test(password)) return 'Add a small letter.'
  if (policy.require_number && !/[0-9]/.test(password)) return 'Add a digit.'
  if (policy.require_special && !/[^A-Za-z0-9]/.test(password)) return 'Add a symbol, like ! or #.'
  return null
}

/** The rules in one line, for the choose-password screen. */
export function rulesText(policy: Policy): string {
  const needs = [policy.require_upper && 'a capital', policy.require_lower && 'a small letter', policy.require_number && 'a digit', policy.require_special && 'a symbol'].filter(Boolean)
  return `At least ${policy.min_length} characters${needs.length ? `, with ${needs.join(', ').replace(/, ([^,]*)$/, ' and $1')}` : ''}.`
}

/** Why a policy can't be saved, in words; null when it can. */
export function policyProblem(p: Policy): string | null {
  for (const [key, [lo, hi]] of Object.entries(POLICY_LIMITS) as Array<[keyof typeof POLICY_LIMITS, readonly [number, number]]>) {
    if (!Number.isInteger(p[key]) || p[key] < lo || p[key] > hi) return `${POLICY_NAMES[key]}: choose ${lo} to ${hi}.`
  }
  if (p.max_length < p.min_length) return 'The longest password must be at least as long as the shortest.'
  return null
}

export const POLICY_NAMES: Record<keyof typeof POLICY_LIMITS, string> = {
  min_length: 'Shortest password', max_length: 'Longest password', temp_expiry_hours: 'Temporary password lasts (hours)',
  reuse_count: 'Recent passwords that can’t be reused', max_failed: 'Wrong tries before a lock', lock_minutes: 'Lock lasts (minutes)',
}

/** A plausible email address, as the admin types it on a person. */
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
