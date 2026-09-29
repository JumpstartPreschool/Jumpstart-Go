import type { ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ChevronRight, RotateCcw, UserX } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Logo, Mascot } from '../../ui/Logo'
import { SignOutButton } from '../../ui/SignOutButton'
import { ConsentScreen } from './ConsentScreen'
import { LoginScreen, SignInFrame } from './LoginScreen'
import { SetPasswordScreen } from './SetPasswordScreen'
import { AREA_DOES, AREA_ICON, AREA_LABEL } from './AreaShell'
import { areasFor, chooseArea, CONSENT_VERSION, passwordStep, useSession, type Area, type Me } from './session'

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
          <SignOutButton onClick={() => void signOut()} />
        </div>
      </div>
    </main>
  )
}

/** Right after signing in, everyone sees who they're signing in as (their areas, from the roles the school gave them) and taps one. */
function AreaChooser({ me, areas, onPick }: { me: Me; areas: Area[]; onPick: (area: Area) => void }) {
  return (
    <SignInFrame>
      <div className="card page-in rounded-[28px] p-6 shadow-[var(--shadow-lift)] sm:p-7">
        <div className="text-center">
          <h1 className="text-h2">Welcome, {me.full_name.split(' ')[0]}</h1>
          <p className="mt-1.5 text-body text-ink-2">{areas.length > 1 ? 'Sign in as:' : 'You’re signing in as:'}</p>
        </div>
        <div className="mt-5 grid gap-3">
          {areas.map((a) => (
            <button key={a} type="button" className="choice flex items-center gap-3.5 p-3.5" onClick={() => onPick(a)}>
              <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent [&_svg]:size-[22px]" aria-hidden>{AREA_ICON[a]}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-h4">{AREA_LABEL[a]}</span>
                <span className="block text-small font-semibold text-ink-2">{AREA_DOES[a]}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
            </button>
          ))}
        </div>
      </div>
    </SignInFrame>
  )
}

/**
 * Opens an area only for people who hold it (AUTH-7). The database enforces the same rules on every
 * request; this decides what to show. The Parent area asks for the consent notice first (AUTH-6).
 */
export function AreaRoute({ area, children }: { area: Area | null; children: ReactNode }) {
  const { state, refresh } = useSession()
  const navigate = useNavigate()
  // Read on every render: the flag is set by the login screen just before the session arrives.
  const choosing = chooseArea.pending()
  if (state.status === 'loading') return <Splash />
  if (state.status === 'signed-out') return <LoginScreen />
  if (state.error) return <Problem title="Couldn't load your account" retry={() => void refresh()}>Check your connection and try again.</Problem>
  const { me } = state
  if (!me) return <Problem title="Account not found">Your sign-in isn't linked to anyone at the school. Please contact the school.</Problem>
  if (!me.active) return <Problem title="Access turned off">The school has turned off access for this account. Please contact the school if this is a mistake.</Problem>
  // Signed in with an email code: choose a new password (forgotten), or create one. No password yet always means the
  // password step, even after a refresh or a reopened app, so the email code is needed only once (0034).
  const setting = passwordStep.pending()
  if (setting === 'reset' || me.has_password === false || (setting === 'first' && me.has_password !== true)) {
    return <SetPasswordScreen intent={setting ?? 'first'} email={state.session.user.email ?? ''} />
  }
  const areas = areasFor(me)
  if (areas.length === 0) return <Problem title="Nothing to show yet">The school hasn't linked you to a child or given you a role yet. Please contact the school.</Problem>
  if (choosing) {
    return <AreaChooser me={me} areas={areas} onPick={(a) => { chooseArea.done(); navigate(`/${a}`, { replace: true }) }} />
  }
  if (!area || !areas.includes(area)) return <Navigate to={`/${areas[0]}`} replace />
  if (area === 'parent' && me.consent_version !== CONSENT_VERSION) return <ConsentScreen />
  return <>{children}</>
}
