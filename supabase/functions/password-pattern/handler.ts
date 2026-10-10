// Issues one person's temporary password from the admin's pattern (D55, 0048). Kept apart from index.ts so it runs
// under Vitest with fakes. The password is returned to the admin once and never logged or stored in plain text.
import { checkPattern, generate, passwordProblem, type Block, type Policy } from '../_shared/passwordPattern.ts'

/** What admin_begin_temp_password says to make, after checking the caller is the admin and the person may have one. */
export interface Target { profile_id: string; user_id: string | null; full_name: string; email: string; phone: string | null; blocks: Block[]; policy: Policy }

export interface Deps {
  /** As the admin: the checks, the person's pattern and the rules; marks them as expecting a temporary password. */
  begin: (profileId: string) => Promise<Target>
  createUser: (u: { email: string; phone: string | null; password: string }) => Promise<string>
  updateUser: (id: string, u: { email: string; password: string }) => Promise<void>
  /** Service role: links a new account, sets the expiry; resolves with when it ends. */
  finish: (profileId: string, userId: string) => Promise<string>
  randomInt?: (max: number) => number
}

export type Body = { action: 'issue'; profile_id: string }
export interface Result { password: string; expires_at: string }

/** A refused request, with words the admin can act on. */
export class Refused extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function parseBody(raw: unknown): Body {
  const b = (raw ?? {}) as Record<string, unknown>
  if (b.action === 'issue' && typeof b.profile_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.profile_id)) return { action: 'issue', profile_id: b.profile_id }
  throw new Refused(400, 'Choose who to issue a temporary password for.')
}

/** Supabase Auth's reasons, in words for the admin. Never includes the password. */
export function reasonFor(e: unknown): string {
  const m = String((e as { message?: unknown })?.message ?? '')
  if (/already (been )?registered|already exists|duplicate/i.test(m)) return 'Another sign-in already uses this email or mobile.'
  if (/password/i.test(m)) return "Supabase didn't accept the password. Check that Supabase's own password rules aren't stricter than yours (Authentication → Providers → Email)."
  if (/email/i.test(m)) return "Supabase didn't accept the email address."
  return "The temporary password couldn't be set. Try again."
}

export async function handle(deps: Deps, body: Body): Promise<Result> {
  const t = await deps.begin(body.profile_id)
  // The database checked the pattern already; checked again here so a bad row can never make a weak password.
  const check = checkPattern(t.blocks, t.policy)
  if (check.problem) throw new Refused(400, `${check.problem} Fix the pattern in Settings first.`)
  const password = generate(t.blocks, { full_name: t.full_name, email: t.email }, deps.randomInt)
  if (passwordProblem(password, t.policy)) throw new Refused(400, "The pattern made a password the rules don't allow. Check the pattern in Settings.")
  let userId = t.user_id
  try {
    if (userId) await deps.updateUser(userId, { email: t.email, password })
    else userId = await deps.createUser({ email: t.email, phone: t.phone, password })
  } catch (e) {
    throw new Refused(400, reasonFor(e))
  }
  const expires_at = await deps.finish(t.profile_id, userId)
  return { password, expires_at }
}
