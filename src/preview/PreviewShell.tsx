import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Eye } from 'lucide-react'

/** Every preview screen carries this label: the data is sample data, not a real trip (NFR-7). */
export function PreviewRibbon() {
  return (
    <Link
      to="/preview"
      className="glass fixed left-1/2 top-[max(8px,env(safe-area-inset-top))] z-50 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold text-ink-2"
    >
      <Eye className="size-3.5" aria-hidden /> Design preview · sample data
    </Link>
  )
}

/** Phone screens render at phone width, centred, on larger displays. */
export function PhoneColumn({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="min-h-dvh bg-canvas md:bg-sunken md:py-8">
      <PreviewRibbon />
      <div className={`relative mx-auto min-h-dvh w-full max-w-[430px] bg-canvas md:min-h-[860px] md:overflow-hidden md:rounded-[44px] md:shadow-2 md:ring-1 md:ring-line ${className}`}>
        {children}
      </div>
    </div>
  )
}
