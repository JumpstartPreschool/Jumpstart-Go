import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

export type Area = 'admin' | 'core' | 'pro' | 'coordinator' | 'parent'
export type StaffRole = 'admin' | 'core' | 'coordinator' | 'pro'

/** What public.whoami() returns for the signed-in person. */
export interface Me {
  profile_id: string
  full_name: string
  active: boolean
  consent_version: string | null
  roles: StaffRole[]
  children: number
  /** Whether they've set a password (0033). Missing before that migration, null when the database can't tell. */
  has_password?: boolean | null
}

const CHOOSE_KEY = 'jumpstart.chooseArea'
/** Set right after a sign-in, so someone with several areas is asked once where to start (Screen Book sign-in). */
export const chooseArea = {
  ask() { try { sessionStorage.setItem(CHOOSE_KEY, '1') } catch { /* storage blocked: go straight to the first area */ } },
  pending() { try { return sessionStorage.getItem(CHOOSE_KEY) === '1' } catch { return false } },
  done() { try { sessionStorage.removeItem(CHOOSE_KEY) } catch { /* nothing to clear */ } },
}

const PASSWORD_KEY = 'jumpstart.passwordStep'
/**
 * Set just before an email code is checked: 'first' asks for a password when the account has none, 'reset' always
 * asks for a new one. Per tab, so a refresh mid-step still asks, and nothing sensitive is stored.
 */
export const passwordStep = {
  ask(intent: 'first' | 'reset') { try { sessionStorage.setItem(PASSWORD_KEY, intent) } catch { /* storage blocked: no prompt */ } },
  pending(): 'first' | 'reset' | null {
    try {
      const v = sessionStorage.getItem(PASSWORD_KEY)
      return v === 'first' || v === 'reset' ? v : null
    } catch { return null }
  },
  done() { try { sessionStorage.removeItem(PASSWORD_KEY) } catch { /* nothing to clear */ } },
}

/** Bump when the consent notice changes; everyone is asked again (AUTH-6). */
// Raised when what parents agree to changes, so everyone is asked again: gate announcements, names included, are now
// made by Microsoft Azure AI Speech (D50).
// Must be a plain YYYY-MM-DD date: public.accept_consent rejects anything else, and parents would be stuck here.
export const CONSENT_VERSION = '2026-09-29'

/** The areas a person may open, most senior first (their home is the first one). */
export function areasFor(me: Me): Area[] {
  const areas: Area[] = []
  if (me.roles.includes('admin')) areas.push('admin')
  if (me.roles.includes('core')) areas.push('core')
  if (me.roles.includes('pro')) areas.push('pro')
  if (me.roles.includes('coordinator')) areas.push('coordinator')
  if (me.children > 0) areas.push('parent')
  return areas
}

type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session; me: Me | null; error: string | null }

interface SessionValue {
  state: SessionState
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

/** The database refused the sign-in pass (expired or not valid), as opposed to the network failing. */
export const isAuthError = (e: { code?: string; message?: string; status?: number } | null | undefined) =>
  !!e && (e.code === 'PGRST301' || e.code === 'PGRST303' || e.status === 401 || /jwt|token/i.test(e.message ?? ''))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// A phone waking up needs a moment for Wi-Fi or data; three tries over about 3 s ride out that gap.
const RETRY_MS = [0, 800, 2500]

/**
 * Who is signed in, sturdily. An expired pass (a phone or iPad reopened after an hour) is renewed and asked again; a
 * network blip is retried; a pass that can't be renewed any more (signed out elsewhere) means signed out, not an error.
 */
async function whoami(): Promise<{ me: Me | null; error: string | null; ended: boolean }> {
  let error: string | null = null
  for (const wait of RETRY_MS) {
    if (wait) await sleep(wait)
    const res = await supabase.rpc('whoami')
    if (!res.error) return { me: (res.data as Me | null) ?? null, error: null, ended: false }
    error = res.error.message
    if (isAuthError(res.error)) {
      const renewed = await supabase.auth.refreshSession()
      // Refused by the server (not a network failure): this sign-in is over.
      if (renewed.error && renewed.error.name !== 'AuthRetryableFetchError' && (renewed.error.status ?? 0) >= 400) return { me: null, error, ended: true }
    }
  }
  return { me: null, error, ended: false }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  const load = useCallback(async (session: Session | null) => {
    if (!session) return setState({ status: 'signed-out' })
    const { me, error, ended } = await whoami()
    if (ended) {
      await supabase.auth.signOut({ scope: 'local' })
      return setState({ status: 'signed-out' })
    }
    setState((prev) =>
      // Already showing this person and only a background re-check failed: keep the app open rather than an error page.
      error && prev.status === 'signed-in' && prev.me && prev.session.user.id === session.user.id
        ? { ...prev, session }
        : { status: 'signed-in', session, me, error })
  }, [])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Token refreshes keep the same person; only reload who they are when that could have changed.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void load(session)
    })
    return () => data.subscription.unsubscribe()
  }, [load])

  // Couldn't load (offline, or the device just woke): try again by itself when the connection or the app comes back.
  const failed = state.status === 'signed-in' && !!state.error
  useEffect(() => {
    if (!failed) return
    const retry = () => { if (document.visibilityState === 'visible' && navigator.onLine) void supabase.auth.getSession().then(({ data }) => load(data.session)) }
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', retry)
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', retry)
    }
  }, [failed, load])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await load(data.session)
  }, [load])

  const signOut = useCallback(async () => {
    passwordStep.done()
    chooseArea.done()
    await supabase.auth.signOut()
    setState({ status: 'signed-out' })
  }, [])

  return <SessionContext.Provider value={{ state, refresh, signOut }}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}
