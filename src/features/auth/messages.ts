/** What an auth or database error means to the person, never the server's own words (those can name internals). */
export interface AuthFailure { code?: string; message?: string; status?: number; name?: string }

export const MESSAGES = {
  code: "This code isn't right or has expired. Check the latest WhatsApp message, or send a new code.",
  tooMany: 'Too many attempts. Please wait a moment and try again.',
  sendFailed: "Couldn't send the WhatsApp code right now. Please try again in a moment.",
  again: 'For your safety, please sign in again with a code on WhatsApp.',
  offline: "We couldn't connect right now. Please check your connection and try again.",
  unknown: 'Something went wrong. Please try again.',
}

// What Supabase reports when the Send SMS hook (the WhatsApp sender) fails or times out.
const SEND_FAILED = new Set(['sms_send_failed', 'hook_timeout', 'hook_timeout_after_retry', 'hook_payload_over_size_limit', 'hook_payload_invalid_content_type', 'unexpected_failure'])

export function authMessage(e: AuthFailure | null | undefined): string {
  const code = e?.code ?? ''
  const text = e?.message ?? ''
  if (code === 'otp_expired' || /token has expired|otp.*(expired|invalid)|invalid.*otp/i.test(text)) return MESSAGES.code
  if (code === 'over_sms_send_rate_limit' || e?.status === 429 || code.startsWith('over_') || text.startsWith('rate_limited') || /rate.limit|too many/i.test(text)) return MESSAGES.tooMany
  if (SEND_FAILED.has(code) || /couldn'?t send the whatsapp code/i.test(text)) return MESSAGES.sendFailed
  if (code === 'reauthentication_needed' || code === 'session_not_found') return MESSAGES.again
  if (e?.name === 'AuthRetryableFetchError' || e?.status === 0 || /failed to fetch|network|load failed|fetch/i.test(text) || globalThis.navigator?.onLine === false) return MESSAGES.offline
  return MESSAGES.unknown
}
