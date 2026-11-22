import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../ui/Toast'
import { Megaphone, MessageCircle } from '../../ui/icons'
import { useSession } from '../auth/session'
import { useMyAnnouncements } from '../family/parentData'
import { READ_EVENT, useLive } from '../school/api'
import { fromOffice, unreadBySide, type Row, type Side } from './unreadCount'

/**
 * Unread counts like WhatsApp (D57): a red number on Messages and Updates, the same number on the installed app's icon
 * and in the tab's title, and a pop-up when something new arrives while the app is open. One watcher for the whole
 * app, so every page and tab bar shows the same numbers and nothing is loaded twice.
 */
export interface Unread {
  /** School messages a family member hasn't read, across their children. */
  familyMessages: number
  /** Announcements a family member hasn't read. */
  announcements: number
  /** Family messages the office hasn't answered or read (Head office and Front desk). */
  officeMessages: number
}
const NONE: Unread = { familyMessages: 0, announcements: 0, officeMessages: 0 }
const UnreadContext = createContext<Unread>(NONE)
export const useUnread = () => useContext(UnreadContext)

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)
const first = (name: string) => name.split(' ')[0] ?? name

/** Messages for one side: counts them and pops up anything new from the other side. */
function MessageWatch({ side, me, area, onCount }: { side: Side; me: string; area: 'parent' | 'core' | 'pro'; onCount: (n: number) => void }) {
  const toast = useToast()
  const navigate = useNavigate()
  const messages = useLive<Row>('messages', () => supabase.from('messages').select('id, child_id, sender, sender_name, sender_role, body, created_at')
    .order('created_at', { ascending: false }).limit(500), [])
  const reads = useLive<{ child_id: string; read_at: string }>('message_reads', () => supabase.from('message_reads').select('child_id, read_at'), [])
  // The family side counts only the person's own children: a parent who is also office staff can read every family's.
  const kids = useLive<{ id: string; full_name: string; preferred_name: string | null }>(['children', 'guardianships'], () => side === 'family'
    ? supabase.from('children').select('id, full_name, preferred_name, guardianships!inner(guardian_id)').eq('active', true).eq('guardianships.guardian_id', me)
    : supabase.from('children').select('id, full_name, preferred_name').eq('active', true), [side, me])
  const seen = useRef<Set<number> | null>(null)
  const reloadReads = reads.reload
  useEffect(() => {
    const again = () => void reloadReads()
    window.addEventListener(READ_EVENT, again)
    return () => window.removeEventListener(READ_EVENT, again)
  }, [reloadReads])

  const rows = messages.rows && kids.rows ? messages.rows.filter((m) => kids.rows!.some((k) => k.id === m.child_id)) : null
  const count = rows && reads.rows ? sum(unreadBySide(rows, reads.rows, side, me)) : 0
  useEffect(() => onCount(count), [count, onCount])

  // New from the other side since the app opened: a pop-up, unless that conversation is already on screen.
  useEffect(() => {
    if (!rows) return
    const ids = new Set(rows.map((m) => m.id))
    if (!seen.current) { seen.current = ids; return }
    const fresh = rows.filter((m) => !seen.current!.has(m.id) && m.sender !== me && (side === 'office' ? !fromOffice(m) : fromOffice(m)))
    seen.current = ids
    const m = fresh[0]
    if (!m) return
    const path = area === 'parent' ? `/parent/messages/${m.child_id}` : `/${area}/messages?child=${m.child_id}`
    const here = window.location.pathname + window.location.search
    if (here === path || (document.visibilityState === 'hidden')) return
    const kid = kids.rows?.find((k) => k.id === m.child_id)
    const about = kid ? ` about ${kid.preferred_name ?? first(kid.full_name)}` : ''
    toast(`New message${about}. ${first(m.sender_name)}: ${m.body.length > 60 ? `${m.body.slice(0, 60)}…` : m.body}`,
      { tone: 'info', ttl: 8000, top: true, icon: <MessageCircle />, action: { label: 'Open', run: () => navigate(path) } })
  }, [rows, me, side, area, kids.rows, toast, navigate])
  return null
}

/** Announcements for a family: the count, and a pop-up for a new one unless Updates is open. */
function AnnouncementWatch({ onCount }: { onCount: (n: number) => void }) {
  const toast = useToast()
  const navigate = useNavigate()
  const ann = useMyAnnouncements()
  const seen = useRef<Set<string> | null>(null)
  const reload = ann.reload
  useEffect(() => {
    window.addEventListener(READ_EVENT, reload)
    return () => window.removeEventListener(READ_EVENT, reload)
  }, [reload])
  useEffect(() => onCount(ann.unread), [ann.unread, onCount])
  useEffect(() => {
    if (!ann.list) return
    const ids = new Set(ann.list.map((a) => a.id))
    if (!seen.current) { seen.current = ids; return }
    const fresh = ann.list.find((a) => !seen.current!.has(a.id) && !ann.read.has(a.id))
    seen.current = ids
    if (!fresh || window.location.pathname === '/parent/updates' || document.visibilityState === 'hidden') return
    toast(`New announcement: ${fresh.title}`, { tone: 'info', ttl: 8000, top: true, icon: <Megaphone />, action: { label: 'View', run: () => navigate('/parent/updates') } })
  }, [ann.list, ann.read, toast, navigate])
  return null
}

/** The installed app's icon number and the tab title, like WhatsApp: "(3) Jumpstart Go". */
function useBadge(total: number) {
  const base = useRef(document.title.replace(/^\(\d+\+?\)\s*/, ''))
  useEffect(() => {
    document.title = total > 0 ? `(${total > 99 ? '99+' : total}) ${base.current}` : base.current
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    void (total > 0 ? nav.setAppBadge?.(total) : nav.clearAppBadge?.())?.catch(() => {})
  }, [total])
}

/**
 * Watches what the signed-in person can receive: a family member their children's messages and announcements, the
 * office (Head office, Front desk) the families' messages. Mounted once, inside the router.
 */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const { state } = useSession()
  const { pathname } = useLocation()
  const me = state.status === 'signed-in' ? state.me : null
  const [counts, setCounts] = useState<Unread>(NONE)
  const [setFamily] = useState(() => (n: number) => setCounts((c) => (c.familyMessages === n ? c : { ...c, familyMessages: n })))
  const [setAnn] = useState(() => (n: number) => setCounts((c) => (c.announcements === n ? c : { ...c, announcements: n })))
  const [setOffice] = useState(() => (n: number) => setCounts((c) => (c.officeMessages === n ? c : { ...c, officeMessages: n })))
  const family = !!me && me.children > 0
  const officeArea = me?.roles.includes('core') ? 'core' : me?.roles.includes('pro') ? 'pro' : null
  // The page the collector opens from WhatsApp signs in nobody, so it never watches anything.
  const watching = !!me && !pathname.startsWith('/t/')
  const shown: Unread = { familyMessages: family ? counts.familyMessages : 0, announcements: family ? counts.announcements : 0, officeMessages: officeArea ? counts.officeMessages : 0 }
  useBadge(watching ? shown.familyMessages + shown.announcements + shown.officeMessages : 0)
  return (
    <UnreadContext.Provider value={shown}>
      {watching && family && <MessageWatch key={`f-${me.profile_id}`} side="family" me={me.profile_id} area="parent" onCount={setFamily} />}
      {watching && family && <AnnouncementWatch key={`a-${me.profile_id}`} onCount={setAnn} />}
      {watching && officeArea && <MessageWatch key={`o-${me.profile_id}`} side="office" me={me.profile_id} area={officeArea} onCount={setOffice} />}
      {children}
    </UnreadContext.Provider>
  )
}
