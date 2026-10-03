import { describe, expect, it, vi } from 'vitest'
import { handle, parseBody, Refused, type Deps, type Target } from './handler'

const person = (over: Partial<Target>): Target => ({ profile_id: 'p1', user_id: 'u1', full_name: 'Meera Shah', email: 'meera.shah@gmail.com', phone: '+919811100002', action: 'set', ...over })

function deps(targets: Target[], over: Partial<Deps> = {}) {
  const calls: string[] = []
  const d: Deps = {
    savePattern: vi.fn(async () => targets),
    personTarget: vi.fn(async () => ({ pattern: '{First}@{domain}#2026', target: targets[0]! })),
    createUser: vi.fn(async (u) => { calls.push(`create ${u.email} ${u.password}`); return 'new-user' }),
    updateUser: vi.fn(async (id, u) => { calls.push(`update ${id} ${u.email ?? '-'} ${u.password}`) }),
    mark: vi.fn(async (p, u, s) => { calls.push(`mark ${p} ${u} ${s}`) }),
    randomPassword: () => 'RANDOM',
    ...over,
  }
  return { d, calls }
}

describe('password-pattern', () => {
  it('refuses a weak or malformed pattern before touching anything', () => {
    expect(() => parseBody({ action: 'save', pattern: 'Jumpstart2026' })).toThrow(Refused)
    expect(() => parseBody({ action: 'reset', profile_id: 'nope' })).toThrow(Refused)
    expect(() => parseBody(null)).toThrow(Refused)
    expect(parseBody({ action: 'save', pattern: ' {First}@{domain}#2026 ' })).toEqual({ action: 'save', pattern: '{First}@{domain}#2026' })
  })

  it('saving sets every password to the new pattern, writing the password before marking it', async () => {
    const { d, calls } = deps([person({}), person({ profile_id: 'p2', user_id: null, full_name: 'Rohan Iyer', email: 'rohan@school.in' })])
    const r = await handle(d, { action: 'save', pattern: '{First}@{domain}#2026' })
    expect(r).toEqual({ updated: 2, failed: [] })
    expect(calls).toEqual([
      'update u1 meera.shah@gmail.com Meera@gmail#2026',
      'create rohan@school.in Rohan@school#2026',
      'mark p1 u1 pattern',
      'mark p2 new-user pattern',
    ])
  })

  it('clears an old pattern password for someone no longer allowed in', async () => {
    const { d, calls } = deps([person({ action: 'clear' })])
    await handle(d, { action: 'save', pattern: '{First}@{domain}#2026' })
    expect(calls).toEqual(['update u1 - RANDOM', 'mark p1 u1 none'])
  })

  it('carries on past one failure and names who failed, without the password', async () => {
    const { d } = deps([person({}), person({ profile_id: 'p2', user_id: 'u2', full_name: 'Rohan Iyer' })], {
      updateUser: vi.fn(async (id) => { if (id === 'u2') throw new Error('A user with this email address has already been registered') }),
    })
    const r = await handle(d, { action: 'save', pattern: '{First}@{domain}#2026' })
    expect(r.updated).toBe(1)
    expect(r.failed).toEqual([{ name: 'Rohan Iyer', reason: 'Another sign-in already uses this email or mobile.' }])
    expect(JSON.stringify(r)).not.toContain('#2026')
  })

  it('a reset sets one person back to the pattern and tells the admin their starting password', async () => {
    const { d, calls } = deps([person({})])
    const r = await handle(d, { action: 'reset', profile_id: '00000000-0000-0000-0000-000000000001' })
    expect(r).toEqual({ updated: 1, failed: [], password: 'Meera@gmail#2026' })
    expect(calls).toEqual(['update u1 meera.shah@gmail.com Meera@gmail#2026', 'mark p1 u1 pattern'])
    expect(d.savePattern).not.toHaveBeenCalled()
  })

  it('refuses a password past bcrypt\'s 72 bytes instead of silently cutting it', async () => {
    const { d } = deps([person({ email: `${'a'.repeat(70)}@gmail.com` })])
    const r = await handle(d, { action: 'save', pattern: '{name}{name}#2026' })
    expect(r.updated).toBe(0)
    expect(r.failed[0]!.reason).toMatch(/longer than 72/)
    expect(d.updateUser).not.toHaveBeenCalled()
  })

  it('tries marking twice, so a passing blip never leaves a pattern password marked as their own', async () => {
    let calls = 0
    const { d } = deps([person({})], { mark: vi.fn(async () => { if (calls++ === 0) throw new Error('blip') }) })
    const r = await handle(d, { action: 'save', pattern: '{First}@{domain}#2026' })
    expect(r).toEqual({ updated: 1, failed: [] })
    expect(d.mark).toHaveBeenCalledTimes(2)
  })
})
