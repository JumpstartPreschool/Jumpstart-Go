import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react'
import { LoaderCircle } from './icons'

type Variant = 'primary' | 'secondary' | 'sunshine' | 'success' | 'quiet' | 'danger'
type Size = 'md' | 'lg' | 'xl'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}

/**
 * Solid button with a darker lip (styles: `.btn` in app.css). Heights keep every target at 44 pt or more (NFR-3);
 * xl (56) is the main action of a tablet screen. While loading it keeps its colour, shows a spinner and ignores
 * presses, so a double tap can't send twice.
 */
export function Button({ variant = 'primary', size = 'lg', icon, loading = false, children, className = '', onClick, ...rest }: ButtonProps) {
  const guard = (e: MouseEvent<HTMLButtonElement>) => {
    if (loading) return e.preventDefault()
    onClick?.(e)
  }
  return (
    <button
      type="button"
      className={`btn btn--${variant} btn--${size} ${children ? '' : 'btn--icon'} ${className}`}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={guard}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

/**
 * A rich action (`.lux` in app.css): frosted glass on a soft raised base, the icon in a sunken well. Used only where the
 * owner asked for it (People's Add child and Bulk upload); `primary` is the red main action.
 */
export function LuxButton({ primary = false, icon, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; icon: ReactNode }) {
  return (
    <button type="button" className={`lux ${primary ? 'lux--primary' : ''} ${className}`} {...rest}>
      <span className="lux__icon" aria-hidden>{icon}</span>
      {children}
    </button>
  )
}
