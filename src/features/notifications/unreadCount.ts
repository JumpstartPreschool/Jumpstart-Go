import type { Message } from '../school/api'

export type Side = 'family' | 'office'
const OFFICE = new Set(['admin', 'core', 'pro'])
export const fromOffice = (m: Pick<Message, 'sender_role'>) => OFFICE.has(m.sender_role)
export type Row = Pick<Message, 'id' | 'child_id' | 'sender' | 'sender_name' | 'sender_role' | 'body' | 'created_at'>

/**
 * Unread messages for one side of the conversations: the other side's messages after both my last read and my side's
 * last reply (a colleague or the other parent answering counts as handled). Pure, so it's tested on its own.
 */
export function unreadBySide(rows: Row[], reads: Array<{ child_id: string; read_at: string }>, side: Side, me: string): Map<string, number> {
  const out = new Map<string, number>()
  const mine = (m: Row) => (side === 'office' ? fromOffice(m) : !fromOffice(m))
  const lastOwn = new Map<string, string>()
  for (const m of rows) if (mine(m) && (lastOwn.get(m.child_id) ?? '') < m.created_at) lastOwn.set(m.child_id, m.created_at)
  for (const m of rows) {
    if (mine(m) || m.sender === me) continue
    const read = reads.find((r) => r.child_id === m.child_id)?.read_at ?? ''
    const since = [read, lastOwn.get(m.child_id) ?? ''].sort().at(-1)!
    if (m.created_at > since) out.set(m.child_id, (out.get(m.child_id) ?? 0) + 1)
  }
  return out
}

