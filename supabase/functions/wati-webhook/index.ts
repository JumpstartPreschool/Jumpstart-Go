// WATI status webhook: records message statuses (sent, delivered, read, failed) into app.whatsapp_log.
// Deploy: npx supabase functions deploy wati-webhook --no-verify-jwt   (required: WATI sends no Supabase JWT)
// Secrets: WATI_WEBHOOK_SECRET (checked against the `key` query parameter, see _shared/watiWebhook.ts)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleWebhook } from '../_shared/watiWebhook.ts'

const env = (name: string) => Deno.env.get(name)

const db = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

Deno.serve((req) =>
  handleWebhook(req, {
    secret: env('WATI_WEBHOOK_SECRET'),
    record: async (localId, status, error) => {
      const { data, error: dbError } = await db.rpc('whatsapp_log_status', { p_local_id: localId, p_status: status, p_error: error })
      if (dbError) throw dbError
      return data === true
    },
  }),
)
