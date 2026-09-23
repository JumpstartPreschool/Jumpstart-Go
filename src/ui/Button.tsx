import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'sunshine' | 'quiet' | 'danger'
type Size = 'md' | 'lg' | 'xl'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  loading?: boolean
}

const base =
  'relative inline-flex select-none items-center justify-center gap-2.5 whitespace-nowrap rounded-full font-extrabold tracking-[-0.005em] [&_svg]:shrink-0 ' +
  // Press: a quick squeeze, then a spring back on release. Reduced motion keeps it still.
  'transition-[transform,box-shadow,filter,background-color,color] duration-200 ease-spring active:scale-[0.95] active:duration-75 active:ease-out ' +
  'disabled:pointer-events-none disabled:opacity-45 disabled:saturate-50 motion-reduce:active:scale-100'

const variants: Record<Variant, string> = {
  // The one next action: Jumpstart blue with a glow and a glassy top highlight.
  primary:
    'text-on-accent bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] ' +
    'shadow-[var(--accent-glow),inset_0_1px_0_rgb(255_255_255/0.4),inset_0_-2px_0_rgb(0_0_0/0.12)] hover:brightness-110 active:brightness-95',
  secondary: 'card text-ink hover:brightness-[1.04] active:brightness-95',
  // Warm, friendly secondary for "Running late" and similar. Dark text keeps contrast on yellow–orange.
  sunshine:
    'text-[#3a2200] bg-[linear-gradient(135deg,var(--rb-yellow),var(--rb-orange))] ' +
    'shadow-[0_14px_30px_-12px_rgb(247_133_42/0.75),inset_0_1px_0_rgb(255_255_255/0.5)] hover:brightness-105 active:brightness-95',
  quiet: 'text-ink-2 hover:bg-sunken hover:text-ink active:bg-sunken',
  danger: 'bg-danger-soft text-danger ring-1 ring-inset ring-danger/20 hover:brightness-95 active:brightness-90',
}

// Heights keep every target above 44 pt (NFR-3); xl is the main action of an iPad screen.
const sizes: Record<Size, string> = {
  md: 'h-11 text-[15px] [&_svg]:size-[18px]',
  lg: 'h-14 text-[17px] [&_svg]:size-5',
  xl: 'h-16 text-[19px] [&_svg]:size-6',
}
// Padding is separate so an icon-only button becomes a circle instead of squeezing its icon.
const padding: Record<Size, string> = { md: 'px-5', lg: 'px-6', xl: 'px-8' }
const circle: Record<Size, string> = { md: 'w-11', lg: 'w-14', xl: 'w-16' }

export function Button({ variant = 'primary', size = 'lg', icon, loading = false, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${sizes[size]} ${children ? padding[size] : circle[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}
