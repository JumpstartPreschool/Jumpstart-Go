import type { CSSProperties } from 'react'

// Stars and a dotted flight path, echoing the logo. Purely decorative: fixed behind all content,
// ignored by screen readers and touches, and still when reduced motion is on.
const STARS: Array<{ x: string; y: string; size: number; color: string }> = [
  { x: '5%', y: '11%', size: 18, color: 'var(--rb-yellow)' },
  { x: '93%', y: '16%', size: 14, color: 'var(--rb-blue)' },
  { x: '86%', y: '64%', size: 20, color: 'var(--rb-green)' },
  { x: '9%', y: '76%', size: 13, color: 'var(--rb-red)' },
  { x: '47%', y: '5%', size: 10, color: 'var(--rb-orange)' },
  { x: '70%', y: '92%', size: 15, color: 'var(--rb-teal)' },
  { x: '28%', y: '44%', size: 8, color: 'var(--rb-violet)' },
  { x: '63%', y: '31%', size: 9, color: 'var(--rb-yellow)' },
  { x: '38%', y: '88%', size: 11, color: 'var(--rb-blue)' },
]
const STAR_PATH = 'M12 2.4l2.95 6.02 6.63.93-4.8 4.62 1.16 6.55L12 17.4l-5.94 3.12 1.16-6.55-4.8-4.62 6.63-.93z'

export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: -1 }}>
      <svg className="absolute -right-24 top-6 w-[560px] max-w-[70vw] opacity-40" viewBox="0 0 560 160" fill="none">
        <path d="M8 120 C 120 -20, 240 -20, 300 110 C 350 20, 450 10, 552 70" stroke="var(--ink-3)" strokeWidth="2.5" strokeDasharray="7 9" strokeLinecap="round" />
      </svg>
      {STARS.map((s, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className="twinkle absolute"
          style={{ left: s.x, top: s.y, width: s.size, height: s.size, '--twinkle-delay': `${(i * 0.7) % 4}s`, '--twinkle-duration': `${4 + (i % 3)}s` } as CSSProperties}
        >
          <path d={STAR_PATH} fill={s.color} strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  )
}

/** The smiling star from the logo, floating on a soft glow: a friendly mascot for hero spots. */
export function Mascot({ size = 140, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`relative grid place-items-center ${className}`} style={{ width: size, height: size }} aria-hidden>
      <div className="absolute inset-[8%] rounded-full blur-2xl" style={{ background: 'radial-gradient(circle, rgb(255 194 26 / 0.55), rgb(239 59 63 / 0.25) 55%, transparent 72%)' }} />
      <img src="/brand/star.webp" alt="" width={size} height={size} className="float relative drop-shadow-[0_12px_18px_rgb(239_59_63/0.35)]" style={{ width: size * 0.86, height: size * 0.86 }} />
    </div>
  )
}
