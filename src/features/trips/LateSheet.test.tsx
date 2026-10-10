// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../ui/Toast'
import type { Trip } from './api'

// jsdom has no <dialog> methods; the app's sheets use showModal().
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open') }

// The real client needs the project's address, which CI doesn't have; LateSheet only calls runningLate, mocked below.
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const api = vi.hoisted(() => ({ runningLate: vi.fn() }))
vi.mock('./api', async (real) => ({ ...(await real<typeof import('./api')>()), runningLate: api.runningLate }))
const { LateSheet } = await import('./TripSheets')

// 1:00 PM in India; the school has the pickup at 1:10 PM.
const NOW = Date.parse('2026-10-05T07:30:00Z')
const trip = { id: 't1', child_id: 'c', direction: 'pickup', status: 'en_route', arrive_at: '2026-10-05T07:40:00Z' } as Trip

function show() {
  const user = userEvent.setup()
  const onClose = vi.fn()
  const onChanged = vi.fn()
  render(<ToastProvider><LateSheet open onClose={onClose} onChanged={onChanged} trip={trip} nowMs={NOW} /></ToastProvider>)
  return { user, onClose, onChanged }
}
beforeEach(() => { api.runningLate.mockImplementation(async (_id, change) => ({ ...trip, arrive_at: 'minutes' in change ? new Date(Date.parse(trip.arrive_at) + change.minutes * 60_000).toISOString() : change.at.toISOString() })) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('offers +5, +10 and +15 on the time the school has, and Custom time', () => {
  show()
  expect(screen.getByRole('heading', { name: 'Running late?' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /\+5\s*min\s*about 1:15 PM/ })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /\+10\s*min\s*about 1:20 PM/ })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /\+15\s*min\s*about 1:25 PM/ })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /Custom time/ })).toBeInTheDocument()
  expect(screen.getAllByRole('radio')).toHaveLength(4)
})

it.each([5, 10, 15] as const)('sends +%i minutes and confirms the new time', async (n) => {
  const { user, onClose, onChanged } = show()
  await user.click(screen.getByRole('radio', { name: new RegExp(`\\+${n}\\s*min`) }))
  await user.click(screen.getByRole('button', { name: 'Tell the school' }))
  await waitFor(() => expect(api.runningLate).toHaveBeenCalledWith('t1', { minutes: n }, '', trip.arrive_at))
  expect(await screen.findByText(new RegExp(`The school knows you're running late. New arrival: about 1:${10 + n} PM.`))).toBeInTheDocument()
  expect(onClose).toHaveBeenCalled()
  expect(onChanged).toHaveBeenCalled()
})

it('sends a custom later time and an optional note, without asking for a reason', async () => {
  const { user } = show()
  await user.click(screen.getByRole('radio', { name: /Custom time/ }))
  expect(screen.getByText('Expected arrival')).toBeInTheDocument()
  await user.type(screen.getByLabelText('Add a note (optional)'), 'Traffic near school')
  // Any time is fine (D56): the new arrival is confirmed, never compared with a window.
  expect(screen.getByText(/New arrival: about 1:30 PM/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Tell the school' }))
  await waitFor(() => expect(api.runningLate).toHaveBeenCalledTimes(1))
  const [, change, note] = api.runningLate.mock.calls[0]!
  expect(note).toBe('Traffic near school')
  // The first custom time at least 20 minutes after 1:10 PM: 1:30 PM.
  expect((change as { at: Date }).at.toISOString()).toBe('2026-10-05T08:00:00.000Z')
})

it("shows the server's reason when it refuses (a finished trip, say)", async () => {
  api.runningLate.mockRejectedValueOnce({ code: 'P0001', message: 'trip_closed: This pickup has already finished.' })
  const { user, onClose } = show()
  await user.click(screen.getByRole('button', { name: 'Tell the school' }))
  expect(await screen.findByText(/already finished/)).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
})

it('when the time has moved since the parent looked, says so, reloads the trip and does not close', async () => {
  api.runningLate.mockRejectedValueOnce({ code: 'P0001', message: "stale: The time changed. Here's the new time." })
  const { user, onClose, onChanged } = show()
  await user.click(screen.getByRole('button', { name: 'Tell the school' }))
  expect(await screen.findByText("The time changed. Here's the new time.")).toBeInTheDocument()
  expect(onChanged).toHaveBeenCalledTimes(1)
  expect(onClose).not.toHaveBeenCalled()
})

it('says the same arrival minute as the parent card when the time has seconds (no 1:10 on the card and 1:11 here)', () => {
  const at = { ...trip, arrive_at: '2026-10-05T07:40:30Z' } as Trip
  render(<ToastProvider><LateSheet open onClose={() => {}} trip={at} nowMs={NOW + 10_000} /></ToastProvider>)
  expect(screen.getByText(/The school has about 1:10 PM/)).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /\+5\s*min\s*about 1:15 PM/ })).toBeInTheDocument()
})
