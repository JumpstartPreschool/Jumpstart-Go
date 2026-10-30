// Issues one person's temporary password from the admin's pattern (D55, 0048). The admin calls it with their sign-in;
// the database checks they are the admin, that the person may have one, and which pattern applies.
// Deploy: npx supabase functions deploy password-pattern
// Secrets: none of its own (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are built in). APP_ORIGIN
// (optional): the app's https origin, the only site allowed to call this; the same one `route` uses.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handle, parseBody, Refused, type Target } from './handler.ts'

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
  const auth = req.headers.get('Authorization') ?? ''
  // As the caller, so the admin check and the audit log apply exactly as in the app.
  const caller = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } })
  try {
    const body = parseBody(await req.json().catch(() => null))
    const result = await handle({
      begin: async (profileId) => {
        const { data, error } = await caller.rpc('admin_begin_temp_password', { p_profile: profileId })
        if (error) throw dbRefusal(error)
        return data as Target
      },
      createUser: async ({ email, phone, password }) => {
        const { data, error } = await service.auth.admin.createUser({
          email, password, email_confirm: true,
          ...(phone ? { phone: phone.replace(/^\+/, ''), phone_confirm: true } : {}),
          // The database only lets an email account in when the school made it (0041).
          app_metadata: { provisioned: 'school' },
        })
        if (error) throw error
        return data.user.id
      },
      updateUser: async (id, u) => {
        const { error } = await service.auth.admin.updateUserById(id, { email: u.email, email_confirm: true, password: u.password })
        if (error) throw error
      },
      finish: async (profileId, userId) => {
        const { data, error } = await service.rpc('finish_temp_password', { p_profile: profileId, p_user: userId })
        if (error) throw error
        return data as string
      },
    }, body)
    // Never the password or an email in the logs.
    console.log(JSON.stringify({ temp_password: 'issued' }))
    return reply(result)
  } catch (e) {
    if (e instanceof Refused) return reply({ error: e.message }, e.status)
    console.error(JSON.stringify({ temp_password: 'error', code: (e as { code?: string }).code ?? null }))
    return reply({ error: "The temporary password couldn't be issued. Try again in a moment." }, 500)
  }
})

/** The database's own sentence for the admin (prefix removed); not-the-admin becomes 403. */
function dbRefusal(error: { code?: string; message: string }): Refused {
  return new Refused(error.code === '42501' ? 403 : 400, error.message.replace(/^[a-z_]+: /, ''))
}
