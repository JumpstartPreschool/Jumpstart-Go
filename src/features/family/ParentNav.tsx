import { Link, useLocation } from 'react-router'
import { Bell, CalendarDays, MessageSquare, UserRound } from '../../ui/icons'
import { CountBadge } from '../../ui/CountBadge'
import { useUnread } from '../notifications/Unread'

export const PARENT_PAGES = [
  { to: '/parent', label: 'Today', icon: <CalendarDays /> },
  { to: '/parent/updates', label: 'Updates', icon: <Bell /> },
  { to: '/parent/messages', label: 'Messages', icon: <MessageSquare /> },
  { to: '/parent/account', label: 'Account', icon: <UserRound /> },
]

const isActive = (pathname: string, to: string) => pathname === to || (to !== '/parent' && pathname.startsWith(to))

/** Unread on each page: announcements on Updates, the school's messages on Messages (D57). */
function useCounts(): Record<string, number> {
  const u = useUnread()
  return { Updates: u.announcements, Messages: u.familyMessages }
}

/** The parent's pages in the top bar on computers and large tablets, with the unread counts. */
export function ParentTopNav() {
  const { pathname } = useLocation()
  const counts = useCounts()
  return (
    <nav aria-label="Parent pages" className="topnav max-lg:hidden">
      {PARENT_PAGES.map((p) => (
        <Link key={p.to} to={p.to} aria-current={isActive(pathname, p.to) ? 'page' : undefined}>
          {p.icon}{p.label}
          <CountBadge n={counts[p.label] ?? 0} />
        </Link>
      ))}
    </nav>
  )
}

/**
 * The parent's tab bar on phones (Screen Book v3): glass, at the thumb, above the home indicator. On iPad and desktop
 * the same pages are the tabs under the top bar.
 */
export function ParentTabBar() {
  const { pathname } = useLocation()
  const counts = useCounts()
  return (
    <nav aria-label="Parent pages" className="glass fixed inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-[480px] grid-cols-4 rounded-[26px] p-1.5 md:hidden">
      {PARENT_PAGES.map((p) => {
        const active = isActive(pathname, p.to)
        return (
          <Link key={p.to} to={p.to} aria-current={active ? 'page' : undefined}
            className={`relative grid h-14 place-items-center content-center gap-0.5 rounded-[20px] text-caption font-bold transition-colors duration-150 [&_svg]:size-[22px] ${active ? 'bg-surface text-accent-ink shadow-[0_2px_0_var(--line-2)]' : 'text-ink-2'}`}>
            {p.icon}
            {p.label}
            <CountBadge n={counts[p.label] ?? 0} corner />
          </Link>
        )
      })}
    </nav>
  )
}
