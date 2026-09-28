/** Shortest password the app accepts. Set Supabase → Authentication → Providers → Email → Minimum password length to match. */
export const MIN_PASSWORD = 8
/** bcrypt, which Supabase uses, only reads the first 72 bytes; longer would silently not count. */
export const MAX_PASSWORD = 72

// ponytail: a short list of the most-guessed passwords, not a breach database. Supabase's leaked-password check (Pro
// plan) is the upgrade if brute-force guessing ever shows up in the auth logs.
const COMMON = new Set([
  '12345678', '123456789', '1234567890', '12345678910', '87654321', '11111111', '00000000', '88888888', '11223344',
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'qwerty123', 'qwertyuiop',
  'qwerty12', '1q2w3e4r', '1qaz2wsx', 'asdfghjk', 'asdf1234', 'abcd1234', 'abc12345', 'iloveyou', 'sunshine',
  'princess', 'welcome1', 'welcome123', 'football', 'baseball', 'superman', 'letmein1', 'trustno1', 'whatever',
  'starwars', 'dragon12', 'monkey12', 'india123', 'india@123', 'pune1234', 'admin123', 'admin@123', 'jumpstart',
  'jumpstart1', 'jumpstart123', 'jumpstart@123', 'preschool', 'preschool1', 'school123', 'teacher1', 'changeme',
])

export type Strength = 'weak' | 'okay' | 'strong'

/** Why a password can't be used, in the words the screen shows, or null when it can. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (new TextEncoder().encode(password).length > MAX_PASSWORD) return 'Use a shorter password (up to 72 characters).'
  const lower = password.toLowerCase()
  const name = email.toLowerCase().split('@')[0] ?? ''
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return 'Choose a stronger password. That one is too easy to guess.'
  if (lower === email.toLowerCase() || (name.length >= 4 && lower.includes(name))) return "Choose a stronger password. Don't use your email in it."
  return null
}

/** How hard the password is to guess, for the meter under the field. Length counts most, then variety. */
export function passwordStrength(password: string, email: string): Strength {
  if (passwordProblem(password, email)) return 'weak'
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length
  if (password.length >= 14 || (password.length >= 10 && kinds >= 3)) return 'strong'
  return 'okay'
}
