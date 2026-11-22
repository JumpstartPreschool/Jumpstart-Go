import type { MouseEventHandler } from 'react'
import { LogOut } from './icons'

/**
 * Sign out, the same everywhere: a calm full-width row with a line icon that turns softly red on hover or press,
 * so it's easy to find but never shouts (styles: `.signout` in app.css).
 */
export function SignOutButton({ onClick, className = '' }: { onClick: MouseEventHandler<HTMLButtonElement>; className?: string }) {
  return (
    <button type="button" className={`signout ${className}`} onClick={onClick}>
      <LogOut aria-hidden />
      Sign out
    </button>
  )
}
