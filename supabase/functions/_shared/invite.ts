/**
 * What an invitation says (D36), by email (invite-send) and by text or WhatsApp (the admin's phone): one wording for both.
 * Names come from people's records, so everything placed in the email's HTML is escaped.
 */
export interface InviteDetails { full_name: string; email: string | null; phone: string | null; app_url: string; staff: boolean; children: string[] }

const SCHOOL = 'Jumpstart Preschool & Learning Center'
const ADDRESS = '11/7 Matoshri, Kishor B Tapadia Path, Karve Road, Erandwane, Pune 411004'
const LOGO = 'https://pwmsjcpdihwtgjreizup.supabase.co/storage/v1/object/public/brand/jumpstart-email-logo.png'

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

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const DISPLAY = `'Plus Jakarta Sans',${SANS}`

/** The invitation email, in the same design as the sign-in code emails (supabase/templates). */
export function inviteEmail(d: InviteDetails): { subject: string; html: string; text: string } {
  const name = escapeHtml(firstName(d.full_name))
  const url = escapeHtml(d.app_url)
  const email = escapeHtml(d.email ?? '')
  const who = escapeHtml(forWhom(d))
  const step = (n: number, body: string) => `
            <tr>
              <td width="36" valign="top" style="padding:0 0 14px;"><div style="width:28px;height:28px;border-radius:14px;background:#eaf2ff;color:#0f4aae;font-family:${SANS};font-size:14px;line-height:28px;font-weight:800;text-align:center;">${n}</div></td>
              <td valign="top" style="padding:3px 0 14px;font-family:${SANS};font-size:15px;line-height:22px;color:#4b5070;">${body}</td>
            </tr>`
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>You're invited to Jumpstart</title>
<style>
  @media (max-width: 520px) {
    .outer { padding: 0 !important; }
    .card { border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
    .pad { padding-left: 24px !important; padding-right: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#fdfbf8;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;">${SCHOOL} has added you to the Jumpstart app${who}. Sign in with ${email}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdfbf8;">
    <tr>
      <td class="outer" align="center" style="padding:32px 12px;">
        <table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #ece8f1;border-radius:24px;overflow:hidden;">
          <tr>
            <td style="padding:0;font-size:0;line-height:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td height="6" style="background:#ef3b3f;height:6px;"></td><td height="6" style="background:#f7852a;height:6px;"></td>
                <td height="6" style="background:#ffc21a;height:6px;"></td><td height="6" style="background:#3cb44b;height:6px;"></td>
                <td height="6" style="background:#14afa5;height:6px;"></td><td height="6" style="background:#1f8be6;height:6px;"></td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:36px 40px 8px;">
              <img src="${LOGO}" width="200" height="65" alt="Jumpstart Preschool" style="display:block;width:200px;height:auto;border:0;outline:none;text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:20px 40px 0;font-family:${DISPLAY};">
              <h1 style="margin:0;font-size:24px;line-height:32px;font-weight:800;color:#16193a;">Hello ${name}, you're invited</h1>
              <p style="margin:10px 0 0;font-size:16px;line-height:24px;color:#4b5070;">The school has added you to the Jumpstart app${who}. ${escapeHtml(what(d))}</p>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:28px 40px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#1560d4" style="border-radius:16px;background:#1560d4;box-shadow:0 4px 0 #0c3e8f;">
                    <a href="${url}" target="_blank" style="display:inline-block;padding:16px 36px;font-family:${DISPLAY};font-size:17px;line-height:20px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:16px;">Open Jumpstart</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:32px 40px 0;">
              <p style="margin:0 0 14px;font-family:${SANS};font-size:12px;line-height:16px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6a6f8c;">How to sign in</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${step(1, 'Open Jumpstart. On an iPhone or iPad, tap Share, then <b style="color:#16193a;">Add to Home Screen</b> to keep it like an app.')}${step(2, `Enter <b style="color:#16193a;">${email}</b>.`)}${step(3, 'We email you a 6-digit code. Type it into the app. There is no password to remember.')}
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:8px 40px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-left:3px solid #1560d4;background:#eaf2ff;border-radius:0 12px 12px 0;">
                <tr><td style="padding:12px 16px;font-family:${SANS};font-size:14px;line-height:21px;color:#0f4aae;">Only people the school adds can sign in, and only with this email address. If you weren't expecting this, you can ignore it.</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:20px 40px 28px;border-top:1px solid #ece8f1;font-family:${SANS};font-size:12px;line-height:19px;color:#6a6f8c;">
              <b style="color:#4b5070;">${escapeHtml(SCHOOL)}</b><br>${ADDRESS}<br>You're getting this because the school added this email to Jumpstart.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
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
