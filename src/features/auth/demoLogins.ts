import { supabase } from '../../lib/supabase'

/**
 * Demo sign-ins for the team to try the parent app (temporary): ten demo parents on +91 90000 00001 to +91 90000 00010,
 * each with one demo child (scripts/demo/add-demo-logins.sql). The Send SMS hook keeps their code instead of sending it
 * on WhatsApp (0050), and the sign-in screen fills it in. Every other number gets its code on WhatsApp. To remove: run
 * scripts/demo/remove-demo-logins.sql, then delete this file and its uses in LoginScreen.tsx.
 */
export const isDemoNumber = (e164: string) => /^\+9190000000(0[1-9]|10)$/.test(e164)

/**
 * Supabase → Phone → Test phone numbers, if they are set, sign these numbers in with this code without calling the hook.
 */
export const DEMO_CODE = '246810'

/** The code just made for a demo number. The hook keeps it before Supabase answers, so the first read nearly always has it. */
export async function demoCode(e164: string): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const { data } = await supabase.rpc('demo_code', { p_phone: e164 })
    if (typeof data === 'string' && /^\d{6}$/.test(data)) return data
    await new Promise((r) => setTimeout(r, 500))
  }
  return DEMO_CODE
}
