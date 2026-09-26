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
}

const CHOOSE_KEY = 'jumpstart.chooseArea'
/** Set right after a sign-in, so someone with several areas is asked once where to start (Screen Book sign-in). */
export const chooseArea = {
  ask() { try { sessionStorage.setItem(CHOOSE_KEY, '1') } catch { /* storage blocked: go straight to the first area */ } },
  pending() { try { return sessionStorage.getItem(CHOOSE_KEY) === '1' } catch { return false } },
  done() { try { sessionStorage.removeItem(CHOOSE_KEY) } catch { /* nothing to clear */ } },
}

/** Bump when the consent notice changes; everyone is asked again (AUTH-6). */
// Raised when what parents agree to changes, so everyone is asked again: names go to the gate's voice service, which
// may be Microsoft Azure or ElevenLabs (D43, D47).
export const CONSENT_VERSION = '2026-09-27'

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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  const load = useCallback(async (session: Session | null) => {
    if (!session) return setState({ status: 'signed-out' })
    const { data, error } = await supabase.rpc('whoami')
    setState({ status: 'signed-in', session, me: (data as Me | null) ?? null, error: error ? error.message : null })
  }, [])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Token refreshes keep the same person; only reload who they are when that could have changed.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void load(session)
    })
    return () => data.subscription.unsubscribe()
  }, [load])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await load(data.session)
  }, [load])

  const signOut = useCallback(async () => {
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
