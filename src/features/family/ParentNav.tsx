import { Link, useLocation } from 'react-router'
import { Bell, CalendarDays, MessageSquare, UserRound } from '../../ui/icons'
import { useMyAnnouncements } from './parentData'

export const PARENT_PAGES = [
  { to: '/parent', label: 'Today', icon: <CalendarDays /> },
  { to: '/parent/updates', label: 'Updates', icon: <Bell /> },
  { to: '/parent/messages', label: 'Messages', icon: <MessageSquare /> },
  { to: '/parent/account', label: 'Account', icon: <UserRound /> },
]

/**
 * The parent's tab bar on phones (Screen Book v3): glass, at the thumb, above the home indicator. On iPad and desktop
 * the same pages are the tabs under the top bar.
 */
export function ParentTabBar() {
  const { pathname } = useLocation()
  const { unread } = useMyAnnouncements()
  return (
    <nav aria-label="Parent pages" className="glass fixed inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-[480px] grid-cols-4 rounded-[26px] p-1.5 md:hidden">
      {PARENT_PAGES.map((p) => {
        const active = pathname === p.to || (p.to !== '/parent' && pathname.startsWith(p.to))
        return (
          <Link key={p.to} to={p.to} aria-current={active ? 'page' : undefined}
            className={`relative grid h-14 place-items-center content-center gap-0.5 rounded-[20px] text-caption font-bold transition-colors duration-150 [&_svg]:size-[22px] ${active ? 'bg-surface text-accent-ink shadow-[0_2px_0_var(--line-2)]' : 'text-ink-2'}`}>
            {p.icon}
            {p.label}
            {p.label === 'Updates' && unread > 0 && (
              <span className="absolute right-[calc(50%-22px)] top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[12px] font-extrabold text-white tabular-nums" aria-label={`${unread} new`}>{unread}</span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
