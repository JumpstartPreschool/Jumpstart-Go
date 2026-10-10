import { describe, expect, it } from 'vitest'
import { unreadBySide } from './Unread'

const msg = (id: number, child: string, role: 'parent' | 'family' | 'core' | 'pro' | 'admin', at: string, sender = role === 'parent' ? 'mom' : 'staff1') =>
  ({ id, child_id: child, sender, sender_name: 'Someone', sender_role: role, body: 'Hi', created_at: `2026-10-10T${at}:00Z` })

describe('unread messages (D57)', () => {
  it("counts the school's messages for a family until they read the conversation", () => {
    const rows = [msg(1, 'k1', 'core', '09:00'), msg(2, 'k1', 'core', '09:05'), msg(3, 'k2', 'pro', '09:10')]
    expect(unreadBySide(rows, [], 'family', 'mom')).toEqual(new Map([['k1', 2], ['k2', 1]]))
    expect(unreadBySide(rows, [{ child_id: 'k1', read_at: '2026-10-10T09:06:00Z' }], 'family', 'mom')).toEqual(new Map([['k2', 1]]))
  })
  it('counts only what came after the last reply from my side (the other parent, or a colleague, answered)', () => {
    const rows = [msg(1, 'k1', 'parent', '09:00'), msg(2, 'k1', 'core', '09:05', 'staff2'), msg(3, 'k1', 'parent', '09:10')]
    expect(unreadBySide(rows, [], 'office', 'staff1')).toEqual(new Map([['k1', 1]]))
  })
  it("never counts my own messages, even on the other side's list", () => {
    const rows = [msg(1, 'k1', 'parent', '09:00', 'staff1')]
    expect(unreadBySide(rows, [], 'office', 'staff1').size).toBe(0)
  })
})
