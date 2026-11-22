import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_POLICY, RECOMMENDED, passwordProblem, type Block } from '../_shared/passwordPattern'
import { handle, parseBody, reasonFor, Refused, type Deps, type Target } from './handler'

const ID = '00000000-0000-0000-0000-000000000001'
const target = (over: Partial<Target> = {}): Target => ({
  profile_id: ID, user_id: 'u1', full_name: 'Priya Sharma', email: 'priya.sharma@example.com', phone: '+919811100002',
  blocks: RECOMMENDED, policy: DEFAULT_POLICY, ...over,
})

function setup(t: Target, over: Partial<Deps> = {}) {
  const calls: string[] = []
  const d: Deps = {
    begin: vi.fn(async () => { calls.push('begin'); return t }),
    createUser: vi.fn(async (u) => { calls.push(`create ${u.email}`); return 'new-user' }),
    updateUser: vi.fn(async (id, u) => { calls.push(`update ${id} ${u.email}`) }),
    finish: vi.fn(async (p, u) => { calls.push(`finish ${p} ${u}`); return '2026-10-06T00:00:00Z' }),
    // EMAIL_FIRST priy | AZ | 1234 | '#'
    randomInt: (() => { const q = [0, 25, 1, 2, 3, 4, 2]; return () => q.shift() ?? 0 })(),
    ...over,
  }
  return { d, calls }
}

describe('parseBody', () => {
  it('accepts only an issue request for a profile id', () => {
    expect(parseBody({ action: 'issue', profile_id: ID })).toEqual({ action: 'issue', profile_id: ID })
  })

  it('refuses anything else, including the old save and reset actions', () => {
    for (const bad of [null, undefined, {}, 'issue', { action: 'issue' }, { action: 'issue', profile_id: 'nope' }, { action: 'issue', profile_id: 7 },
      { action: 'save', pattern: '{First}@{domain}#2026' }, { action: 'reset', profile_id: ID }, { action: 'issue', profile_id: `${ID}x` }]) {
      expect(() => parseBody(bad)).toThrow(Refused)
    }
    try { parseBody({}) } catch (e) { expect((e as Refused).status).toBe(400) }
  })
})

describe('handle', () => {
  it('sets a new password on an existing sign-in, then records it, and returns it once with its expiry', async () => {
    const { d, calls } = setup(target())
    const r = await handle(d, { action: 'issue', profile_id: ID })
    expect(r).toEqual({ password: 'priyAZ1234#', expires_at: '2026-10-06T00:00:00Z' })
    expect(calls).toEqual(['begin', 'update u1 priya.sharma@example.com', `finish ${ID} u1`])
    expect(d.createUser).not.toHaveBeenCalled()
    expect(passwordProblem(r.password, DEFAULT_POLICY)).toBeNull()
    expect(vi.mocked(d.updateUser).mock.calls[0]![1].password).toBe(r.password)
  })

  it('makes the account for someone who has none, then links it by the new id', async () => {
    const { d, calls } = setup(target({ user_id: null }))
    await handle(d, { action: 'issue', profile_id: ID })
    expect(calls).toEqual(['begin', 'create priya.sharma@example.com', `finish ${ID} new-user`])
    expect(d.updateUser).not.toHaveBeenCalled()
    expect(vi.mocked(d.createUser).mock.calls[0]![0]).toMatchObject({ email: 'priya.sharma@example.com', phone: '+919811100002' })
  })

  it('never writes a password from a pattern that is too weak, whatever the database said', async () => {
    const weak: Block[][] = [
      [{ type: 'EMAIL_FIRST', n: 8 }],
      [{ type: 'EMAIL_FIRST', n: 9 }, { type: 'RANDOM_NUMBER', n: 1 }],
      [{ type: 'RANDOM_UPPER', n: 3 }],
      [],
    ]
    for (const blocks of weak) {
      const { d } = setup(target({ blocks }))
      const err = await handle(d, { action: 'issue', profile_id: ID }).catch((e) => e)
      expect(err).toBeInstanceOf(Refused)
      expect((err as Refused).status).toBe(400)
      expect((err as Refused).message).toMatch(/Fix the pattern in Settings first\.$/)
      expect(d.createUser).not.toHaveBeenCalled()
      expect(d.updateUser).not.toHaveBeenCalled()
      expect(d.finish).not.toHaveBeenCalled()
    }
  })

  it('refuses when the rules sent with the pattern need more than the pattern gives (11 characters, 12 needed)', async () => {
    const { d } = setup(target({ policy: { ...DEFAULT_POLICY, min_length: 12 } }))
    await expect(handle(d, { action: 'issue', profile_id: ID })).rejects.toThrow(Refused)
    expect(d.updateUser).not.toHaveBeenCalled()
    expect(d.finish).not.toHaveBeenCalled()
  })

  it('turns a failed update into words for the admin and does not record a password that was never set', async () => {
    const { d } = setup(target(), { updateUser: vi.fn(async () => { throw new Error('Password should contain at least one character of each: priyAZ1234#') }) })
    const err = await handle(d, { action: 'issue', profile_id: ID }).catch((e) => e)
    expect(err).toBeInstanceOf(Refused)
    expect((err as Refused).status).toBe(400)
    expect((err as Refused).message).toBe(reasonFor(new Error('password')))
    expect((err as Refused).message).not.toContain('priyAZ1234#')
    expect(d.finish).not.toHaveBeenCalled()
  })

  it('turns a failed create into words and does not record it', async () => {
    const { d } = setup(target({ user_id: null }), { createUser: vi.fn(async () => { throw new Error('A user with this email address has already been registered') }) })
    await expect(handle(d, { action: 'issue', profile_id: ID })).rejects.toThrow('Another sign-in already uses this email or mobile.')
    expect(d.finish).not.toHaveBeenCalled()
  })

  it('lets a refusal from the admin check (not an admin, no email, self) stop everything', async () => {
    const { d } = setup(target(), { begin: vi.fn(async () => { throw new Refused(403, 'Only the admin can issue temporary passwords.') }) })
    await expect(handle(d, { action: 'issue', profile_id: ID })).rejects.toMatchObject({ status: 403 })
    expect(d.updateUser).not.toHaveBeenCalled()
    expect(d.createUser).not.toHaveBeenCalled()
  })

  it('makes a different password each time with the real random source', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const { d } = setup(target(), { randomInt: undefined })
      seen.add((await handle(d, { action: 'issue', profile_id: ID })).password)
    }
    expect(seen.size).toBeGreaterThan(15)
  })
})

describe('reasonFor', () => {
  it('explains each kind of failure and never repeats the error text, which can hold the password', () => {
    expect(reasonFor(new Error('Email address already registered'))).toBe('Another sign-in already uses this email or mobile.')
    expect(reasonFor(new Error('duplicate key value'))).toBe('Another sign-in already uses this email or mobile.')
    expect(reasonFor(new Error('Password is known to be weak: priyAZ1234#'))).toMatch(/^Supabase didn't accept the password/)
    expect(reasonFor(new Error('Unable to validate email address: invalid format'))).toBe("Supabase didn't accept the email address.")
    expect(reasonFor(new Error('boom priyAZ1234#'))).toBe("The temporary password couldn't be set. Try again.")
    expect(reasonFor(null)).toBe("The temporary password couldn't be set. Try again.")
    for (const m of ['already registered priyAZ1234#', 'password priyAZ1234#', 'email priyAZ1234#', 'x priyAZ1234#']) {
      expect(reasonFor(new Error(m))).not.toContain('priyAZ1234#')
    }
  })
})
