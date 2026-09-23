import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * Bottom sheet on the native <dialog>: focus trapping, Escape to close and the backdrop come from the browser.
 * Tapping the backdrop closes it.
 */
export function Sheet({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`sheet card ${wide ? 'md:!w-[min(760px,calc(100vw-48px))]' : ''}`}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 sm:px-8 sm:pb-8">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-line-strong md:hidden" aria-hidden />
        <div className="mt-4 flex items-center justify-between gap-4">
          <h2 className="text-[26px] font-bold leading-8">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-sunken text-ink-2 transition-transform duration-200 ease-spring active:scale-90"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  )
}
