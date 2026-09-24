import type { ReactNode } from 'react'

const sizes = { sm: 'size-10 text-[16px]', md: 'size-12 text-[19px]', lg: 'size-14 text-[23px]' }

/**
 * A person's or child's initial on their own stable colour (childColor), or an icon for a role.
 * Solid colour with a white ring: easy to tell apart at a glance, no gradients.
 */
export function Avatar({ name, color, icon, size = 'md' }: { name: string; color: string; icon?: ReactNode; size?: keyof typeof sizes }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-extrabold tracking-[-0.02em] text-white shadow-[0_0_0_3px_var(--surface),0_6px_14px_-8px_rgb(22_25_58/0.45)] [&_svg]:size-[45%] ${sizes[size]}`}
      style={{ background: color }}
      aria-hidden
    >
      {icon ?? name.trim()[0]?.toUpperCase()}
    </span>
  )
}
