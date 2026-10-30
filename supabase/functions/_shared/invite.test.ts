import { describe, expect, it } from 'vitest'
import { inviteText, type InviteDetails } from './invite'

const parent: InviteDetails = { full_name: 'Neha Shah', phone: '+919800000002', app_url: 'https://app.jumpstartpreschool.in', staff: false, children: ['Kabir', 'Meera'] }

describe('invitations (D36)', () => {
  it('tells a parent who it is for, where to go and how to sign in', () => {
    const t = inviteText(parent)
    expect(t).toContain('Hello Neha,')
    expect(t).toContain('for Kabir and Meera')
    expect(t).toContain('1. Open https://app.jumpstartpreschool.in/#phone=%2B919800000002')
    expect(t).toContain('2. Enter your mobile number')
    expect(inviteText({ ...parent, staff: true })).not.toContain('for Kabir')
  })
})
