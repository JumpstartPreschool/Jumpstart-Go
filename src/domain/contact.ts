/** Contact details as the database stores them (profiles: email lower-cased, phone as +91XXXXXXXXXX). */

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase()
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) && email.length <= 254 ? email : null
}

/** "98765 43210", "+91-98765-43210" or "09876543210" → "+919876543210". Null when it isn't an Indian mobile. */
export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '')
  if (digits.startsWith('+91')) digits = digits.slice(3)
  else if (digits.startsWith('0091')) digits = digits.slice(4)
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null
}

/** "+919876543210" → "+91 98765 43210". */
export function formatIndianMobile(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164)
  return m ? `+91 ${m[1]} ${m[2]}` : e164
}
