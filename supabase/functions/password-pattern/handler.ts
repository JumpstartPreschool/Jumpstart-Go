// Sets email passwords from the admin's pattern (0041). Kept apart from index.ts so it runs under Vitest with fakes.
import { passwordFor, patternProblem } from '../_shared/passwordPattern.ts'

export interface Target { profile_id: string; user_id: string | null; full_name: string; email: string | null; phone: string | null; action: 'set' | 'clear' }

/** What the handler needs: the database as the caller (admin checks, audit) and the Supabase Auth admin API. */
export interface Deps {
  savePattern: (pattern: string) => Promise<Target[]>
  personTarget: (profileId: string) => Promise<{ pattern: string; target: Target }>
  createUser: (u: { email: string; phone: string | null; password: string }) => Promise<string>
  updateUser: (id: string, u: { email?: string; password: string }) => Promise<void>
  mark: (profileId: string, userId: string | null, state: 'none' | 'pattern') => Promise<void>
  randomPassword: () => string
}

export type Body = { action: 'save'; pattern: string } | { action: 'reset'; profile_id: string }

export interface Result { updated: number; failed: Array<{ name: string; reason: string }>; password?: string }

/** A refused request, with words the admin can act on. */
export class Refused extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function parseBody(raw: unknown): Body {
  const b = (raw ?? {}) as Record<string, unknown>
  if (b.action === 'save' && typeof b.pattern === 'string') {
    const problem = patternProblem(b.pattern)
    if (problem) throw new Refused(400, problem)
    return { action: 'save', pattern: b.pattern.trim() }
  }
  if (b.action === 'reset' && typeof b.profile_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.profile_id)) return { action: 'reset', profile_id: b.profile_id }
  throw new Refused(400, 'Choose a pattern to save, or a person to reset.')
}

/** Supabase Auth's reasons, in words for the admin. Never includes the password. */
function reasonFor(e: unknown): string {
  const m = String((e as { message?: unknown })?.message ?? '')
  if (/already (been )?registered|already exists|duplicate/i.test(m)) return 'Another sign-in already uses this email or mobile.'
  if (/too long/.test(m)) return 'The pattern makes this password longer than 72 characters. Use {first} or {last} instead of {name}.'
  if (/password/i.test(m)) return "Supabase didn't accept the password. Check the password rules in Supabase → Authentication."
  if (/email/i.test(m)) return "Supabase didn't accept the email address."
  return "Couldn't be updated. Try again."
}

async function apply(deps: Deps, pattern: string, t: Target): Promise<void> {
  if (t.action === 'clear') {
    // No longer allowed in: a random password nobody knows, so the old pattern one stops working.
    if (t.user_id) await deps.updateUser(t.user_id, { password: deps.randomPassword() })
    await markOnce(deps, t.profile_id, t.user_id, 'none')
    return
  }
  const email = t.email!
  const password = passwordFor(pattern, email)
  // Supabase Auth hashes with bcrypt, which reads only the first 72 bytes.
  if (new TextEncoder().encode(password).length > 72) throw new Error('too long')
  let userId = t.user_id
  if (userId) await deps.updateUser(userId, { email, password })
  else userId = await deps.createUser({ email, phone: t.phone, password })
  // After the password write, which on its own would read as "chose their own".
  await markOnce(deps, t.profile_id, userId, 'pattern')
}

/** Marks which password they have, trying twice: left unmarked, a pattern password would read as one they chose. */
async function markOnce(deps: Deps, profileId: string, userId: string | null, state: 'none' | 'pattern') {
  try { await deps.mark(profileId, userId, state) } catch { await deps.mark(profileId, userId, state) }
}

// ponytail: 5 at a time, sequential batches. ceiling: ~1,000 accounts inside the function's time limit. upgrade: a
// queue table worked through by a scheduled job when the school passes that.
const BATCH = 5

export async function handle(deps: Deps, body: Body): Promise<Result> {
  if (body.action === 'reset') {
    const { pattern, target } = await deps.personTarget(body.profile_id)
    await apply(deps, pattern, target)
    return { updated: 1, failed: [], password: passwordFor(pattern, target.email!) }
  }
  const targets = await deps.savePattern(body.pattern)
  const failed: Result['failed'] = []
  let updated = 0
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH)
    const results = await Promise.allSettled(batch.map((t) => apply(deps, body.pattern, t)))
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') updated++
      else failed.push({ name: batch[j]!.full_name, reason: reasonFor(r.reason) })
    })
  }
  return { updated, failed }
}
