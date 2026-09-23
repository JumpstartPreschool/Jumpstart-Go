import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { LogOut, Repeat } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Logo } from '../../ui/Logo'
import { Sheet } from '../../ui/Sheet'
import { areasFor, useSession, type Area } from './session'

export const AREA_LABEL: Record<Area, string> = { admin: 'Admin', core: 'Core team', coordinator: 'Coordinator', parent: 'Parent' }
const AREA_COLOR: Record<Area, string> = { admin: 'var(--rb-violet)', core: 'var(--rb-green)', coordinator: 'var(--rb-orange)', parent: 'var(--rb-blue)' }

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
      <button type="button" onClick={() => setOpen(true)} aria-label={`Account: ${me.full_name}`} className="glass flex h-12 items-center gap-2 rounded-full py-1 pl-1 pr-4 font-extrabold transition-transform duration-200 ease-spring active:scale-95">
        <span className="grid size-10 place-items-center rounded-full font-display text-[18px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${AREA_COLOR[area]}, color-mix(in oklab, ${AREA_COLOR[area]} 65%, white))` }} aria-hidden>
          {me.full_name[0]}
        </span>
        <span className="hidden text-[15px] sm:inline">{me.full_name.split(' ')[0]}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={me.full_name}>
        {areas.length > 1 && (
          <>
            <p className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-2">Switch area</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {areas.map((a) => (
                <Button key={a} variant={a === area ? 'primary' : 'secondary'} icon={<Repeat />} onClick={() => { setOpen(false); navigate(`/${a}`) }}>
                  {AREA_LABEL[a]}
                </Button>
              ))}
            </div>
          </>
        )}
        <Button variant="danger" className="mt-4 w-full" icon={<LogOut />} onClick={() => void signOut()}>
          Sign out
        </Button>
      </Sheet>
    </>
  )
}

/** Page frame for the admin, core team and parent areas: glass top bar with the logo, area name and account. */
export function AreaShell({ area, title, children }: { area: Area; title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 px-4 pt-[max(12px,env(safe-area-inset-top))] sm:px-6">
        <div className="glass mx-auto flex max-w-[1180px] items-center gap-4 rounded-[30px] py-2.5 pl-5 pr-2.5">
          <Logo className="h-9 sm:h-10" />
          <span className="rounded-full px-3 py-1 text-[13px] font-extrabold text-white" style={{ background: AREA_COLOR[area] }}>{AREA_LABEL[area]}</span>
          <span className="ml-auto" />
          <AccountButton area={area} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1180px] px-4 pt-6 sm:px-6">
        <h1 className="px-1 text-[34px] font-bold leading-10 sm:text-[42px] sm:leading-[48px]">{title}</h1>
        {children}
      </main>
    </div>
  )
}
