// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordField } from './Field'

afterEach(cleanup)

it('shows and hides the password without submitting the form or leaving the field', async () => {
  const onSubmit = vi.fn((e: SubmitEvent) => e.preventDefault())
  const user = userEvent.setup()
  render(<form onSubmit={(e) => onSubmit(e.nativeEvent as SubmitEvent)}><PasswordField label="Password" defaultValue="kite-bird-92" /></form>)
  const input = screen.getByLabelText('Password')
  const toggle = screen.getByRole('button', { name: 'Show password' })
  expect(input).toHaveAttribute('type', 'password')
  expect(toggle).toHaveAttribute('type', 'button')
  expect(toggle).toHaveAttribute('aria-pressed', 'false')

  await user.click(input)
  await user.click(toggle)
  expect(input).toHaveAttribute('type', 'text')
  expect(input).toHaveValue('kite-bird-92')
  expect(input).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')

  await user.click(screen.getByRole('button', { name: 'Hide password' }))
  expect(input).toHaveAttribute('type', 'password')
  expect(onSubmit).not.toHaveBeenCalled()
})

it('works from the keyboard and allows paste', async () => {
  const user = userEvent.setup()
  render(<PasswordField label="Password" />)
  const input = screen.getByLabelText('Password')
  await user.click(input)
  await user.paste('pasted-secret')
  expect(input).toHaveValue('pasted-secret')
  await user.tab()
  expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(input).toHaveAttribute('type', 'text')
})

it('ties an error to the field so screen readers read it', () => {
  render(<PasswordField label="Password" error="Choose a stronger password." />)
  const input = screen.getByLabelText('Password')
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveAccessibleDescription('Choose a stronger password.')
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a stronger password.')
})
