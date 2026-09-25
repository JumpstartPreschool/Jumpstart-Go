import type { ReactNode } from 'react'

const sizes = { sm: 'size-10 text-[14px]', md: 'size-12 text-[16px]', lg: 'size-14 text-[18px]' }

/** "Aarav Kulkarni" → "AK", "Isha" → "I": the first and last names' first letters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? words[words.length - 1]![0] : ''
  return (first + last).toUpperCase()
}

/**
 * A person or child as their initials on a soft tint of their own stable colour (childColor), like a phone's contacts,
 * or an icon for a role. Decorative: the name is always written next to it.
 */
export function Avatar({ name, color, icon, size = 'md' }: { name: string; color: string; icon?: ReactNode; size?: keyof typeof sizes }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-extrabold tracking-[0.02em] shadow-[0_0_0_3px_var(--surface),0_6px_14px_-10px_rgb(22_25_58/0.45)] [&_svg]:size-[55%] ${sizes[size]}`}
      style={{ background: `color-mix(in oklab, ${color} 18%, var(--surface))`, color: `color-mix(in oklab, ${color} 62%, var(--ink))` }}
      aria-hidden
      title={name}
    >
      {icon ?? initials(name)}
    </span>
  )
}
