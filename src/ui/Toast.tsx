import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info } from './icons'

type ToastTone = 'success' | 'info' | 'danger'
interface ToastItem { id: number; tone: ToastTone; text: string; action?: { label: string; run: () => void }; leaving?: boolean }
type Show = (text: string, opts?: { tone?: ToastTone; action?: ToastItem['action']; sticky?: boolean }) => void

const ToastContext = createContext<Show>(() => {})
const ICON = { success: <CircleCheck className="text-live" />, info: <Info className="text-accent-ink" />, danger: <CircleAlert className="text-danger" /> }

/**
 * Short confirmations ("Child added") and background news ("A new version is ready"). They sit above the home
 * indicator, are read out by screen readers, and go away on their own unless they carry an action.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const next = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => setItems((all) => all.filter((t) => t.id !== id)), 220)
  }, [])

  const show = useCallback<Show>((text, opts = {}) => {
    const id = next.current++
    setItems((all) => [...all.slice(-2), { id, text, tone: opts.tone ?? 'success', action: opts.action }])
    if (!opts.sticky && !opts.action) setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region pointer-events-none fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} data-leaving={t.leaving || undefined} role={t.tone === 'danger' ? 'alert' : 'status'}
            className="toast glass pointer-events-auto flex w-full max-w-[460px] items-center gap-3 rounded-lg py-2 pl-4 pr-2 [&>svg]:size-5 [&>svg]:shrink-0">
            {ICON[t.tone]}
            <p className="min-h-10 flex-1 content-center py-1 text-small font-bold">{t.text}</p>
            {t.action && (
              <button type="button" onClick={() => { t.action!.run(); dismiss(t.id) }}
                className="h-10 shrink-0 rounded-sm bg-accent px-4 text-small font-extrabold text-on-accent transition-colors hover:bg-[var(--accent-hover)]">
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
