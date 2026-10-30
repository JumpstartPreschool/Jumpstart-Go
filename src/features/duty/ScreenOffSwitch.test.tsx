// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScreenOffSwitch, screenOffSays } from './ScreenOffSwitch'

describe('announce when the screen is off', () => {
  afterEach(cleanup)
  it('promises a spoken announcement only where the device can really speak with the screen off', () => {
    expect(screenOffSays(true, 'android-app')).toMatch(/speaks every announcement aloud at full alarm volume/)
    expect(screenOffSays(true, 'apple')).toMatch(/cannot speak it aloud while locked/)
    expect(screenOffSays(true, 'web')).not.toMatch(/speaks/)
    for (const p of ['android-app', 'apple', 'web'] as const) expect(screenOffSays(false, p)).toMatch(/only while Jumpstart Go is open on screen/)
  })

  it('is a labelled switch that says its state and turns it the other way', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<ul><ScreenOffSwitch state="on" platform="android-app" busy={false} onChange={onChange} /></ul>)
    const sw = screen.getByRole('switch', { name: 'Announce when the screen is off' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await userEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(false)
    rerender(<ul><ScreenOffSwitch state="off" platform="android-app" busy={false} onChange={onChange} /></ul>)
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenLastCalledWith(true)
  })

  it('cannot be pressed again while it is changing', () => {
    render(<ul><ScreenOffSwitch state="on" platform="web" busy onChange={() => {}} /></ul>)
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
  })
})
