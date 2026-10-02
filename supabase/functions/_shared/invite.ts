/**
 * What an invitation says (D36) when the admin sends it from their own phone as a text message: the fallback when
 * WhatsApp isn't set up or a number can't be reached. The WhatsApp invitation itself is a WATI template (wati.ts).
 */
export interface InviteDetails { full_name: string; phone: string | null; app_url: string; staff: boolean; children: string[]; roles?: string | null }

export const firstName = (full: string) => full.trim().split(/\s+/)[0] || full.trim()

/** "Kabir", "Kabir and Meera", "Aarav, Kabir and Meera". */
export const joinNames = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** The app address without a trailing slash. */
const appUrl = (d: InviteDetails) => d.app_url.replace(/\/+$/, '')

/** The invitation link. The number rides after the #, which browsers never send to a server; the sign-in screen fills it in. */
export function inviteLink(d: InviteDetails): string {
  return d.phone ? `${appUrl(d)}/#phone=${encodeURIComponent(d.phone)}` : appUrl(d)
}

/** "for Kabir", "for Kabir and Meera", or nothing for staff. */
function forWhom(d: InviteDetails): string {
  return !d.staff && d.children.length ? ` for ${joinNames(d.children)}` : ''
}

/** What the app gives them, in one sentence. */
function what(d: InviteDetails): string {
  return d.staff
    ? 'Use it for the school day: arrivals at the gate, schedules and messages.'
    : `See ${d.children.length === 1 ? `${d.children[0]}'s` : "your children's"} day, tell the school you're on the way, and hear from the school.`
}

/** The text message: a greeting, what it's for, three numbered steps and the school's name. */
export function inviteText(d: InviteDetails): string {
  return [
    `Hello ${firstName(d.full_name)},`,
    '',
    `Jumpstart Preschool has invited you to the Jumpstart Go app${forWhom(d)}. ${what(d)}`,
    '',
    'To sign in:',
    `1. Open ${inviteLink(d)}`,
    '2. Enter your mobile number',
    '3. Type the 6-digit code we send you on WhatsApp. You stay signed in.',
    '',
    'Jumpstart Preschool, Karve Road, Pune',
  ].join('\n')
}
