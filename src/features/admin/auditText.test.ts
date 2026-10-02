import { describe as group, expect, it } from 'vitest'
import { describe, type AuditRow } from './auditText'

const names = { person: (id: unknown) => ({ p1: 'Sunita Pawar', g1: 'Neha Shah' } as Record<string, string>)[String(id)] ?? 'Someone', child: () => 'Kabir', className: () => 'Nursery', programme: () => 'Nursery · 360°' }
const row = (table_name: string, action: AuditRow['action'], old_row: Record<string, unknown> | null, new_row: Record<string, unknown> | null): AuditRow => ({ id: 1, at: '2026-09-24T07:00:00Z', actor: null, action, table_name, old_row, new_row })
const trip = { child_id: 'k', direction: 'pickup', traveller_name: 'Neha Shah', traveller_relation: 'Mother', arrive_at: '2026-09-24T10:45:00Z', status: 'en_route' }

group('the audit log in words', () => {
  it('tells the story of a pickup', () => {
    expect(describe(row('trips', 'insert', null, { ...trip, phoned_in_by: 'p1' }), names)).toEqual({ what: "Kabir's pickup: Neha Shah on the way", detail: 'About 4:15 PM. Phoned in, taken by Sunita Pawar' })
    expect(describe(row('trips', 'update', { ...trip }, { ...trip, ready_at: 'x' }), names)?.what).toBe('Kabir ready at the gate')
    expect(describe(row('trips', 'update', { ...trip }, { ...trip, status: 'handed_over', handed_to: 'g1' }), names)?.what).toBe('Kabir handed over to Neha Shah')
    expect(describe(row('trips', 'update', { ...trip }, { ...trip, status: 'handed_over', handed_to_name: 'Ramesh' }), names)?.what).toBe('Kabir handed over to Ramesh, with the code')
  })
  it('says who changed access, and skips the first sign-in link', () => {
    expect(describe(row('profiles', 'update', { full_name: 'Neha Shah', app_access: true }, { full_name: 'Neha Shah', app_access: false }), names)).toEqual({ what: 'Turned off app access for Neha Shah', detail: 'Signed out everywhere' })
    expect(describe(row('profiles', 'update', { full_name: 'Neha Shah', user_id: null }, { full_name: 'Neha Shah', user_id: 'u' }), names)).toBeNull()
    expect(describe(row('profiles', 'update', { full_name: 'Neha Shah', invited_at: null }, { full_name: 'Neha Shah', invited_at: 'x', invited_via: 'whatsapp' }), names)?.what).toBe('Invited Neha Shah on WhatsApp')
    expect(describe(row('profiles', 'update', { full_name: 'Neha Shah', invited_at: null }, { full_name: 'Neha Shah', invited_at: 'x', invited_via: 'sms' }), names)?.what).toBe('Invited Neha Shah by text message')
  })
  it('names roles and classes the school way', () => {
    expect(describe(row('staff_roles', 'insert', null, { profile_id: 'p1', role: 'pro' }), names)?.what).toBe('Sunita Pawar is now Front desk')
    expect(describe(row('coordinator_classes', 'delete', { profile_id: 'p1', class_id: 'c' }, null), names)?.what).toBe('Sunita Pawar no longer covers Nursery')
  })
  it('tells a new class and programme from changed timings', () => {
    expect(describe(row('classes', 'insert', null, { name: 'Toddlers' }), names)?.what).toBe('Added the class Toddlers')
    expect(describe(row('programmes', 'insert', null, { name: 'Toddlers · Mornings' }), names)?.what).toBe('Added the programme Toddlers · Mornings')
    expect(describe(row('programmes', 'update', { name: 'Toddlers · Mornings' }, { name: 'Toddlers · Mornings' }), names)?.what).toBe('Changed the timings of Toddlers · Mornings')
  })
})
