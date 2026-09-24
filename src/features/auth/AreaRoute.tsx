import { useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { LogOut, RotateCcw, UserX } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Logo, Mascot } from '../../ui/Logo'
import { clearDemoLanding, demoLanding } from '../../demo/demo'
import { ConsentScreen } from './ConsentScreen'
import { LoginScreen } from './LoginScreen'
import { areasFor, CONSENT_VERSION, useSession, type Area } from './session'

/** While the account or a screen is loading: the star on the canvas, never a blank page. */
export function Splash() {
  return (
    <main className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Loading">
      <Mascot size={96} />
    </main>
  )
}

function Problem({ title, children, retry }: { title: string; children: ReactNode; retry?: () => void }) {
  const { signOut } = useSession()
  return (
    <main className="gutter mx-auto flex min-h-dvh w-full max-w-[calc(480px+2*var(--gutter))] flex-col justify-center">
      <Logo className="mx-auto h-12" />
      <div className="card page-in mt-6 rounded-2xl p-7 text-center" role="alert">
        <div className="mx-auto grid size-14 place-items-center rounded-lg bg-warning-soft text-warning"><UserX className="size-7" aria-hidden /></div>
        <h1 className="mt-4 text-h2">{title}</h1>
        <p className="mt-2 text-body text-ink-2">{children}</p>
        <div className="mt-6 grid gap-2.5">
          {retry && <Button icon={<RotateCcw />} onClick={retry}>Try again</Button>}
          <Button variant="secondary" icon={<LogOut />} onClick={() => void signOut()}>Sign out</Button>
        </div>
      </div>
    </main>
  )
}

/**
 * Opens an area only for people who hold it (AUTH-7). The database enforces the same rules on every
 * request; this decides what to show. Parents accept the consent notice first (AUTH-6).
 */
export function AreaRoute({ area, children }: { area: Area | null; children: ReactNode }) {
  const { state, refresh } = useSession()
  const landing = demoLanding()
  useEffect(() => {
    if (landing && landing === area) clearDemoLanding()
  }, [landing, area])
  if (state.status === 'loading') return <Splash />
  if (state.status === 'signed-out') return <LoginScreen />
  if (state.error) return <Problem title="Couldn't load your account" retry={() => void refresh()}>Check your connection and try again.</Problem>
  const { me } = state
  if (!me) return <Problem title="Account not found">Your sign-in isn't linked to anyone at the school. Please contact the school.</Problem>
  if (!me.active) return <Problem title="Access turned off">The school has turned off access for this account. Please contact the school if this is a mistake.</Problem>
  const areas = areasFor(me)
  if (areas.length === 0) return <Problem title="Nothing to show yet">The school hasn't linked you to a child or given you a role yet. Please contact the school.</Problem>
  if (areas.includes('parent') && me.consent_version !== CONSENT_VERSION) return <ConsentScreen />
  if (landing && landing !== area && areas.includes(landing)) return <Navigate to={`/${landing}`} replace />
  if (!area || !areas.includes(area)) return <Navigate to={`/${areas[0]}`} replace />
  return <>{children}</>
}
