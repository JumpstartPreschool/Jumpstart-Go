// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const auth = vi.hoisted(() => ({
  getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
  signOut: vi.fn().mockResolvedValue({ error: null }),
}))
vi.mock('../../lib/supabase', () => ({ supabase: { auth, rpc: vi.fn() } }))

import { chooseArea, passwordStep, SessionProvider, useSession } from './session'

afterEach(cleanup)

function SignOut() {
  const { state, signOut } = useSession()
  return <button type="button" onClick={() => void signOut()}>{state.status}</button>
}

// A shared iPad: whoever signs in next must not land on the previous person's password step or area chooser.
it('signing out clears the pending password step and area chooser', async () => {
  passwordStep.ask('reset')
  chooseArea.ask()
  const user = userEvent.setup()
  render(<SessionProvider><SignOut /></SessionProvider>)
  await user.click(await screen.findByRole('button', { name: 'signed-out' }))
  expect(auth.signOut).toHaveBeenCalledTimes(1)
  expect(passwordStep.pending()).toBeNull()
  expect(chooseArea.pending()).toBe(false)
})
