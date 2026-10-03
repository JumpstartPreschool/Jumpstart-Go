// The admin's password pattern (Settings → Email sign-in): every email account's starting password is built from words
// in that person's email address plus fixed text. Shared by the password-pattern function (which sets the passwords)
// and the admin's preview, so what the admin sees is exactly what is set.
//
// Tokens, each written in lower case, Capitalised or UPPER case to set the case of what it inserts:
//   {name}    everything before the @            priya.sharma92@gmail.com → priya.sharma92
//   {first}   the first word before the @        → priya
//   {last}    the last word before the @         → sharma (the first word again when there is only one)
//   {digits}  the digits before the @            → 92 (nothing when there are none)
//   {domain}  the part after the @, up to the dot → gmail
// Anything outside braces is kept as typed: {First}@{domain}#2026 → Priya@gmail#2026

export const PASSWORD_MIN = 8
const PATTERN_MAX = 64
const TOKEN = /\{([a-zA-Z]+)\}/g
const NAMES = ['name', 'first', 'last', 'digits', 'domain'] as const
type TokenName = (typeof NAMES)[number]

export const PATTERN_TOKENS: ReadonlyArray<{ token: string; means: string }> = [
  { token: '{first}', means: 'first word of the email' },
  { token: '{last}', means: 'last word of the email' },
  { token: '{name}', means: 'everything before the @' },
  { token: '{digits}', means: 'numbers before the @' },
  { token: '{domain}', means: 'the email provider, like gmail' },
]

function caseOf(raw: string): { name: TokenName; style: 'lower' | 'cap' | 'upper' } | null {
  const name = raw.toLowerCase() as TokenName
  if (!NAMES.includes(name)) return null
  const style = raw === raw.toUpperCase() && raw.length > 1 ? 'upper' : raw[0] === raw[0]!.toUpperCase() ? 'cap' : 'lower'
  return { name, style }
}

/** Why a pattern can't be used, in words for the admin; null when it is fine. */
export function patternProblem(pattern: string): string | null {
  const p = pattern.trim()
  if (!p) return 'Type a pattern, like {First}@{domain}#2026.'
  if (p.length > PATTERN_MAX) return `Keep the pattern under ${PATTERN_MAX} characters.`
  if (/[{}]/.test(p.replace(TOKEN, ''))) return 'Each word needs both braces, like {first}.'
  const tokens = [...p.matchAll(TOKEN)].map((m) => m[1]!)
  const unknown = tokens.find((t) => !caseOf(t))
  if (unknown) return `{${unknown}} isn't a word the pattern knows. Use {first}, {last}, {name}, {digits} or {domain}.`
  // {digits} can be empty, so it doesn't count towards making passwords differ.
  if (!tokens.some((t) => t.toLowerCase() !== 'digits')) return 'Add at least one word from the email, like {first}, so each person gets a different password.'
  // Shortest possible result: the fixed text plus one letter per word that always has one.
  const fixed = p.replace(TOKEN, '').length
  const words = tokens.filter((t) => t.toLowerCase() !== 'digits').length
  if (fixed + words < PASSWORD_MIN) return `Passwords must have at least ${PASSWORD_MIN} characters. Add more fixed text, like #2026.`
  return null
}

function parts(email: string): Record<TokenName, string> {
  const [local = '', host = ''] = email.trim().toLowerCase().split('@')
  const words = local.split(/[^a-z]+/).filter(Boolean)
  return {
    name: local,
    first: words[0] ?? local,
    last: words[words.length - 1] ?? local,
    digits: local.replace(/\D/g, ''),
    domain: host.split('.')[0] ?? '',
  }
}

/** The password this pattern gives this email. Call only with a pattern patternProblem accepted. */
export function passwordFor(pattern: string, email: string): string {
  const values = parts(email)
  return pattern.trim().replace(TOKEN, (_, raw: string) => {
    const t = caseOf(raw)!
    const v = values[t.name]
    return t.style === 'upper' ? v.toUpperCase() : t.style === 'cap' ? v.charAt(0).toUpperCase() + v.slice(1) : v
  })
}

/** A plausible email address, as the admin types it on a person. */
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
