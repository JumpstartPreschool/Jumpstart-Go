// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { ToastProvider } from '../../ui/Toast'

const auth = vi.hoisted(() => ({ updateUser: vi.fn(), signOut: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { updateUser: auth.updateUser, signOut: auth.signOut } } }))

// The session provider, reduced to what these screens read: who is signed in, and refresh and sign-out.
const session = vi.hoisted(() => ({ state: null as unknown, refresh: vi.fn(), signOut: vi.fn() }))
vi.mock('./session', async (original) => ({
  ...(await original<typeof import('./session')>()),
  useSession: () => ({ state: session.state, refresh: session.refresh, signOut: session.signOut }),
}))

import { SetPasswordScreen } from './SetPasswordScreen'
import { AreaRoute } from './AreaRoute'
import { passwordStep, CONSENT_VERSION, type Me } from './session'

const EMAIL = 'priya@example.com'

function openScreen(intent: 'first' | 'reset') {
  const user = userEvent.setup()
  render(<MemoryRouter><ToastProvider><SetPasswordScreen intent={intent} email={EMAIL} /></ToastProvider></MemoryRouter>)
  return user
}

async function fill(user: ReturnType<typeof userEvent.setup>, password: string, confirm = password) {
  await user.type(screen.getByLabelText(/^(New password|Password)$/), password)
  if (confirm) await user.type(screen.getByLabelText('Confirm password'), confirm)
}

beforeEach(() => {
  sessionStorage.clear()
  auth.updateUser.mockResolvedValue({ data: {}, error: null })
  auth.signOut.mockResolvedValue({ error: null })
  session.refresh.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('creating or changing a password', () => {
  it('saves a first password once, keeps other devices signed in, and moves on', async () => {
    passwordStep.ask('first')
    const user = openScreen('first')
    expect(screen.getByRole('heading', { name: 'Create your password' })).toBeInTheDocument()
    await fill(user, 'Kite-bird-92')
    await user.click(screen.getByRole('button', { name: 'Create password' }))
    await waitFor(() => expect(session.refresh).toHaveBeenCalledTimes(1))
    expect(auth.updateUser).toHaveBeenCalledTimes(1)
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'Kite-bird-92' })
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(passwordStep.pending()).toBeNull()
  })

  it('after a reset, signs out every other device', async () => {
    passwordStep.ask('reset')
    const user = openScreen('reset')
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    await fill(user, 'Kite-bird-92')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' }))
    expect(passwordStep.pending()).toBeNull()
  })

  it.each([
    ['short1', /at least 8/],
    ['password123', /too easy/],
    ['priya2026!', /email/],
  ])('refuses %s before asking the server', async (password, message) => {
    const user = openScreen('first')
    await fill(user, password)
    await user.click(screen.getByRole('button', { name: 'Create password' }))
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('asks for the confirmation, then for a match', async () => {
    const user = openScreen('first')
    await fill(user, 'Kite-bird-92', '')
    await user.click(screen.getByRole('button', { name: 'Create password' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Type the password again')
    await user.type(screen.getByLabelText('Confirm password'), 'Kite-bird-93')
    await user.click(screen.getByRole('button', { name: 'Create password' }))
    expect(screen.getByRole('alert')).toHaveTextContent("Passwords don't match.")
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it("shows the server's weak-password refusal in plain words, on the field", async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: { code: 'weak_password', message: 'Password is known to be weak and easy to guess' } })
    const user = openScreen('first')
    await fill(user, 'Kite-bird-92')
    await user.click(screen.getByRole('button', { name: 'Create password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a stronger password.')
    expect(screen.queryByText(/known to be weak/)).toBeNull()
    expect(session.refresh).not.toHaveBeenCalled()
  })

  it('saves once however many times the button is pressed', async () => {
    let finish: (v: unknown) => void = () => {}
    auth.updateUser.mockReturnValue(new Promise((r) => { finish = r }))
    const user = openScreen('first')
    await fill(user, 'Kite-bird-92')
    const button = screen.getByRole('button', { name: 'Create password' })
    await user.click(button)
    await user.type(screen.getByLabelText('Confirm password'), '{Enter}')
    const form = button.closest('form')!
    act(() => { form.requestSubmit(); form.requestSubmit() })
    expect(auth.updateUser).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Creating password…' })).toHaveAttribute('aria-busy', 'true')
    finish({ data: {}, error: null })
    await waitFor(() => expect(session.refresh).toHaveBeenCalled())
  })

  it('gives password managers the account email and new-password fields', () => {
    const { container } = render(<MemoryRouter><SetPasswordScreen intent="first" email={EMAIL} /></MemoryRouter>)
    expect(container.querySelector('input[autocomplete="username"]')).toHaveValue(EMAIL)
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('autocomplete', 'new-password')
  })

  it('shows strength in words, not only colour', async () => {
    const user = openScreen('first')
    await user.type(screen.getByLabelText('Password'), 'kitebird9')
    expect(screen.getByText('Okay.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Password'), '-River-2')
    expect(screen.getByText('Strong.')).toBeInTheDocument()
  })
})

describe('when AreaRoute asks for a password', () => {
  const me = (has_password: Me['has_password']): Me => ({
    profile_id: 'p1', full_name: 'Priya Shah', active: true, consent_version: CONSENT_VERSION, roles: [], children: 1, has_password,
  })
  function signedIn(m: Me) {
    session.state = { status: 'signed-in', session: { user: { id: 'u1', email: EMAIL } } as unknown as Session, me: m, error: null }
    render(<MemoryRouter initialEntries={['/parent']}><ToastProvider><AreaRoute area="parent"><p>Parent home</p></AreaRoute></ToastProvider></MemoryRouter>)
  }

  it.each([
    ['first sign-in, no password yet', 'first', false, true],
    ['first sign-in, before migration 0033', 'first', undefined, true],
    ['code sign-in, password already set', 'first', true, false],
    ['forgotten password', 'reset', true, true],
    ['signed in earlier with a code, never set a password', null, false, true],
    ['already signed in with a password', null, true, false],
    ['database cannot tell, no code just used', null, null, false],
  ] as const)('%s', (_, step, has, asks) => {
    if (step) passwordStep.ask(step)
    signedIn(me(has))
    expect(!!screen.queryByRole('heading', { name: /Create your password|Choose a new password/ })).toBe(asks)
    expect(!!screen.queryByText('Parent home')).toBe(!asks)
  })

  it('never opens it for someone whose access is turned off', () => {
    passwordStep.ask('reset')
    signedIn({ ...me(true), active: false })
    expect(screen.getByRole('heading', { name: 'Access turned off' })).toBeInTheDocument()
  })
})
