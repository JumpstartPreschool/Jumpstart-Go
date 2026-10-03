// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { ToastProvider } from '../../ui/Toast'

const auth = vi.hoisted(() => ({ updateUser: vi.fn(), signOut: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { updateUser: auth.updateUser } } }))
vi.mock('./session', async (real) => ({ ...(await real<typeof import('./session')>()), useSession: () => ({ signOut: auth.signOut }) }))

const { ChoosePasswordScreen } = await import('./ChoosePasswordScreen')
const { signedInWithPassword } = await import('./session')
const me = { profile_id: 'p', full_name: 'Meera Shah', active: true, consent_version: null, roles: [], children: 1, email_sign_in: 'pattern' as const }

function show() {
  const user = userEvent.setup()
  render(<MemoryRouter><ToastProvider><ChoosePasswordScreen me={me} /></ToastProvider></MemoryRouter>)
  return user
}
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('asks for a new password twice and saves it', async () => {
  auth.updateUser.mockResolvedValue({ data: {}, error: null })
  const user = show()
  expect(screen.getByRole('heading', { name: 'Choose your own password' })).toBeInTheDocument()
  expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password')
  await user.type(screen.getByLabelText('New password'), 'garden-swing-42')
  await user.type(screen.getByLabelText('Type it again'), 'garden-swing-42')
  await user.click(screen.getByRole('button', { name: 'Save and continue' }))
  await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: 'garden-swing-42' }))
})

it('refuses a short or mismatched password before calling the server', async () => {
  const user = show()
  await user.type(screen.getByLabelText('New password'), 'short')
  await user.click(screen.getByRole('button', { name: 'Save and continue' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Use at least 8 characters.')
  await user.type(screen.getByLabelText('New password'), '-and-longer')
  await user.type(screen.getByLabelText('Type it again'), 'something-else')
  await user.click(screen.getByRole('button', { name: 'Save and continue' }))
  expect(screen.getByRole('alert')).toHaveTextContent("The two passwords don't match.")
  expect(auth.updateUser).not.toHaveBeenCalled()
})

it('explains a refusal in words', async () => {
  auth.updateUser.mockResolvedValue({ data: {}, error: { code: 'same_password', status: 422, message: 'New password should be different from the old password.' } })
  const user = show()
  await user.type(screen.getByLabelText('New password'), 'Meera@gmail#2026')
  await user.type(screen.getByLabelText('Type it again'), 'Meera@gmail#2026')
  await user.click(screen.getByRole('button', { name: 'Save and continue' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose a password different from the one the school gave you.')
})

it('tells a password sign-in from a WhatsApp code sign-in', () => {
  const token = (amr: unknown) => `x.${btoa(JSON.stringify({ amr })).replace(/=+$/, '')}.y`
  expect(signedInWithPassword({ access_token: token([{ method: 'password', timestamp: 1 }]) } as Session)).toBe(true)
  expect(signedInWithPassword({ access_token: token([{ method: 'otp', timestamp: 1 }]) } as Session)).toBe(false)
  expect(signedInWithPassword({ access_token: 'garbage' } as Session)).toBe(false)
})
