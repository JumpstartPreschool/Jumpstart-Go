// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../ui/Toast'
import type { Programme } from '../../domain/programme'
import type { Trip } from './api'

// jsdom has no <dialog> methods; the app's sheets use showModal().
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open') }

const api = vi.hoisted(() => ({ runningLate: vi.fn() }))
vi.mock('./api', async (real) => ({ ...(await real<typeof import('./api')>()), runningLate: api.runningLate }))
const { LateSheet } = await import('./TripSheets')

// 1:00 PM in India; the school has the pickup at 1:10 PM.
const NOW = Date.parse('2026-10-05T07:30:00Z')
const programme: Programme = { name: 'Nursery', weekdays: [1, 2, 3, 4, 5], saturdayRule: 'every', term: null, hours: { from: 540, to: 1140 }, windows: { dropoff: { from: 525, to: 555 }, pickup: { from: 765, to: 795 } } }
const trip = { id: 't1', child_id: 'c', direction: 'pickup', status: 'en_route', arrive_at: '2026-10-05T07:40:00Z' } as Trip

function show() {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(<ToastProvider><LateSheet open onClose={onClose} trip={trip} first="Aarav" programme={programme} nowMs={NOW} /></ToastProvider>)
  return { user, onClose }
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
  const { user, onClose } = show()
  await user.click(screen.getByRole('radio', { name: new RegExp(`\\+${n}\\s*min`) }))
  await user.click(screen.getByRole('button', { name: 'Tell the school' }))
  await waitFor(() => expect(api.runningLate).toHaveBeenCalledWith('t1', { minutes: n }, ''))
  expect(await screen.findByText(new RegExp(`The school knows you're running late. New arrival: about 1:${10 + n} PM.`))).toBeInTheDocument()
  expect(onClose).toHaveBeenCalled()
})

it('sends a custom later time and an optional note, without asking for a reason', async () => {
  const { user } = show()
  await user.click(screen.getByRole('radio', { name: /Custom time/ }))
  expect(screen.getByText('Expected arrival')).toBeInTheDocument()
  await user.type(screen.getByLabelText('Add a note (optional)'), 'Traffic near school')
  // Past the pickup window: shown as guidance, never a blocker.
  expect(screen.getByText(/after Aarav's usual pickup time. That's fine/)).toBeInTheDocument()
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
