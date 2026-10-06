// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { ToastProvider } from '../../ui/Toast'
import { DEFAULT_POLICY } from '../../../supabase/functions/_shared/passwordPattern'

const api = vi.hoisted(() => ({ invoke: vi.fn(), policy: vi.fn(), signOut: vi.fn(), refresh: vi.fn() }))
vi.mock('../../lib/supabase', () => ({
  supabase: { functions: { invoke: api.invoke }, from: () => ({ select: () => ({ single: api.policy }) }) },
}))
vi.mock('./session', async (real) => ({ ...(await real<typeof import('./session')>()), useSession: () => ({ signOut: api.signOut, refresh: api.refresh }) }))

const { ChoosePasswordScreen } = await import('./ChoosePasswordScreen')
const { signedInWithPassword } = await import('./session')
const me = { profile_id: 'p', full_name: 'Meera Shah', active: true, consent_version: null, roles: [], children: 1, email_sign_in: 'temporary' as const }

function show() {
  const user = userEvent.setup()
  render(<MemoryRouter><ToastProvider><ChoosePasswordScreen me={me} /></ToastProvider></MemoryRouter>)
  return user
}
beforeEach(() => { api.policy.mockResolvedValue({ data: DEFAULT_POLICY, error: null }); api.refresh.mockResolvedValue(undefined) })
afterEach(() => { cleanup(); vi.resetAllMocks() })
/** What supabase-js gives back when the function answers with an error status: the response is on error.context. */
const failed = (status: number, body: unknown) => ({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => body } } })
async function fill(user: ReturnType<typeof userEvent.setup>, a: string, b = a) {
  await user.type(screen.getByLabelText('New password'), a)
  await user.type(screen.getByLabelText('Type it again'), b)
  await user.click(screen.getByRole('button', { name: 'Save and continue' }))
}

it('shows the school\'s rules and asks for a new password twice', async () => {
  api.policy.mockResolvedValue({ data: { ...DEFAULT_POLICY, min_length: 14, require_special: false }, error: null })
  show()
  expect(screen.getByRole('heading', { name: 'Choose your own password' })).toBeInTheDocument()
  expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password')
  expect(await screen.findByText('At least 14 characters, with a capital, a small letter and a digit.')).toBeInTheDocument()
})

it('sends the password to the password-change function, never to Supabase Auth directly, then reloads who they are', async () => {
  api.invoke.mockResolvedValue({ data: { ok: true }, error: null })
  const user = show()
  await fill(user, 'Garden-Swing-42')
  await waitFor(() => expect(api.invoke).toHaveBeenCalledWith('password-change', { body: { password: 'Garden-Swing-42' } }))
  await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1))
})

it('refuses a password that breaks the rules, or does not match, before calling the server', async () => {
  const user = show()
  await user.type(screen.getByLabelText('New password'), 'short')
  await user.click(screen.getByRole('button', { name: 'Save and continue' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Use at least 10 characters.')
  await user.clear(screen.getByLabelText('New password'))
  await user.type(screen.getByLabelText('New password'), 'garden-swing-42')
  await user.click(screen.getByRole('button', { name: 'Save and continue' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Add a capital letter.')
  await user.clear(screen.getByLabelText('New password'))
  await user.type(screen.getByLabelText('New password'), 'Garden-Swing-42')
  await user.type(screen.getByLabelText('Type it again'), 'something-else')
  await user.click(screen.getByRole('button', { name: 'Save and continue' }))
  expect(screen.getByRole('alert')).toHaveTextContent("The two passwords don't match.")
  expect(api.invoke).not.toHaveBeenCalled()
})

it('shows the reason the function gave, and stays on the screen', async () => {
  api.invoke.mockResolvedValue(failed(400, { error: 'You used this password recently. Choose a different one.' }))
  const user = show()
  await fill(user, 'Meera@gmail#2026')
  expect(await screen.findByRole('alert')).toHaveTextContent('You used this password recently. Choose a different one.')
  expect(api.refresh).not.toHaveBeenCalled()
})

it('explains a failure that has no readable body in plain words, never the server text', async () => {
  api.invoke.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })
  const user = show()
  await fill(user, 'Meera@gmail#2026')
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't connect right now. Please check your connection and try again.")
  expect(screen.getByRole('alert')).not.toHaveTextContent('TypeError')
})

it('tells a password sign-in from a WhatsApp code sign-in', () => {
  const token = (amr: unknown) => `x.${btoa(JSON.stringify({ amr })).replace(/=+$/, '')}.y`
  expect(signedInWithPassword({ access_token: token([{ method: 'password', timestamp: 1 }]) } as Session)).toBe(true)
  expect(signedInWithPassword({ access_token: token([{ method: 'otp', timestamp: 1 }]) } as Session)).toBe(false)
  expect(signedInWithPassword({ access_token: 'garbage' } as Session)).toBe(false)
})
