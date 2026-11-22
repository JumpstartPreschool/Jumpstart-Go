// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Child, Directory } from './api'

// jsdom has no <dialog> methods; the app's sheets use showModal().
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open') }

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const api = vi.hoisted(() => ({ addGuardian: vi.fn(async () => {}) }))
vi.mock('./api', async (real) => ({ ...(await real<typeof import('./api')>()), addGuardian: api.addGuardian }))
const { AddGuardianSheet } = await import('./ChildForms')

const child: Child = { id: 'c1', full_name: 'Aarav Sharma', preferred_name: null, date_of_birth: '2022-01-01', class_id: 'k', programme_id: 'p', active: true }
const dir: Directory = {
  profiles: [{ id: 'g2', full_name: 'Sunita Rao', email: null, phone: '+919800000004', active: true, app_access: false, abroad: false, user_id: null }],
  roles: new Map(),
  children: [child, { ...child, id: 'c2', full_name: 'Diya Rao' }],
  guardianships: [{ child_id: 'c2', guardian_id: 'g2', relation: 'Grandmother', kind: 'family' }],
  classes: [], programmes: [], childProgrammes: [], coordinatorClasses: [], schedules: [],
}
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('stays busy until the page behind has reloaded, so a second tap never adds the person twice', async () => {
  const user = userEvent.setup()
  let finish!: () => void
  // The parent reloads the whole directory before closing the sheet: it takes a moment.
  const onSaved = vi.fn(() => new Promise<void>((r) => { finish = r }))
  render(<AddGuardianSheet open dir={dir} child={child} onClose={() => {}} onSaved={onSaved} />)
  await user.click(screen.getByRole('radio', { name: 'Mother' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.click(screen.getByText('Or link someone already here'))
  await user.click(screen.getByRole('button', { name: /Sunita Rao/ }))
  const add = screen.getByRole('button', { name: /Add mother/ })
  await user.click(add)
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  expect(add).toHaveAttribute('aria-busy', 'true')
  await user.click(add)
  await user.click(add)
  expect(api.addGuardian).toHaveBeenCalledTimes(1)
  finish()
  await waitFor(() => expect(add).not.toHaveAttribute('aria-busy'))
})
