/**
 * Demo sign-ins for the team to try the parent app (temporary): ten demo parents on +91 90000 00001 to +91 90000 00010,
 * each with one demo child (scripts/demo/add-demo-logins.sql). Supabase → Authentication → Phone → Test phone numbers
 * signs these numbers in with DEMO_CODE and sends nothing, so the sign-in screen fills the code in. Every other number
 * gets its code on WhatsApp. To remove: run scripts/demo/remove-demo-logins.sql, delete the test numbers in Supabase,
 * then delete this file and its uses in LoginScreen.tsx.
 */
export const DEMO_CODE = '246810'

export const isDemoNumber = (e164: string) => /^\+9190000000(0[1-9]|10)$/.test(e164)
