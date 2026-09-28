/** What an auth or database error means to the person, never the server's own words (those can name internals). */
export interface AuthFailure { code?: string; message?: string; status?: number; name?: string }

export const MESSAGES = {
  credentials: 'Email or password is incorrect.',
  code: "This code isn't right or has expired. Check the latest email, or send a new code.",
  tooMany: 'Too many attempts. Please wait a moment and try again.',
  weak: 'Choose a stronger password.',
  same: "That's the password you already have. Choose a new one.",
  again: 'For your safety, please sign in again with a code by email, then set your password.',
  offline: "We couldn't connect right now. Please check your connection and try again.",
  unknown: 'Something went wrong. Please try again.',
}

export function authMessage(e: AuthFailure | null | undefined): string {
  const code = e?.code ?? ''
  const text = e?.message ?? ''
  if (code === 'invalid_credentials' || code === 'email_not_confirmed' || /invalid login credentials/i.test(text)) return MESSAGES.credentials
  if (code === 'otp_expired' || /token has expired|otp.*(expired|invalid)|invalid.*otp/i.test(text)) return MESSAGES.code
  if (e?.status === 429 || code.startsWith('over_') || text.startsWith('rate_limited') || /rate.limit|too many/i.test(text)) return MESSAGES.tooMany
  if (code === 'weak_password') return MESSAGES.weak
  if (code === 'same_password') return MESSAGES.same
  if (code === 'reauthentication_needed' || code === 'session_not_found') return MESSAGES.again
  if (e?.name === 'AuthRetryableFetchError' || e?.status === 0 || /failed to fetch|network|load failed|fetch/i.test(text) || globalThis.navigator?.onLine === false) return MESSAGES.offline
  return MESSAGES.unknown
}
