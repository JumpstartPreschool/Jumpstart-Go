import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_POLICY, passwordProblem, type Policy } from '../_shared/passwordPattern'
import { handle, parseBody, Refused, type Deps } from './handler'

const GOOD = 'Garden-Swing-42'

function setup(over: Partial<Deps> = {}, policy: Policy = DEFAULT_POLICY) {
  const calls: string[] = []
  const d: Deps = {
    caller: vi.fn(async () => ({ user_id: 'u1', email_sign_in: 'temporary' as const })),
    policy: vi.fn(async () => policy),
    reused: vi.fn(async () => false),
    setPassword: vi.fn(async () => { calls.push('set') }),
    signOutOthers: vi.fn(async () => { calls.push('signout') }),
    ...over,
  }
  return { d, calls }
}
const refusal = async (d: Deps, password = GOOD) => (await handle(d, { password }).catch((e) => e)) as Refused

describe('parseBody', () => {
  it('takes a password of 1 to 200 characters', () => {
    expect(parseBody({ password: GOOD })).toEqual({ password: GOOD })
    expect(parseBody({ password: 'x'.repeat(200) }).password).toHaveLength(200)
  })

  it('refuses empty, missing, non-string and over-long passwords with a 400', () => {
    for (const bad of [null, undefined, {}, { password: '' }, { password: 12345678901 }, { password: ['a'] }, { password: 'x'.repeat(201) }]) {
      expect(() => parseBody(bad)).toThrow(Refused)
      try { parseBody(bad) } catch (e) { expect((e as Refused).status).toBe(400) }
    }
  })
})

describe('handle', () => {
  it('refuses someone who is not signed in', async () => {
    const { d } = setup({ caller: vi.fn(async () => null) })
    const e = await refusal(d)
    expect(e).toBeInstanceOf(Refused)
    expect(e.status).toBe(401)
    expect(d.setPassword).not.toHaveBeenCalled()
  })

  it('refuses someone who has no email sign-in, so a password can never be added around the admin', async () => {
    const { d } = setup({ caller: vi.fn(async () => ({ user_id: 'u1', email_sign_in: 'none' as const })) })
    const e = await refusal(d)
    expect(e.status).toBe(403)
    expect(d.setPassword).not.toHaveBeenCalled()
    expect(d.reused).not.toHaveBeenCalled()
  })

  it('refuses a password that breaks the rules, with the reason, before checking reuse or writing', async () => {
    for (const weak of ['short1A!', 'garden-swing-42', 'Garden-Swing-xx', 'GardenSwing42']) {
      const { d } = setup()
      const e = await refusal(d, weak)
      expect(e.status).toBe(400)
      expect(e.message).toBe(passwordProblem(weak, DEFAULT_POLICY))
      expect(d.reused).not.toHaveBeenCalled()
      expect(d.setPassword).not.toHaveBeenCalled()
    }
  })

  it('applies the school\'s own rules, not only the defaults', async () => {
    const { d } = setup({}, { ...DEFAULT_POLICY, min_length: 20 })
    expect((await refusal(d, GOOD)).message).toBe('Use at least 20 characters.')
    expect(d.setPassword).not.toHaveBeenCalled()
  })

  it('refuses a recent password, asking for the policy\'s count, and writes nothing', async () => {
    const { d } = setup({ reused: vi.fn(async () => true) })
    const e = await refusal(d)
    expect(e.status).toBe(400)
    expect(e.message).toBe('You used this password recently. Choose a different one.')
    expect(d.reused).toHaveBeenCalledWith('u1', GOOD, DEFAULT_POLICY.reuse_count)
    expect(d.setPassword).not.toHaveBeenCalled()
    expect(d.signOutOthers).not.toHaveBeenCalled()
  })

  it('with reuse remembering nothing, still refuses the current (temporary) password, in words that say so', async () => {
    const { d } = setup({ reused: vi.fn(async () => true) }, { ...DEFAULT_POLICY, reuse_count: 0 })
    expect((await refusal(d)).message).toBe('Choose a password different from the one the school gave you.')
    expect(d.reused).toHaveBeenCalledWith('u1', GOOD, 0)
  })

  it('sets the password, then signs out the other devices', async () => {
    const { d, calls } = setup()
    await expect(handle(d, { password: GOOD })).resolves.toEqual({ ok: true })
    expect(calls).toEqual(['set', 'signout'])
    expect(d.setPassword).toHaveBeenCalledWith('u1', GOOD)
  })

  it('works for someone who already has their own password and is changing it', async () => {
    const { d, calls } = setup({ caller: vi.fn(async () => ({ user_id: 'u1', email_sign_in: 'own' as const })) })
    await handle(d, { password: GOOD })
    expect(calls).toEqual(['set', 'signout'])
  })

  it('still succeeds when signing out the other devices fails: the password is already changed', async () => {
    const { d } = setup({ signOutOthers: vi.fn(async () => { throw new Error('auth down') }) })
    await expect(handle(d, { password: GOOD })).resolves.toEqual({ ok: true })
    expect(d.setPassword).toHaveBeenCalledTimes(1)
  })

  it('does not sign anyone out when the password could not be set', async () => {
    const { d } = setup({ setPassword: vi.fn(async () => { throw new Error('write failed') }) })
    await expect(handle(d, { password: GOOD })).rejects.toThrow('write failed')
    expect(d.signOutOthers).not.toHaveBeenCalled()
  })
})
