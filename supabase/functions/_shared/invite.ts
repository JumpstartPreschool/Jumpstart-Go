/**
 * What an invitation says (D36), by email (invite-send) and by text or WhatsApp (the admin's phone): one wording for both.
 * Names come from people's records, so everything placed in the email's HTML is escaped.
 */
import { ADDRESS, emailLayout, invitationCard, escapeHtml, INK, SCHOOL, steps } from './emailLayout.ts'

export { escapeHtml }
export interface InviteDetails { full_name: string; email: string | null; phone: string | null; app_url: string; staff: boolean; children: string[] }

export const firstName = (full: string) => full.trim().split(/\s+/)[0] || full.trim()
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** "for Kabir", "for Kabir and Meera", or nothing for staff. */
function forWhom(d: InviteDetails): string {
  return !d.staff && d.children.length ? ` for ${list(d.children)}` : ''
}

/** What the app gives them, in one sentence. */
function what(d: InviteDetails): string {
  return d.staff
    ? 'Use it for the school day: arrivals at the gate, schedules and messages.'
    : `See ${d.children.length === 1 ? `${d.children[0]}'s` : 'your children\'s'} day, tell the school you're on the way, and hear from the school.`
}

/** The text or WhatsApp message: short, with the link and how to sign in. */
export function inviteText(d: InviteDetails): string {
  return [
    `Hello ${firstName(d.full_name)}, ${SCHOOL} has added you to the Jumpstart app${forWhom(d)}.`,
    `Open ${d.app_url} and sign in with ${d.email ?? 'your email address'}. We'll email you a 6-digit code to enter; no password needed.`,
  ].join(' ')
}

/** The address without "https://", as people read it: "app.jumpstartpreschool.in". */
const host = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

/** The invitation email, in the design every Jumpstart email shares (emailLayout.ts). */
export function inviteEmail(d: InviteDetails): { subject: string; html: string; text: string } {
  const name = escapeHtml(firstName(d.full_name))
  const url = escapeHtml(d.app_url.replace(/\/$/, ''))
  const email = escapeHtml(d.email ?? '')
  const who = escapeHtml(forWhom(d))
  const b = (s: string) => `<b style="color:${INK};">${s}</b>`
  const html = emailLayout({
    title: "You're invited to Jumpstart",
    preheader: `${escapeHtml(SCHOOL)} has added you to the Jumpstart app${who}. Sign in with ${email}.`,
    eyebrow: d.staff ? 'Staff invitation' : 'Family invitation',
    heading: `Hello ${name}, you're invited`,
    intro: `The school has added you to the Jumpstart app${who}. ${escapeHtml(what(d))}`,
    main: invitationCard(url, escapeHtml(host(d.app_url))),
    after: steps([
      `Open Jumpstart on your phone, tablet or computer. On a phone, choose ${b('Add to Home Screen')} from the browser's menu to keep it like an app.`,
      `Enter ${b(email)}.`,
      `We email you a ${b('6-digit code')}. Type it into the app; there is no password to remember.`,
    ]),
    note: 'Only people the school adds can sign in, and only with this email address. If you weren\'t expecting this, you can ignore it.',
    footerNote: "You're getting this because the school added this email to Jumpstart.",
    appUrl: url,
  })
  const text = [
    `Hello ${firstName(d.full_name)}, you're invited to Jumpstart.`,
    '',
    `The school has added you to the Jumpstart app${forWhom(d)}. ${what(d)}`,
    '',
    `1. Open ${d.app_url}`,
    `2. Enter ${d.email ?? 'your email address'}`,
    '3. Type the 6-digit code we email you. There is no password.',
    '',
    `${SCHOOL}, ${ADDRESS}`,
  ].join('\n')
  return { subject: "You're invited to Jumpstart", html, text }
}
