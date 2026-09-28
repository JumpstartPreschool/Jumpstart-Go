import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { X } from './icons'
import { isInstalled } from './hooks'

const IPHONE = /iPhone|iPod/.test(navigator.userAgent)

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

  // Safari on iPhone lays the dialog out under its floating address bar, so the sheet's bottom (the main action, Sign
  // out) ends up hidden behind it. Pin the dialog to the part of the screen people can actually see instead.
  useEffect(() => {
    const d = ref.current
    const vv = window.visualViewport
    if (!open || !d || !vv) return
    const fit = () => {
      d.style.setProperty('--vv-top', `${vv.offsetTop}px`)
      d.style.setProperty('--vv-h', `${vv.height}px`)
      // If that still reaches the bottom of the screen in a browser tab, a floating toolbar covers the last ~84px:
      // leave room for it so the last row can scroll clear. Installed on the Home Screen there is no toolbar.
      const screenH = window.matchMedia('(orientation: landscape)').matches ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height)
      const barOver = IPHONE && !isInstalled() && screenH - vv.height < 96
      d.style.setProperty('--sheet-bar', barOver ? '84px' : '0px')
    }
    fit()
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    return () => {
      vv.removeEventListener('resize', fit)
      vv.removeEventListener('scroll', fit)
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      style={wide ? ({ '--sheet-w': '760px' } as CSSProperties) : undefined}
      aria-label={title}
      // React passes a nested sheet's close up to this one; only this dialog's own close should close it.
      onClose={(e) => e.target === e.currentTarget && onClose()}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet-panel">
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
        {/* flex-auto, not flex-1: the sheet's height comes from its content, and Safari sizes a flex-1 body to nothing. */}
        <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain px-[var(--sheet-px)] pb-[var(--sheet-pb)] pt-2 [--sheet-pb:max(20px,env(safe-area-inset-bottom),var(--sheet-bar,0px))] [--sheet-px:24px] sm:[--sheet-px:32px] md:[--sheet-pb:32px]">
          {children}
        </div>
      </div>
    </dialog>
  )
}

/** The sheet's main action, pinned to the bottom of the sheet while the body scrolls. */
export function SheetFooter({ children }: { children: ReactNode }) {
  return <div className="sheet-foot mt-6">{children}</div>
}
