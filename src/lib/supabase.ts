import { createClient } from '@supabase/supabase-js'
import { DEMO_AVAILABLE, demoFetch, isDemo } from '../demo/demo'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  // Fail loudly at start-up rather than with confusing network errors later.
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example).')
}

/**
 * In demo mode (development and design builds only) requests go to the in-browser sample backend and the
 * demo session is kept in this tab only, so it can never mix with a real sign-in.
 */
const demo = DEMO_AVAILABLE
  ? {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => (isDemo() ? demoFetch(input, init) : fetch(input, init)),
      storage: {
        getItem: (k: string) => (isDemo() ? sessionStorage : localStorage).getItem(k),
        setItem: (k: string, v: string) => (isDemo() ? sessionStorage : localStorage).setItem(k, v),
        removeItem: (k: string) => (isDemo() ? sessionStorage : localStorage).removeItem(k),
      },
    }
  : null

/** The one Supabase client. The publishable key is public; row-level security protects the data. */
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce', storage: demo?.storage },
  global: demo ? { fetch: demo.fetch } : {},
})
