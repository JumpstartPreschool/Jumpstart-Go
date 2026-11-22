import type { ReactNode } from 'react'

export type Tone = 'neutral' | 'accent' | 'live' | 'warning' | 'danger' | 'recent' | 'stale' | 'solid'

const tones: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2',
  accent: 'bg-accent-soft text-accent-ink',
  live: 'bg-live-soft text-live',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  recent: 'bg-recent-soft text-recent',
  stale: 'bg-stale-soft text-stale',
  solid: 'bg-secondary text-canvas',
}

/** A small status or tag label. Colour never carries the meaning alone: pair it with words and, for status, an icon. */
export function Pill({ tone = 'neutral', icon, children, className = '' }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-2.5 text-caption font-bold whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0 ${tones[tone]} ${className}`}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}
