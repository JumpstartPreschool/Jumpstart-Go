import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/session'
import { useLive, type Announcement } from '../school/api'

/** The signed-in parent's profile id (a staff member may be a parent too; everything here is about their own children). */
export function useMyId(): string | null {
  const { state } = useSession()
  return state.status === 'signed-in' ? state.me?.profile_id ?? null : null
}

/** This parent's own children's classes, for addressing (announcements go to all parents or one class). */
export function useMyClasses(me: string | null) {
  return useLive<{ id: string; class_id: string }>(['children', 'guardianships'], () =>
    supabase.from('children').select('id, class_id, guardianships!inner(guardian_id)').eq('active', true).eq('guardianships.guardian_id', me ?? ''), [me])
}

/**
 * The announcements sent to this parent, newest first, with which ones they've read. Row-level security already limits
 * a parent to these; a staff member who is also a parent sees only the ones for their own children here.
 */
export function useMyAnnouncements() {
  const me = useMyId()
  const classes = useMyClasses(me)
  const ann = useLive<Announcement>('announcements', () => supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(50), [])
  const reads = useLive<{ announcement_id: string }>('announcement_reads', () => supabase.from('announcement_reads').select('announcement_id'), [])
  const mine = classes.rows && ann.rows ? ann.rows.filter((a) => !a.class_id || classes.rows!.some((c) => c.class_id === a.class_id)) : null
  const read = new Set((reads.rows ?? []).map((r) => r.announcement_id))
  return { list: mine, read, unread: mine ? mine.filter((a) => !read.has(a.id)).length : 0, error: ann.error || classes.error, reload: () => { void ann.reload(); void reads.reload() } }
}
