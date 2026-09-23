import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger'
type Size = 'md' | 'lg' | 'xl'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  loading?: boolean
}

const base =
  'group relative inline-flex select-none items-center justify-center gap-2.5 whitespace-nowrap font-semibold tracking-[-0.01em] ' +
  // Press: quick scale-down, spring back on release. Disabled and reduced-motion users get no movement.
  'transition-[transform,background-color,box-shadow,color] duration-200 ease-spring active:scale-[0.97] active:duration-75 active:ease-out ' +
  'disabled:pointer-events-none disabled:opacity-45 motion-reduce:active:scale-100'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_6px_16px_-6px_var(--accent)] hover:bg-accent-press active:bg-accent-press active:shadow-none',
  secondary: 'bg-surface text-ink ring-1 ring-line-strong shadow-1 hover:bg-sunken active:bg-sunken',
  quiet: 'bg-transparent text-ink-2 hover:bg-sunken hover:text-ink active:bg-sunken',
  danger: 'bg-danger-soft text-danger hover:brightness-95 active:brightness-90',
}

// Heights keep every target above 44 pt (NFR-3); xl is the one main action on an iPad screen.
const sizes: Record<Size, string> = {
  md: 'h-11 rounded-[12px] px-4 text-[15px] [&_svg]:size-[18px]',
  lg: 'h-13 rounded-[14px] px-5 text-[17px] [&_svg]:size-5',
  xl: 'h-16 rounded-[18px] px-7 text-[19px] [&_svg]:size-6',
}

export function Button({ variant = 'primary', size = 'lg', icon, loading = false, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}
