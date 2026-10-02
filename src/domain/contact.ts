/** Contact details as the database stores them (profiles: email lower-cased; phones as + and the country code). */

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase()
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) && email.length <= 254 ? email : null
}

/**
 * A mobile number as "+<country><number>": "98765 43210", "098765-43210", "091 98765 43210", "+91 98765 43210" or "0091 9876543210" →
 * "+919876543210"; "+971 50 123 4567" → "+971501234567" (families abroad, D26). Without + or 00 it must be an Indian
 * mobile. Null for landlines, short numbers and anything else.
 */
export function normalizeMobile(input: string): string | null {
  const t = input.trim()
  const international = t.startsWith('+') || t.startsWith('00')
  let d = t.replace(/\D/g, '')
  if (international) {
    if (t.startsWith('00')) d = d.slice(2)
    if (d.startsWith('91')) return /^91[6-9][0-9]{9}$/.test(d) ? `+${d}` : null
    return /^[1-9][0-9]{7,14}$/.test(d) ? `+${d}` : null
  }
  // A leading 0 is the dialling prefix for a national call ("09876543210", "091 98765 43210").
  d = d.replace(/^0+/, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  return /^[6-9][0-9]{9}$/.test(d) ? `+91${d}` : null
}

/** "+919876543210" → "+91 98765 43210"; other countries as stored. */
export function formatMobile(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164)
  return m ? `+91 ${m[1]} ${m[2]}` : e164
}

/** Opens WhatsApp (app or web) with the message ready to send to that number. */
export const whatsappUrl = (e164: string, text: string) => `https://wa.me/${e164.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`

/** Opens the phone's Messages app with the text ready to send. `?&body=` works on both iPhone and Android. */
export const smsUrl = (e164: string, text: string) => `sms:${e164}?&body=${encodeURIComponent(text)}`
