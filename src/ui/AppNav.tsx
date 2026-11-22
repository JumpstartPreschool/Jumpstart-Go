import type { ReactNode } from 'react'

export interface NavItem {
  label: string
  icon: ReactNode
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
      className={`group relative flex flex-col items-center justify-center gap-1 rounded-lg text-nav transition-colors duration-150 ${
        vertical ? 'h-[72px] w-[72px]' : 'h-16 flex-1'
      } ${item.active ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}
    >
      <span
        className={`grid h-9 w-11 place-items-center rounded-sm transition-[background-color,color,box-shadow] duration-150 [&_svg]:size-[22px] ${
          item.active ? 'bg-accent text-on-accent shadow-[0_3px_0_var(--accent-lip)]' : 'group-hover:bg-sunken'
        }`}
      >
        {item.icon}
      </span>
      {item.label}
      {item.badge && <span className="absolute right-[24%] top-2 size-2.5 rounded-full bg-rb-red shadow-[0_0_0_2px_var(--surface)]" aria-label="New" />}
    </button>
  )
}

/** Bottom tab bar on phones; a floating side rail on iPad and larger (pair with `md:pl-[128px]` on the content). */
export function AppNav({ items, label = 'Main' }: { items: NavItem[]; label?: string }) {
  return (
    <>
      <nav aria-label={label} className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden">
        <div className="glass mx-auto flex max-w-[520px] rounded-xl p-1">
          {items.map((item) => <Item key={item.label} item={item} vertical={false} />)}
        </div>
      </nav>
      <nav
        aria-label={label}
        className="glass fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-[max(16px,env(safe-area-inset-left))] top-[max(16px,env(safe-area-inset-top))] z-20 hidden w-[92px] flex-col items-center gap-2 rounded-2xl py-5 md:flex"
      >
        <img src="/brand/star.webp" alt="" aria-hidden width={48} height={48} className="mb-3 size-12" />
        {items.map((item) => <Item key={item.label} item={item} vertical />)}
      </nav>
    </>
  )
}
