import { expect, it } from 'vitest'
import { CONSENT_VERSION } from './session'

// public.accept_consent (0002) only takes a plain date; anything else leaves every parent stuck on the consent screen.
it('consent version is a date the database accepts', () => {
  expect(CONSENT_VERSION).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
})
