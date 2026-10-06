// Someone chooses their own email password (D55, 0048): after a temporary one, or to change it. Checks the rules and
// the recent passwords, sets it, and signs out their other devices. Kept apart from index.ts so it runs under Vitest.
import { passwordProblem, type Policy } from '../_shared/passwordPattern.ts'

export interface Deps {
  /** The signed-in person's auth user and whether they have email sign-in at all; null when not signed in. */
  caller: () => Promise<{ user_id: string; email_sign_in: 'none' | 'temporary' | 'own' } | null>
  policy: () => Promise<Policy>
  /** The current password or one of the last `count`. */
  reused: (userId: string, password: string, count: number) => Promise<boolean>
  setPassword: (userId: string, password: string) => Promise<void>
  /** Ends every other session of this person; this device stays signed in. */
  signOutOthers: () => Promise<void>
}

export class Refused extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function parseBody(raw: unknown): { password: string } {
  const b = (raw ?? {}) as Record<string, unknown>
  if (typeof b.password === 'string' && b.password.length > 0 && b.password.length <= 200) return { password: b.password }
  throw new Refused(400, 'Type your new password.')
}

export async function handle(deps: Deps, body: { password: string }): Promise<{ ok: true }> {
  const me = await deps.caller()
  if (!me) throw new Refused(401, 'Please sign in again.')
  if (me.email_sign_in === 'none') throw new Refused(403, "Email sign-in isn't turned on for you. Ask the school.")
  const policy = await deps.policy()
  const problem = passwordProblem(body.password, policy)
  if (problem) throw new Refused(400, problem)
  if (await deps.reused(me.user_id, body.password, policy.reuse_count)) {
    throw new Refused(400, policy.reuse_count > 0 ? 'You used this password recently. Choose a different one.' : 'Choose a password different from the one the school gave you.')
  }
  await deps.setPassword(me.user_id, body.password)
  // A new password ends sign-ins elsewhere; never blocks the change itself.
  await deps.signOutOthers().catch(() => {})
  return { ok: true }
}
