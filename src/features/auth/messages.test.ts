import { expect, it } from 'vitest'
import { authMessage, MESSAGES } from './messages'

it('turns auth errors into plain words and never passes the server text through', () => {
  expect(authMessage({ code: 'otp_expired', message: 'Token has expired or is invalid', status: 403 })).toBe(MESSAGES.code)
  expect(authMessage({ code: 'over_request_rate_limit', status: 429 })).toBe(MESSAGES.tooMany)
  expect(authMessage({ code: 'over_sms_send_rate_limit', status: 429 })).toBe(MESSAGES.tooMany)
  expect(authMessage({ message: 'rate_limited: login:+919220991947' })).toBe(MESSAGES.tooMany)
  expect(authMessage({ code: 'reauthentication_needed' })).toBe(MESSAGES.again)
  expect(authMessage({ name: 'AuthRetryableFetchError', status: 0 })).toBe(MESSAGES.offline)
  expect(authMessage({ message: 'TypeError: Failed to fetch' })).toBe(MESSAGES.offline)
  expect(authMessage({ message: 'relation "auth.users" does not exist', code: '42P01' })).toBe(MESSAGES.unknown)
})

it('reports a failed WhatsApp hook as one plain message', () => {
  for (const code of ['sms_send_failed', 'hook_timeout', 'unexpected_failure']) {
    expect(authMessage({ code, message: 'Error sending sms: http_code 500', status: 500 })).toBe(MESSAGES.sendFailed)
  }
  expect(MESSAGES.sendFailed).toBe("Couldn't send the WhatsApp code right now. Please try again in a moment.")
})
