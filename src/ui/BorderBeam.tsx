import type { CSSProperties } from 'react'

/**
 * A slow light that travels around its parent's edge (VengeanceUI "border-beam", MIT, adapted: styles live in
 * app.css `.border-beam`, it's hidden with reduced motion, and browsers without CSS offset-path show nothing).
 * The parent needs `position: relative` and a border radius.
 */
export function BorderBeam({ size = 180, duration = 12, from = 'var(--rb-yellow)', to = 'var(--accent)' }: { size?: number; duration?: number; from?: string; to?: string }) {
  return <span aria-hidden className="border-beam" style={{ '--beam-size': `${size}px`, '--beam-duration': `${duration}s`, '--beam-from': from, '--beam-to': to } as CSSProperties} />
}
