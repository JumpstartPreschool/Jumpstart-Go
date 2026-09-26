/**
 * The one design every Jumpstart email uses: the sign-in code and welcome emails (supabase/templates, written by
 * scripts/email-templates.ts) and the invitation (invite.ts). Tables and inline styles only, so Gmail, Apple Mail and
 * Outlook all show the same thing; the logo is a PNG because Outlook can't show WebP.
 * Everything passed in is placed as HTML: escape people's names before they get here.
 */
export const SCHOOL = 'Jumpstart Preschool & Learning Center'
export const ADDRESS = '11/7 Matoshri, Kishor B Tapadia Path, Karve Road, Erandwane, Pune 411004'
const LOGO = 'https://pwmsjcpdihwtgjreizup.supabase.co/storage/v1/object/public/brand/jumpstart-email-logo.png'

export const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
export const DISPLAY = `'Plus Jakarta Sans',${SANS}`
export const INK = '#16193a'
export const INK_2 = '#4b5070'
const INK_3 = '#6a6f8c'
const LINE = '#ece8f1'
const RAINBOW = ['#ef3b3f', '#f7852a', '#ffc21a', '#3cb44b', '#14afa5', '#1f8be6']

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * The invitation itself: a deep red card with a gold button that opens sign-in with their email filled in. The link fills the gold cell,
 * so the whole button is tappable in every client; Outlook, which ignores gradients, gets the solid colours.
 */
export function invitationCard(signInHref: string, siteHref: string, host: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#6b1119" style="background:#6b1119;background-image:linear-gradient(135deg,#8a161b 0%,#4a0c14 100%);border-radius:24px;box-shadow:0 16px 36px rgba(90,15,26,0.3);">
                <tr>
                  <td align="center" class="hero" style="padding:30px 28px 30px;">
                    <div style="font-family:${SANS};font-size:11px;line-height:16px;font-weight:800;letter-spacing:2.4px;text-transform:uppercase;color:#ffd54a;">&#9733;&nbsp; Your personal invitation &nbsp;&#9733;</div>
                    <div style="margin-top:10px;font-family:${DISPLAY};font-size:22px;line-height:30px;font-weight:800;color:#ffffff;">Your place in Jumpstart is ready</div>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" style="margin:22px auto 0;">
                      <tr>
                        <td align="center" bgcolor="#ffc21a" style="border-radius:999px;background:#ffc21a;background-image:linear-gradient(180deg,#ffdc5e 0%,#ffc21a 100%);box-shadow:0 10px 24px rgba(255,194,26,0.35),inset 0 -3px 0 rgba(0,0,0,0.12);">
                          <a href="${signInHref}" target="_blank" style="display:inline-block;padding:19px 46px;font-family:${DISPLAY};font-size:18px;line-height:20px;font-weight:800;letter-spacing:0.2px;color:#16193a;text-decoration:none;border-radius:999px;">Accept invitation &amp; sign in&nbsp;&nbsp;&rarr;</a>
                        </td>
                      </tr>
                    </table>
                    <div style="margin-top:16px;font-family:${SANS};font-size:13px;line-height:20px;color:#f3c9c6;">or visit <a href="${siteHref}" target="_blank" style="color:#ffffff;font-weight:700;text-decoration:none;border-bottom:1px solid rgba(255,255,255,0.35);">${host}</a></div>
                  </td>
                </tr>
              </table>`
}

/** The 6-digit code on a soft panel, big enough to read at a glance and easy to select and copy. */
export function codePanel(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fff7f5;border:1px solid #f8d7d3;border-radius:20px;">
                <tr>
                  <td align="center" style="padding:22px 16px 24px;">
                    <div style="font-family:${SANS};font-size:11px;line-height:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#b3262b;">Your code</div>
                    <div class="code" style="margin-top:6px;font-family:${DISPLAY};font-size:46px;line-height:56px;font-weight:800;letter-spacing:14px;padding-left:14px;color:${INK};font-variant-numeric:tabular-nums;">${code}</div>
                    <div style="margin-top:6px;font-family:${SANS};font-size:13px;line-height:20px;font-weight:600;color:${INK_3};">Works once &middot; expires in 5 minutes</div>
                  </td>
                </tr>
              </table>`
}

/** Numbered steps, each a short line. */
export function steps(items: string[]): string {
  const row = (n: number, body: string) => `
                <tr>
                  <td width="40" valign="top" style="padding:0 0 16px;"><div style="width:28px;height:28px;border-radius:14px;background:#fdeceb;color:#a61c22;font-family:${SANS};font-size:14px;line-height:28px;font-weight:800;text-align:center;">${n}</div></td>
                  <td valign="top" style="padding:4px 0 16px;font-family:${SANS};font-size:15px;line-height:22px;color:${INK_2};">${body}</td>
                </tr>`
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:11px;line-height:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${INK_3};">How to sign in</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${items.map((b, i) => row(i + 1, b)).join('')}
              </table>`
}

interface Layout {
  title: string
  /** The line an inbox shows next to the subject. */
  preheader: string
  /** A small label above the heading: what kind of email this is. */
  eyebrow: string
  heading: string
  intro: string
  /** The main block: a code panel or a button. */
  main: string
  /** Anything after the main block (steps, "signing in as"). */
  after?: string
  /** The reassurance at the end (lock icon). */
  note: string
  footerNote: string
  /** The app's address, for the Privacy and Terms links; left out where the address isn't known. */
  appUrl?: string
}

export function emailLayout(o: Layout): string {
  const strip = RAINBOW.map((c) => `<td height="6" style="background:${c};height:6px;font-size:0;line-height:0;">&nbsp;</td>`).join('')
  const links = o.appUrl
    ? `<br><a href="${o.appUrl}/privacy" target="_blank" style="color:${INK_3};text-decoration:underline;">Privacy Policy</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;<a href="${o.appUrl}/terms" target="_blank" style="color:${INK_3};text-decoration:underline;">Terms of Use</a>`
    : ''
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${o.title}</title>
<style>
  @media (max-width: 540px) {
    .outer { padding: 16px 8px !important; }
    .pad { padding-left: 24px !important; padding-right: 24px !important; }
    .head { padding: 28px 24px 24px !important; }
    .h1 { font-size: 24px !important; line-height: 32px !important; }
    .code { font-size: 38px !important; letter-spacing: 10px !important; padding-left: 10px !important; }
    .btn, .btn td, .btn a { display: block !important; width: 100% !important; box-sizing: border-box; }
    .btn a { padding-left: 16px !important; padding-right: 16px !important; }
    .hero { padding: 26px 18px !important; }
    .sub { font-size: 9px !important; letter-spacing: 1px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f5f2ec;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${o.preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f2ec;">
    <tr>
      <td class="outer" align="center" style="padding:40px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:28px;overflow:hidden;box-shadow:0 18px 40px rgba(22,25,58,0.08);">
          <tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${strip}</tr></table></td></tr>
          <tr>
            <td class="head" align="center" bgcolor="#ffffff" style="padding:34px 40px 22px;background:#ffffff;">
              <img src="${LOGO}" width="224" alt="Jumpstart" style="display:block;width:224px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;margin:0 auto;">
              <div class="sub" style="margin-top:12px;font-family:${SANS};font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${INK_3};">Preschool &amp; Learning Center &middot; Karve Road</div>
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:12px 44px 0;font-family:${DISPLAY};">
              <span style="display:inline-block;padding:5px 12px;border-radius:999px;background:#fdeceb;font-family:${SANS};font-size:12px;line-height:16px;font-weight:800;color:#a61c22;">${o.eyebrow}</span>
              <h1 class="h1" style="margin:14px 0 0;font-size:28px;line-height:36px;font-weight:800;letter-spacing:-0.3px;color:${INK};">${o.heading}</h1>
              <p style="margin:12px 0 0;font-family:${SANS};font-size:16px;line-height:25px;color:${INK_2};">${o.intro}</p>
            </td>
          </tr>
          <tr><td class="pad" align="center" style="padding:28px 44px 0;">${o.main}</td></tr>
          ${o.after ? `<tr><td class="pad" style="padding:28px 44px 0;">${o.after}</td></tr>` : ''}
          <tr>
            <td class="pad" style="padding:24px 44px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fff6f5;border-radius:16px;">
                <tr>
                  <td width="36" valign="top" style="padding:14px 0 14px 16px;font-size:18px;line-height:22px;">&#128274;</td>
                  <td valign="top" style="padding:14px 18px 14px 4px;font-family:${SANS};font-size:14px;line-height:21px;color:${INK_2};">${o.note}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td align="center" style="padding:22px 24px 8px;font-family:${SANS};font-size:12px;line-height:19px;color:${INK_3};">
              <b style="color:${INK_2};">${escapeHtml(SCHOOL)}</b><br>${ADDRESS}<br>${o.footerNote}${links}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
