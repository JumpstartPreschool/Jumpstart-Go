// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../ui/Toast'

// As browsers do: close() fires the dialog's close event (jsdom has neither method).
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const { Register } = await import('./Register')
const { buildDoc } = await import('./exports/doc')
const { sampleReport } = await import('./exports/fixture')
afterEach(cleanup)

it('Correct this day opens the correction, and Cancel goes back to the day', async () => {
  const user = userEvent.setup()
  const doc = buildDoc({ data: sampleReport({ children: 3, from: '2026-10-05', to: '2026-10-06' }), reportId: 'T', generatedAt: '2026-10-06T10:00:00Z', scope: 'All' })
  render(<ToastProvider><Register doc={doc} canCorrect onChanged={() => {}} /></ToastProvider>)
  await user.click(screen.getAllByRole('row')[1]!)
  await user.click(screen.getByRole('button', { name: 'Correct this day' }))
  expect(screen.getByLabelText(/reason/i)).toBeVisible()
  await user.click(screen.getByRole('button', { name: /Cancel/ }))
  expect(screen.getByRole('button', { name: 'Correct this day' })).toBeInTheDocument()
})
