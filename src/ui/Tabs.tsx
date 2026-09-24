import type { KeyboardEvent, ReactNode } from 'react'

export interface TabItem<K extends string> { key: K; label: string; icon?: ReactNode; count?: number | null }

/**
 * Segmented tabs (styles: `.seg`). Arrow keys, Home and End move between tabs, as screen-reader users expect;
 * the panel is labelled by the chosen tab (give it id `${id}-panel`).
 */
export function Tabs<K extends string>({ id, label, items, value, onChange }: { id: string; label: string; items: Array<TabItem<K>>; value: K; onChange: (key: K) => void }) {
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = items.findIndex((t) => t.key === value)
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null
    if (next === null) return
    e.preventDefault()
    const key = items[(next + items.length) % items.length]!.key
    onChange(key)
    document.getElementById(`${id}-${key}`)?.focus()
  }
  return (
    <div className="seg" role="tablist" aria-label={label} onKeyDown={onKey}>
      {items.map((t) => {
        const on = t.key === value
        return (
          <button key={t.key} id={`${id}-${t.key}`} type="button" role="tab" aria-selected={on} aria-controls={`${id}-panel`} tabIndex={on ? 0 : -1} onClick={() => onChange(t.key)}>
            {t.icon}
            {t.label}
            {t.count != null && <span className="count">{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
