import { describe, expect, it } from 'vitest'
import { inviteEmail, inviteText, type InviteDetails } from './invite'

const parent: InviteDetails = { full_name: 'Neha Shah', email: 'neha@example.com', phone: '+919800000002', app_url: 'https://app.jumpstartpreschool.in', staff: false, children: ['Kabir', 'Meera'] }

describe('invitations (D36)', () => {
  it('tells a parent who it is for, where to go and how to sign in', () => {
    const t = inviteText(parent)
    expect(t).toContain('Hello Neha,')
    expect(t).toContain('for Kabir and Meera')
    expect(t).toContain('1. Open https://app.jumpstartpreschool.in\n2. Enter neha@example.com')
    expect(t).not.toContain('*')
    expect(inviteText(parent, 'whatsapp')).toContain('*Jumpstart app*')
    expect(inviteText({ ...parent, staff: true })).not.toContain('for Kabir')
  })
  it('escapes names in the email, so a record can never inject markup', () => {
    const { html, text, subject } = inviteEmail({ ...parent, full_name: '<img src=x onerror=alert(1)> Shah', children: ['<b>Kabir</b>'] })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
    expect(html).toContain('&lt;b&gt;Kabir&lt;/b&gt;')
    expect(html).toContain('href="https://app.jumpstartpreschool.in/#email=neha%40example.com"')
    expect(html).toContain('href="https://app.jumpstartpreschool.in"')
    expect(text).toContain('1. Open https://app.jumpstartpreschool.in')
    expect(subject).toBe("You're invited to Jumpstart")
  })
})
