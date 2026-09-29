// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '../../ui/Toast'

// The Supabase client, recorded. Every call the sign-in screen can make is here, so a test fails if it makes another.
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: auth.rpc,
    auth: { signInWithPassword: auth.signInWithPassword, signInWithOtp: auth.signInWithOtp, verifyOtp: auth.verifyOtp },
  },
}))

/** A fresh copy of the screen: the invitation email is read once per module load, so each test starts clean. */
async function open(hash = '') {
  history.replaceState(null, '', `/${hash}`)
  vi.resetModules()
  const { LoginScreen } = await import('./LoginScreen')
  const user = userEvent.setup()
  render(<MemoryRouter><ToastProvider><LoginScreen /></ToastProvider></MemoryRouter>)
  return user
}

const pending = () => sessionStorage.getItem('jumpstart.passwordStep')

beforeEach(() => {
  sessionStorage.clear()
  auth.signInWithPassword.mockResolvedValue({ data: {}, error: null })
  auth.signInWithOtp.mockResolvedValue({ data: {}, error: null })
  auth.verifyOtp.mockResolvedValue({ data: {}, error: null })
  auth.rpc.mockResolvedValue({ data: true, error: null })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('signs in with email and password, and sends no email', async () => {
  const user = await open()
  await user.type(screen.getByLabelText('Email'), '  Priya@Example.com ')
  await user.type(screen.getByLabelText('Password'), 'kite-bird-92')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledTimes(1))
  expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'priya@example.com', password: 'kite-bird-92' })
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  expect(auth.rpc).not.toHaveBeenCalled()
  expect(pending()).toBeNull()
})

it('sends one request however many times Sign in is pressed', async () => {
  let finish: (v: unknown) => void = () => {}
  auth.signInWithPassword.mockReturnValue(new Promise((r) => { finish = r }))
  const user = await open()
  await user.type(screen.getByLabelText('Email'), 'priya@example.com')
  await user.type(screen.getByLabelText('Password'), 'kite-bird-92')
  const button = screen.getByRole('button', { name: 'Sign in' })
  await user.click(button)
  // Enter in the field while the first request is still out: the case the button's own loading state can't stop.
  await user.type(screen.getByLabelText('Password'), '{Enter}')
  // Two submits in the same tick, before React has rendered the busy state: only the in-flight guard stops the second.
  const form = screen.getByLabelText('Password').closest('form')!
  act(() => { form.requestSubmit(); form.requestSubmit() })
  expect(auth.signInWithPassword).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Signing in…' })).toHaveAttribute('aria-busy', 'true')
  finish({ data: {}, error: null })
  await screen.findByRole('button', { name: 'Sign in' })
})

it('says only "incorrect" for a wrong password, never the server text', async () => {
  auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } })
  const user = await open()
  await user.type(screen.getByLabelText('Email'), 'priya@example.com')
  await user.type(screen.getByLabelText('Password'), 'wrong-pass')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
  expect(screen.queryByText(/Invalid login credentials/)).toBeNull()
  // The area chooser was asked for before the attempt; a failed attempt takes that back.
  expect(sessionStorage.getItem('jumpstart.chooseArea')).toBeNull()
})

it('recovers from a network failure with a plain message', async () => {
  auth.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'))
  const user = await open()
  await user.type(screen.getByLabelText('Email'), 'priya@example.com')
  await user.type(screen.getByLabelText('Password'), 'kite-bird-92')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't connect right now")
  expect(screen.getByRole('button', { name: 'Sign in' })).not.toHaveAttribute('aria-busy')
})

it('checks the email and password before calling the server', async () => {
  const user = await open()
  await user.type(screen.getByLabelText('Email'), 'not-an-email')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a full email address')
  await user.clear(screen.getByLabelText('Email'))
  await user.type(screen.getByLabelText('Email'), 'priya@example.com')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter your password.')
  expect(auth.signInWithPassword).not.toHaveBeenCalled()
})

it('uses the autocomplete tokens password managers and phones need', async () => {
  await open()
  expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
  expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
})

it('answers a code request the same way for an unregistered email, and sends it nothing', async () => {
  auth.rpc.mockResolvedValue({ data: false, error: null })
  const user = await open()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument()
  await user.type(screen.getByLabelText('Email'), 'stranger@example.com')
  await user.click(screen.getByRole('button', { name: /Email me a code/ }))
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  expect(screen.getByText(/If this email is registered with Jumpstart/)).toBeInTheDocument()
  expect(auth.rpc).toHaveBeenCalledWith('login_allowed', { p_email: 'stranger@example.com', p_purpose: 'reset' })
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
})

it('sends a registered email its code, on the same screen as everyone else', async () => {
  const user = await open()
  await user.click(screen.getByRole('button', { name: 'Get a sign-in code by email' }))
  expect(screen.getByRole('heading', { name: 'First time here?' })).toBeInTheDocument()
  await user.type(screen.getByLabelText('Email'), 'priya@example.com')
  await user.click(screen.getByRole('button', { name: /Email me a code/ }))
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'priya@example.com', options: { shouldCreateUser: true } })
  expect(screen.getByRole('button', { name: /Send a new code in \d+s/ })).toBeDisabled()
})

it('asks for a first-sign-in code only for accounts without a password, and points everyone else to a reset', async () => {
  auth.rpc.mockResolvedValue({ data: false, error: null })
  const user = await open()
  await user.click(screen.getByRole('button', { name: 'Get a sign-in code by email' }))
  await user.type(screen.getByLabelText('Email'), 'priya@example.com')
  await user.click(screen.getByRole('button', { name: /Email me a code/ }))
  expect(await screen.findByText(/registered and has no password yet/)).toBeInTheDocument()
  expect(auth.rpc).toHaveBeenCalledWith('login_allowed', { p_email: 'priya@example.com', p_purpose: 'first' })
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toHaveValue('priya@example.com')
})

it('still sends a code when the database has only the older check', async () => {
  auth.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }).mockResolvedValueOnce({ data: true, error: null })
  const user = await open()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'priya@example.com')
  await user.click(screen.getByRole('button', { name: /Email me a code/ }))
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  expect(auth.rpc).toHaveBeenLastCalledWith('login_allowed', { p_email: 'priya@example.com' })
  expect(auth.signInWithOtp).toHaveBeenCalledTimes(1)
})

it('goes on to the code already sent when asked again within the minute', async () => {
  auth.signInWithOtp.mockResolvedValue({ data: {}, error: { status: 429, message: 'For security purposes, you can only request this after 42 seconds.' } })
  const user = await open()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'priya@example.com')
  await user.click(screen.getByRole('button', { name: /Email me a code/ }))
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
})

it('stops at "too many" once the hourly code limit is reached', async () => {
  auth.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'rate_limited: login:priya@example.com' } })
  const user = await open()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'priya@example.com')
  await user.click(screen.getByRole('button', { name: /Email me a code/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
  expect(screen.queryByText(/login:priya/)).toBeNull()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
})

it('takes a pasted code with spaces, checks it once, and asks for a new password after a reset', async () => {
  const user = await open()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'priya@example.com')
  await user.click(screen.getByRole('button', { name: /Email me a code/ }))
  const code = await screen.findByLabelText('6-digit code')
  // A real, visible input: pasting works, and what was pasted is plain text in it.
  expect(code).toHaveAttribute('autocomplete', 'one-time-code')
  expect(code).not.toHaveClass('opacity-0')
  await user.click(code)
  await user.paste('12 34-56')
  expect(code).toHaveValue('123456')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(auth.verifyOtp).toHaveBeenCalledTimes(1))
  expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'priya@example.com', token: '123456', type: 'email' })
  expect(pending()).toBe('reset')
})

it('clears the code and the password step when a code is wrong or expired', async () => {
  auth.verifyOtp.mockResolvedValue({ data: {}, error: { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' } })
  const user = await open()
  await user.click(screen.getByRole('button', { name: 'Get a sign-in code by email' }))
  await user.type(screen.getByLabelText('Email'), 'priya@example.com')
  await user.click(screen.getByRole('button', { name: /Email me a code/ }))
  await user.type(await screen.findByLabelText('6-digit code'), '000000')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("This code isn't right or has expired")
  expect(screen.getByLabelText('6-digit code')).toHaveValue('')
  expect(pending()).toBeNull()
})

it('opens an invitation link on the first-time code step with the email filled in, then clears it from the address', async () => {
  await open('#email=Priya%40Example.com')
  expect(screen.getByRole('heading', { name: 'First time here?' })).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toHaveValue('priya@example.com')
  expect(location.hash).toBe('')
})
