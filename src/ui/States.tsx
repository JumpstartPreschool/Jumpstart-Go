import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, RotateCcw, TriangleAlert, WifiOff } from 'lucide-react'
import { Button } from './Button'
import { Mascot } from './Logo'

/** Nothing to show yet: says what is empty and what to do next. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center rounded-xl px-6 py-10 text-center">
      <Mascot size={88} />
      <h2 className="mt-3 text-h3">{title}</h2>
      {children && <p className="mt-1 max-w-[46ch] text-body text-ink-2">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Loading failed: the problem in plain words and a way to try again. */
export function ErrorState({ title = "Couldn't load this", children, onRetry }: { title?: string; children?: ReactNode; onRetry?: () => void }) {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  return (
    <div className="card flex flex-col items-center rounded-xl px-6 py-10 text-center" role="alert">
      <span className="grid size-14 place-items-center rounded-lg bg-danger-soft text-danger" aria-hidden>
        {offline ? <WifiOff className="size-7" /> : <CircleAlert className="size-7" />}
      </span>
      <h2 className="mt-4 text-h3">{offline ? "You're offline" : title}</h2>
      <p className="mt-1 max-w-[46ch] text-body text-ink-2">{offline ? 'Connect to Wi-Fi or mobile data, then try again.' : children}</p>
      {onRetry && <Button className="mt-5" variant="secondary" icon={<RotateCcw />} onClick={onRetry}>Try again</Button>}
    </div>
  )
}

/** Placeholder rows shaped like the content that is loading, so nothing jumps when it arrives. */
export function SkeletonList({ count = 4, height = 'h-[88px]', className = 'grid gap-3 md:grid-cols-2' }: { count?: number; height?: string; className?: string }) {
  return (
    <ul className={className} aria-label="Loading" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={`card flex items-center gap-3.5 rounded-xl p-3.5 ${height}`}>
          <span className="size-12 shrink-0 animate-pulse rounded-full bg-sunken" />
          <span className="grid flex-1 gap-2">
            <span className="h-4 w-2/5 animate-pulse rounded-full bg-sunken" />
            <span className="h-3 w-3/5 animate-pulse rounded-full bg-sunken" />
          </span>
        </li>
      ))}
    </ul>
  )
}

const noticeTone = {
  info: { cls: 'bg-info-soft text-info', icon: <Info /> },
  success: { cls: 'bg-live-soft text-live', icon: <CircleCheck /> },
  warning: { cls: 'bg-warning-soft text-warning', icon: <TriangleAlert /> },
  danger: { cls: 'bg-danger-soft text-danger', icon: <CircleAlert /> },
}

/** An inline message inside a page or form. Errors are announced to screen readers. */
export function Notice({ tone = 'info', icon, children, className = '' }: { tone?: keyof typeof noticeTone; icon?: ReactNode; children: ReactNode; className?: string }) {
  const t = noticeTone[tone]
  return (
    <p className={`flex items-start gap-2.5 rounded-md px-4 py-3 text-small font-bold [&>svg]:mt-px [&>svg]:size-[18px] [&>svg]:shrink-0 ${t.cls} ${className}`} role={tone === 'danger' ? 'alert' : undefined}>
      {icon ?? t.icon}
      <span className="min-w-0">{children}</span>
    </p>
  )
}
