// Someone chooses their own email password (D55, 0048). Called with their own sign-in; nobody else's password can be
// set here, and the admin never sees it.
// Deploy: npx supabase functions deploy password-change
// Secrets: none of its own (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are built in). APP_ORIGIN
// (optional): the app's https origin, as for password-pattern.
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { Policy } from '../_shared/passwordPattern.ts'
import { handle, parseBody, Refused } from './handler.ts'

const env = (name: string) => Deno.env.get(name)
const cors = {
  'Access-Control-Allow-Origin': env('APP_ORIGIN') ?? '*',
  Vary: 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const service = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const caller = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } })
  try {
    const body = parseBody(await req.json().catch(() => null))
    await handle({
      caller: async () => {
        const { data, error } = await service.auth.getUser(jwt)
        if (error || !data.user) return null
        const me = await caller.rpc('whoami')
        if (me.error || !me.data) return null
        return { user_id: data.user.id, email_sign_in: (me.data as { email_sign_in: 'none' | 'temporary' | 'own' }).email_sign_in }
      },
      policy: async () => {
        const { data, error } = await service.from('password_policy').select('*').single()
        if (error) throw error
        return data as Policy
      },
      reused: async (userId, password, count) => {
        const { data, error } = await service.rpc('password_reused', { p_user: userId, p_password: password, p_count: count })
        if (error) throw error
        return data === true
      },
      setPassword: async (userId, password) => {
        const { error } = await service.auth.admin.updateUserById(userId, { password })
        if (error) throw new Refused(400, /password/i.test(error.message) ? "Supabase didn't accept that password. Try a longer one." : "Your password couldn't be saved. Try again.")
      },
      signOutOthers: async () => {
        const { error } = await service.auth.admin.signOut(jwt, 'others')
        if (error) throw error
      },
    }, body)
    console.log(JSON.stringify({ password_change: 'ok' }))
    return reply({ ok: true })
  } catch (e) {
    if (e instanceof Refused) return reply({ error: e.message }, e.status)
    console.error(JSON.stringify({ password_change: 'error', code: (e as { code?: string }).code ?? null }))
    return reply({ error: "Your password couldn't be saved. Try again in a moment." }, 500)
  }
})
