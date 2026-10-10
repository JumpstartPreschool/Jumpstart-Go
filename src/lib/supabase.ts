import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  // Fail loudly at start-up rather than with confusing network errors later.
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example).')
}

/** The one Supabase client. The publishable key is public; row-level security protects the data. */
// `npm run dev:demo` only: a made-up school answered in the browser (demo.ts). DEV is false in every build, so this and
// demo.ts never reach production.
const demo = import.meta.env.DEV && import.meta.env.VITE_DEMO === '1'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce', ...(demo ? { storageKey: 'jumpstart-demo-auth' } : {}) },
  ...(demo ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => import('./demo').then((m) => m.demoFetch(input, init)) } } : {}),
})
