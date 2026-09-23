import type { ReactNode } from 'react'

export interface NavItem {
  label: string
  icon: ReactNode
  /** A rainbow colour (CSS value) for this section. */
  color: string
  active?: boolean
  badge?: boolean
  onClick?: () => void
}

function Item({ item, vertical }: { item: NavItem; vertical: boolean }) {
  return (
    <button
      type="button"
      onClick={item.onClick}
      aria-current={item.active ? 'page' : undefined}
      className={`group relative flex flex-col items-center justify-center gap-1 rounded-[22px] font-extrabold transition-transform duration-200 ease-spring active:scale-90 ${
        vertical ? 'h-[76px] w-[76px] text-[12px]' : 'h-16 flex-1 text-[12px]'
      } ${item.active ? 'text-ink' : 'text-ink-2'}`}
    >
      <span
        className={`grid size-10 place-items-center rounded-2xl transition-[background,box-shadow,color] duration-200 [&_svg]:size-[22px] ${item.active ? 'text-white' : ''}`}
        style={
          item.active
            ? { background: `linear-gradient(135deg, ${item.color}, color-mix(in oklab, ${item.color} 70%, white))`, boxShadow: `0 10px 20px -8px ${item.color}` }
            : { color: item.color }
        }
      >
        {item.icon}
      </span>
      {item.label}
      {item.badge && <span className="absolute right-[22%] top-2 size-2.5 rounded-full ring-2 ring-[var(--glass-strong)]" style={{ background: 'var(--rb-red)' }} aria-label="New" />}
    </button>
  )
}

/** Bottom tab bar on phones; a floating side rail on iPad and larger (pair with `md:pl-[128px]` on the content). */
export function AppNav({ items, label = 'Main' }: { items: NavItem[]; label?: string }) {
  return (
    <>
      <nav aria-label={label} className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden">
        <div className="card mx-auto flex max-w-[520px] rounded-[30px] p-1.5" style={{ background: 'var(--glass-bar)' }}>
          {items.map((item) => <Item key={item.label} item={item} vertical={false} />)}
        </div>
      </nav>
      <nav
        aria-label={label}
        className="glass fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-[max(16px,env(safe-area-inset-left))] top-[max(16px,env(safe-area-inset-top))] z-20 hidden w-[96px] flex-col items-center gap-2 rounded-[34px] py-5 md:flex"
      >
        <img src="/brand/star.webp" alt="" aria-hidden className="float mb-3 size-12" />
        {items.map((item) => <Item key={item.label} item={item} vertical />)}
      </nav>
    </>
  )
}
