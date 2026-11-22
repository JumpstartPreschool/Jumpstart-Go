// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TextField } from './Field'

afterEach(cleanup)

it('labels the input and describes it with the hint', () => {
  render(<TextField label="Mobile number" hint="Outside India? Start with + and the country code." type="tel" />)
  const input = screen.getByLabelText('Mobile number')
  expect(input).toHaveAccessibleDescription('Outside India? Start with + and the country code.')
  expect(input).not.toHaveAttribute('aria-invalid')
})

it('announces an error and marks the input invalid, in place of the hint', () => {
  render(<TextField label="Mobile number" hint="A hint" error="Enter a mobile number." />)
  const input = screen.getByLabelText('Mobile number')
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveAccessibleDescription('Enter a mobile number.')
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a mobile number.')
  expect(screen.queryByText('A hint')).toBeNull()
})
