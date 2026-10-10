import { expect, it } from 'vitest'
import { authMessage, MESSAGES, passwordMessage, wrongPassword } from './messages'

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

it('shows the send-sms hook limit message as too many attempts', () => {
  expect(authMessage({ code: 'sms_send_failed', message: 'Error sending sms: rate_limited: Too many attempts. Please wait a moment and try again.', status: 429 })).toBe(MESSAGES.tooMany)
})

it('gives one neutral answer for a wrong password, a lock and email sign-in being off (all one Invalid login credentials), and names only an expired temporary password', () => {
  const neutral = passwordMessage({ code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 })
  expect(neutral).toMatch(/don't match, or email sign-in is paused/)
  // a locked account and email sign-in being off reach the app as the same "Invalid login credentials"
  expect(passwordMessage({ message: 'Invalid login credentials', status: 400 })).toBe(neutral)
  expect(passwordMessage({ code: 'email_not_confirmed' })).toBe(neutral)
  const expired = passwordMessage({ message: 'temporary_expired: This temporary password has expired. Ask the school for a new one.' })
  expect(expired).not.toBe(neutral)
  expect(expired).toMatch(/temporary password has expired/)
  expect(passwordMessage({ message: 'TypeError: Failed to fetch' })).toBe(MESSAGES.offline)
})

it('tells a refused email and password from a network failure', () => {
  expect(wrongPassword({ code: 'invalid_credentials' })).toBe(true)
  expect(wrongPassword({ message: 'Invalid login credentials' })).toBe(true)
  expect(wrongPassword({ message: 'Failed to fetch' })).toBe(false)
})
