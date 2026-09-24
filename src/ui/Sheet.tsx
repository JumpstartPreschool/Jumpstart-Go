import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * Sheet on the native <dialog>: a bottom sheet on phones, a centred card on iPad and desktop. The browser gives
 * focus trapping, Escape to close and the backdrop; tapping the backdrop closes it too. The header stays put while
 * the body scrolls; put the main action in <SheetFooter> so it stays in reach.
 */
export function Sheet({ open, onClose, title, description, children, wide = false }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; wide?: boolean }) {
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
      className="sheet"
      style={wide ? ({ '--sheet-w': '760px' } as CSSProperties) : undefined}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-2 md:hidden" aria-hidden />
      <div className="flex shrink-0 items-start gap-4 px-6 pb-3 pt-4 sm:px-8 md:pt-7">
        <div className="min-w-0 flex-1 pt-1.5">
          <h2 className="text-h2">{title}</h2>
          {description && <p className="mt-1 text-body text-ink-2">{description}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-sunken text-ink-2 transition-[background-color,transform] duration-150 hover:bg-[var(--sunken-hover)] hover:text-ink active:scale-90">
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[var(--sheet-px)] pb-[var(--sheet-pb)] pt-2 [--sheet-pb:max(20px,env(safe-area-inset-bottom))] [--sheet-px:24px] sm:[--sheet-px:32px] md:[--sheet-pb:32px]">
        {children}
      </div>
    </dialog>
  )
}

/** The sheet's main action, pinned to the bottom of the sheet while the body scrolls. */
export function SheetFooter({ children }: { children: ReactNode }) {
  return <div className="sheet-foot mt-6">{children}</div>
}
