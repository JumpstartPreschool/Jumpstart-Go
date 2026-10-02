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

import { chooseArea, SessionProvider, useSession } from './session'

afterEach(cleanup)

function SignOut() {
  const { state, signOut } = useSession()
  return <button type="button" onClick={() => void signOut()}>{state.status}</button>
}

// A shared iPad: whoever signs in next must not land on the previous person's area chooser.
it('signing out clears the pending area chooser', async () => {
  chooseArea.ask()
  const user = userEvent.setup()
  render(<SessionProvider><SignOut /></SessionProvider>)
  await user.click(await screen.findByRole('button', { name: 'signed-out' }))
  expect(auth.signOut).toHaveBeenCalledTimes(1)
  expect(chooseArea.pending()).toBe(false)
})
