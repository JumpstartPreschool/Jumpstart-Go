import { expect, it } from 'vitest'
import { authMessage, MESSAGES } from './messages'

it('turns auth errors into plain words and never passes the server text through', () => {
  expect(authMessage({ code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 })).toBe(MESSAGES.credentials)
  expect(authMessage({ code: 'otp_expired', message: 'Token has expired or is invalid', status: 403 })).toBe(MESSAGES.code)
  expect(authMessage({ code: 'over_request_rate_limit', status: 429 })).toBe(MESSAGES.tooMany)
  expect(authMessage({ message: 'rate_limited: login:someone@example.com' })).toBe(MESSAGES.tooMany)
  expect(authMessage({ code: 'weak_password', message: 'Password should be at least 8 characters.' })).toBe(MESSAGES.weak)
  expect(authMessage({ code: 'same_password' })).toBe(MESSAGES.same)
  expect(authMessage({ code: 'reauthentication_needed' })).toBe(MESSAGES.again)
  expect(authMessage({ name: 'AuthRetryableFetchError', status: 0 })).toBe(MESSAGES.offline)
  expect(authMessage({ message: 'TypeError: Failed to fetch' })).toBe(MESSAGES.offline)
  expect(authMessage({ message: 'relation "auth.users" does not exist', code: '42P01' })).toBe(MESSAGES.unknown)
})
