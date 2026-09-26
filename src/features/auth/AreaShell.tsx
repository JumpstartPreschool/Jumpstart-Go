import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { BellRing, CalendarClock, ChevronDown, Clock, Headset, Megaphone, MessageSquare, ScrollText, Settings, ShieldCheck, UserRound, UsersRound, WifiOff } from '../../ui/icons'
import { Avatar } from '../../ui/Avatar'
import { Logo } from '../../ui/Logo'
import { Sheet } from '../../ui/Sheet'
import { useOnline } from '../../ui/hooks'
import { SignOutButton } from '../../ui/SignOutButton'
import { areasFor, useSession, type Area } from './session'
import { PARENT_PAGES, ParentTabBar } from '../family/ParentNav'
import { PushSwitch } from '../notifications/PushSwitch'

export const AREA_LABEL: Record<Area, string> = { admin: 'Admin', core: 'Core team', pro: 'Front desk', coordinator: 'Coordinator', parent: 'Parent' }
/** Roles are told apart by icon, never by colour alone (owner, 2026-09-24). Same icons as the Screen Book. */
export const AREA_ICON: Record<Area, ReactNode> = { admin: <ShieldCheck />, core: <CalendarClock />, pro: <Headset />, coordinator: <BellRing />, parent: <UserRound /> }
/** What each area gives access to, shown when choosing where to start. */
export const AREA_DOES: Record<Area, string> = {
  admin: 'Everything, including people and roles',
  core: 'Timings, attendance and coordinators',
  pro: 'Calls, messages and announcements',
  coordinator: 'The gate, on a tablet',
  parent: 'Your own children',
}

/** Pages inside an area, shown as tabs under the top bar. */
const AREA_PAGES: Partial<Record<Area, Array<{ to: string; label: string; icon: ReactNode }>>> = {
  admin: [
    { to: '/admin', label: 'People', icon: <UsersRound /> },
    { to: '/admin/coordinators', label: 'Coordinators', icon: <BellRing /> },
    { to: '/admin/settings', label: 'Settings', icon: <Settings /> },
    { to: '/admin/audit', label: 'Audit log', icon: <ScrollText /> },
  ],
  core: [
    { to: '/core', label: 'Today', icon: <CalendarClock /> },
    { to: '/core/schedules', label: 'Schedules', icon: <Clock /> },
    { to: '/core/coordinators', label: 'Coordinators', icon: <BellRing /> },
    { to: '/core/messages', label: 'Messages', icon: <MessageSquare /> },
    { to: '/core/announce', label: 'Announce', icon: <Megaphone /> },
  ],
  parent: PARENT_PAGES,
  pro: [
    { to: '/pro', label: 'Front desk', icon: <Headset /> },
    { to: '/pro/messages', label: 'Messages', icon: <MessageSquare /> },
    { to: '/pro/announce', label: 'Announce', icon: <Megaphone /> },
  ],
}

/** The dark area label in the top bar: which part of the app this is, with its icon. */
export function AreaChip({ area }: { area: Area }) {
  return (
    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-secondary pl-2.5 pr-3 text-caption font-extrabold text-canvas shadow-[0_2px_0_var(--secondary-lip)] [&_svg]:size-4 max-[374px]:pr-2.5" aria-label={AREA_LABEL[area]}>
      {AREA_ICON[area]}
      <span className="max-[374px]:hidden">{AREA_LABEL[area]}</span>
    </span>
  )
}

/** Signed-in person's button: shows who is signed in, switches area (D16) and signs out. */
export function AccountButton({ area }: { area: Area }) {
  const { state, signOut } = useSession()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  if (state.status !== 'signed-in' || !state.me) return null
  const me = state.me
  const areas = areasFor(me)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Account: ${me.full_name}`}
        className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-surface p-0.5 pr-2 text-small font-bold transition-colors duration-150 hover:bg-sunken sm:pr-3">
        <Avatar name={me.full_name} color="var(--accent)" size="sm" />
        <span className="hidden sm:inline">{me.full_name.split(' ')[0]}</span>
        <ChevronDown className="size-4 text-ink-3" aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={me.full_name} description={`Signed in as ${AREA_LABEL[area]}`}>
        {areas.length > 1 && (
          <>
            <p className="kicker">Switch area</p>
            <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
              {areas.map((a) => (
                <button key={a} type="button" className="choice flex h-14 items-center gap-3 px-4 text-h4 [&>svg]:size-5 [&>svg]:text-accent" aria-pressed={a === area}
                  onClick={() => { setOpen(false); if (a !== area) navigate(`/${a}`) }}>
                  {AREA_ICON[a]}
                  {AREA_LABEL[a]}
                </button>
              ))}
            </div>
          </>
        )}
        {area !== 'parent' && <div className="mt-4 rounded-lg bg-sunken px-3.5"><PushSwitch /></div>}
        <SignOutButton className="mt-6" onClick={() => void signOut()} />
      </Sheet>
    </>
  )
}

/** Shown under the top bar while the device is offline, so a failed save is never a surprise. */
export function OfflineNotice() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="mx-auto mt-3 flex max-w-[var(--content)] items-center gap-2.5 rounded-md bg-warning-soft px-4 py-3 text-small font-bold text-warning [&>svg]:size-[18px] [&>svg]:shrink-0">
      <WifiOff aria-hidden />
      You're offline. What's on screen may be out of date, and changes can't be saved until you're back online.
    </div>
  )
}

/**
 * Page frame for the admin, core team and parent areas: a floating top bar (logo, area, account), the area's
 * page tabs, then the page title with its optional description and actions.
 */
export function AreaShell({ area, title, subtitle, actions, children }: { area: Area; title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const pages = AREA_PAGES[area]
  const { pathname } = useLocation()
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[max(12px,env(safe-area-inset-top))] focus:z-50 focus:rounded-sm focus:bg-surface focus:px-4 focus:py-3 focus:font-bold focus:shadow-float">
        Skip to content
      </a>
      <header className="gutter sticky top-0 z-30 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="glass mx-auto flex h-16 max-w-[var(--content)] items-center gap-3 rounded-xl pl-4 pr-2.5 sm:gap-4 sm:pl-5">
          <Logo className="h-7 sm:h-8" />
          <span className="h-6 w-px bg-line-2 max-[359px]:hidden" aria-hidden />
          <AreaChip area={area} />
          <span className="flex-1" />
          <AccountButton area={area} />
        </div>
        <OfflineNotice />
      </header>
      <main id="main" className={`gutter mx-auto w-full max-w-[calc(var(--content)+2*var(--gutter))] pb-[max(40px,env(safe-area-inset-bottom))] pt-6 ${area === 'parent' ? 'max-md:pb-[calc(96px+env(safe-area-inset-bottom))]' : ''}`}>
        {pages && (
          <nav aria-label={`${AREA_LABEL[area]} pages`} className={`seg mb-6 ${area === 'parent' ? 'max-md:hidden' : ''}`}>
            {pages.map((page) => {
              // An area's first page stays selected on the pages it opens (a child's page under People).
              const active = pathname === page.to || (page.to === `/${area}` && pathname.startsWith(`/${area}/child/`))
              return <Link key={page.to} to={page.to} aria-current={active ? 'page' : undefined}>{page.icon}{page.label}</Link>
            })}
          </nav>
        )}
        <div className="page-in">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <h1 className="text-h1">{title}</h1>
              {subtitle && <p className="mt-2 max-w-[68ch] text-lead text-ink-2">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
          </div>
          {children}
        </div>
      </main>
      {area === 'parent' && <ParentTabBar />}
    </div>
  )
}
