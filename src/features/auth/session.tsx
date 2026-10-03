import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { turnOffPush } from '../notifications/push'

export type Area = 'admin' | 'core' | 'pro' | 'coordinator' | 'parent'
/** 'coordinator' is the Center Coordinator (check-ins and handovers); 'leader' the Center Leader (hears, acknowledges, Ready). */
export type StaffRole = 'admin' | 'core' | 'coordinator' | 'leader' | 'pro'

/** What public.whoami() returns for the signed-in person. */
export interface Me {
  profile_id: string
  full_name: string
  active: boolean
  consent_version: string | null
  roles: StaffRole[]
  children: number
  /** The mobile number they sign in with, as stored (+ and the country code). */
  phone?: string | null
  /** The email they can sign in with, when their record has one (0041). */
  email?: string | null
  /** Their email password: none yet, the starting one from the school's pattern, or one they chose. */
  email_sign_in?: 'none' | 'pattern' | 'own'
}

/** Whether this sign-in used a password (the token's amr), as opposed to a WhatsApp code. */
export function signedInWithPassword(session: Session): boolean {
  try {
    const part = session.access_token.split('.')[1] ?? ''
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { amr?: Array<{ method?: string }> }
    return !!claims.amr?.some((a) => a.method === 'password')
  } catch {
    return false
  }
}

const CHOOSE_KEY = 'jumpstart.chooseArea'
/** Set right after a sign-in, so someone with several areas is asked once where to start (Screen Book sign-in). */
export const chooseArea = {
  ask() { try { sessionStorage.setItem(CHOOSE_KEY, '1') } catch { /* storage blocked: go straight to the first area */ } },
  pending() { try { return sessionStorage.getItem(CHOOSE_KEY) === '1' } catch { return false } },
  done() { try { sessionStorage.removeItem(CHOOSE_KEY) } catch { /* nothing to clear */ } },
}

/** Bump when the consent notice changes; everyone is asked again (AUTH-6). */
// Must be a plain YYYY-MM-DD date: public.accept_consent rejects anything else, and parents would be stuck here.
export const CONSENT_VERSION = '2026-10-02'

/** The areas a person may open, most senior first (their home is the first one). */
export function areasFor(me: Me): Area[] {
  const areas: Area[] = []
  if (me.roles.includes('admin')) areas.push('admin')
  if (me.roles.includes('core')) areas.push('core')
  if (me.roles.includes('pro')) areas.push('pro')
  // One gate area for both gate roles; what each may do there is decided by the database (0038).
  if (me.roles.includes('coordinator') || me.roles.includes('leader')) areas.push('coordinator')
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

/**
 * The database refused the sign-in pass (expired or not valid), as opposed to the network failing or some other error.
 * The words must be about the pass itself: an unrelated message that merely mentions a "token" must not end a session.
 */
export const isAuthError = (e: { code?: string; message?: string; status?: number } | null | undefined) =>
  !!e && (e.code === 'PGRST301' || e.code === 'PGRST303' || e.status === 401 || /\bjwt\b|refresh[ _]token/i.test(e.message ?? ''))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// A phone waking up needs a moment for Wi-Fi or data; three tries over about 3 s ride out that gap.
const RETRY_MS = [0, 800, 2500]

/**
 * Who is signed in, sturdily. An expired pass (a phone or iPad reopened after an hour) is renewed and asked again; a
 * network blip is retried. The person stays signed in until they tap Sign out, or the server refuses to renew the pass
 * (signed out elsewhere), which means signed out, not an error.
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
    chooseArea.done()
    // This device stops getting the signed-out person's alerts. Needs the session, so it comes first; never blocks sign-out.
    await Promise.race([turnOffPush().catch(() => {}), new Promise((r) => setTimeout(r, 3000))])
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
