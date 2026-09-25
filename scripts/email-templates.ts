// Writes the sign-in emails Supabase sends (supabase/templates) from the layout every Jumpstart email shares.
// Run after changing supabase/functions/_shared/emailLayout.ts, then paste each file into Supabase → Authentication →
// Emails → Templates: magic_link.html into "Magic Link" and confirmation.html into "Confirm signup" (the first sign-in).
// Usage: node scripts/email-templates.ts
import { writeFileSync } from 'node:fs'
import { codePanel, emailLayout, INK, INK_2 } from '../supabase/functions/_shared/emailLayout.ts'

const signingInAs = `<p style="margin:0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;color:${INK_2};">Signing in as <b style="color:${INK};">{{ .Email }}</b></p>`
const note = "<b>Keep this code to yourself.</b> Jumpstart will never ask for it by phone or message. If you didn't try to sign in, ignore this email; no one can sign in without the code."
const footerNote = "You're getting this because the school added this email to Jumpstart."

const templates = {
  'magic_link.html': emailLayout({
    title: 'Your Jumpstart sign-in code',
    preheader: '{{ .Token }} is your Jumpstart sign-in code. It works once, for 5 minutes.',
    eyebrow: 'Sign-in code',
    heading: 'Here’s your code',
    intro: 'Enter this code in the Jumpstart app to sign in.',
    main: codePanel('{{ .Token }}'),
    after: signingInAs,
    note,
    footerNote,
  }),
  'confirmation.html': emailLayout({
    title: 'Welcome to Jumpstart',
    preheader: 'Welcome to Jumpstart. {{ .Token }} is your code to finish signing in.',
    eyebrow: 'Welcome',
    heading: 'Welcome to Jumpstart',
    intro: "The school has added you to Jumpstart, the school's app for drop-offs, pickups and messages. Enter this code in the app to finish signing in.",
    main: codePanel('{{ .Token }}'),
    after: signingInAs,
    note,
    footerNote,
  }),
}

for (const [file, html] of Object.entries(templates)) writeFileSync(new URL(`../supabase/templates/${file}`, import.meta.url), html)
console.log('wrote', Object.keys(templates).join(', '))
