import { expect, it } from 'vitest'
import { CONSENT_VERSION } from './session'

// public.accept_consent (0002) only takes a plain date; anything else leaves every parent stuck on the consent screen.
it('consent version is a date the database accepts', () => {
  expect(CONSENT_VERSION).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
})

// An expired or refused pass is renewed and asked again; any other failure (offline) is retried, never signed out.
it('tells a refused sign-in pass from a network failure', async () => {
  const { isAuthError } = await import('./session')
  expect(isAuthError({ code: 'PGRST301', message: 'JWT expired' })).toBe(true)
  expect(isAuthError({ code: 'PGRST303', message: 'JWT claim' })).toBe(true)
  expect(isAuthError({ message: 'TypeError: Failed to fetch' })).toBe(false)
  expect(isAuthError(null)).toBe(false)
})
