// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '../../ui/Toast'

// The Supabase client, recorded. Every call the sign-in screen can make is here, so a test fails if it makes another.
const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: auth.rpc, auth: { signInWithOtp: auth.signInWithOtp, verifyOtp: auth.verifyOtp } },
}))

/** A fresh copy of the screen: the invitation number is read once per module load, so each test starts clean. */
async function open(hash = '') {
  history.replaceState(null, '', `/${hash}`)
  vi.resetModules()
  const { LoginScreen } = await import('./LoginScreen')
  const user = userEvent.setup()
  render(<MemoryRouter><ToastProvider><LoginScreen /></ToastProvider></MemoryRouter>)
  return user
}

async function askForCode(user: ReturnType<typeof userEvent.setup>, number = '98765 43210') {
  await user.type(screen.getByLabelText('Mobile number'), number)
  await user.click(screen.getByRole('button', { name: /Send code on WhatsApp/ }))
}

beforeEach(() => {
  sessionStorage.clear()
  auth.signInWithOtp.mockResolvedValue({ data: {}, error: null })
  auth.verifyOtp.mockResolvedValue({ data: {}, error: null })
  auth.rpc.mockResolvedValue({ data: true, error: null })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('asks only for a mobile number, with the phone keyboard and autofill hints', async () => {
  await open()
  const field = screen.getByLabelText('Mobile number')
  expect(field).toHaveAttribute('type', 'tel')
  expect(field).toHaveAttribute('autocomplete', 'tel')
  expect(field).toHaveAttribute('placeholder', '98765 43210')
  expect(screen.getByText('Outside India? Start with + and the country code.')).toBeInTheDocument()
  expect(screen.queryByLabelText(/email|password/i)).toBeNull()
  expect(screen.queryByText(/password/i)).toBeNull()
})

it('sends a registered number its code on WhatsApp, as a full international number', async () => {
  const user = await open()
  await askForCode(user)
  expect(await screen.findByRole('heading', { name: 'Check WhatsApp' })).toBeInTheDocument()
  expect(auth.rpc).toHaveBeenCalledWith('phone_login_allowed', { p_phone: '+919876543210' })
  expect(auth.signInWithOtp).toHaveBeenCalledWith({ phone: '+919876543210', options: { shouldCreateUser: true } })
  expect(screen.getByRole('button', { name: /Change number, now \+91 98765 43210/ })).toBeInTheDocument()
})

it('takes numbers from other countries', async () => {
  const user = await open()
  await askForCode(user, '+971 50 123 4567')
  await screen.findByRole('heading', { name: 'Check WhatsApp' })
  expect(auth.signInWithOtp).toHaveBeenCalledWith({ phone: '+971501234567', options: { shouldCreateUser: true } })
})

it('answers the same way for an unregistered number, and sends it nothing', async () => {
  auth.rpc.mockResolvedValue({ data: false, error: null })
  const user = await open()
  await askForCode(user, '98765 11111')
  expect(await screen.findByRole('heading', { name: 'Check WhatsApp' })).toBeInTheDocument()
  expect(screen.getByText(/If this number is registered with Jumpstart/)).toBeInTheDocument()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
})

it('checks the number before calling the server', async () => {
  const user = await open()
  await user.type(screen.getByLabelText('Mobile number'), '12345')
  await user.click(screen.getByRole('button', { name: /Send code on WhatsApp/ }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a mobile number')
  expect(auth.rpc).not.toHaveBeenCalled()
})

it('goes on to the code already sent when asked again within the minute', async () => {
  auth.signInWithOtp.mockResolvedValue({ data: {}, error: { status: 429, message: 'For security purposes, you can only request this after 42 seconds.' } })
  const user = await open()
  await askForCode(user)
  expect(await screen.findByRole('heading', { name: 'Check WhatsApp' })).toBeInTheDocument()
})

it('says the code could not be sent when the WhatsApp hook fails, without the server text', async () => {
  auth.signInWithOtp.mockResolvedValue({ data: {}, error: { status: 500, code: 'unexpected_failure', message: 'Error sending sms: hook returned 503' } })
  const user = await open()
  await askForCode(user)
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't send the WhatsApp code right now. Please try again in a moment.")
  expect(screen.queryByText(/hook returned/)).toBeNull()
  expect(screen.getByRole('heading', { name: 'Sign in to Jumpstart Go' })).toBeInTheDocument()
})

it('stops at "too many" once the hourly code limit is reached', async () => {
  auth.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'rate_limited: login:+919876543210' } })
  const user = await open()
  await askForCode(user)
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
  expect(screen.queryByText(/login:/)).toBeNull()
  expect(auth.signInWithOtp).not.toHaveBeenCalled()
})

it('takes a pasted code with spaces and checks it once as an sms code', async () => {
  const user = await open()
  await askForCode(user)
  const code = await screen.findByLabelText('6-digit code')
  // A real, visible input: pasting works, and what was pasted is plain text in it.
  expect(code).toHaveAttribute('autocomplete', 'one-time-code')
  await user.click(code)
  await user.paste('12 34-56')
  expect(code).toHaveValue('123456')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(auth.verifyOtp).toHaveBeenCalledTimes(1))
  expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: '+919876543210', token: '123456', type: 'sms' })
  // Asked before the session arrives, so the area chooser is ready.
  expect(sessionStorage.getItem('jumpstart.chooseArea')).toBe('1')
})

it('clears the code and the area chooser when a code is wrong or expired', async () => {
  auth.verifyOtp.mockResolvedValue({ data: {}, error: { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' } })
  const user = await open()
  await askForCode(user)
  await user.type(await screen.findByLabelText('6-digit code'), '000000')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("This code isn't right or has expired")
  expect(screen.getByLabelText('6-digit code')).toHaveValue('')
  expect(sessionStorage.getItem('jumpstart.chooseArea')).toBeNull()
})

it('sends one request however many times the button is pressed', async () => {
  let finish: (v: unknown) => void = () => {}
  auth.rpc.mockReturnValue(new Promise((r) => { finish = r }))
  const user = await open()
  await user.type(screen.getByLabelText('Mobile number'), '98765 43210')
  const form = screen.getByLabelText('Mobile number').closest('form')!
  // Two submits in the same tick, before React has rendered the busy state: only the in-flight guard stops the second.
  act(() => { form.requestSubmit(); form.requestSubmit() })
  expect(auth.rpc).toHaveBeenCalledTimes(1)
  finish({ data: true, error: null })
  await screen.findByRole('heading', { name: 'Check WhatsApp' })
})

it('lets a new code be asked for only after the 60 second wait, and Change goes back with the number kept', async () => {
  const user = await open()
  await askForCode(user)
  await screen.findByRole('heading', { name: 'Check WhatsApp' })
  expect(screen.getByRole('button', { name: /Send a new code in \d+s/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: /Send a new code in 6\ds/ })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Change number/ }))
  expect(screen.getByLabelText('Mobile number')).toHaveValue('+91 98765 43210')
})

it('enables Send a new code when the countdown ends, and sends to the same number', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  history.replaceState(null, '', '/')
  vi.resetModules()
  const { LoginScreen } = await import('./LoginScreen')
  render(<MemoryRouter><ToastProvider><LoginScreen /></ToastProvider></MemoryRouter>)
  await askForCode(user)
  await screen.findByRole('heading', { name: 'Check WhatsApp' })
  for (let i = 0; i < 60; i++) {
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  }
  const again = screen.getByRole('button', { name: 'Send a new code' })
  expect(again).toBeEnabled()
  await user.click(again)
  await waitFor(() => expect(auth.signInWithOtp).toHaveBeenCalledTimes(2))
  expect(auth.signInWithOtp).toHaveBeenLastCalledWith({ phone: '+919876543210', options: { shouldCreateUser: true } })
})

it('opens an invitation link with the number filled in, then clears it from the address', async () => {
  await open('#phone=%2B919220991947')
  expect(screen.getByLabelText('Mobile number')).toHaveValue('+91 92209 91947')
  expect(location.hash).toBe('')
})
