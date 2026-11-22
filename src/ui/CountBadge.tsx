/**
 * The unread number on a tab, like WhatsApp: a red pill with white figures, "99+" past 99, nothing at zero.
 * `corner` sits it over the icon in a phone tab bar; otherwise it follows the label in the top bar's links.
 * Screen readers hear "3 new" after the tab's name.
 */
export function CountBadge({ n, corner = false }: { n: number; corner?: boolean }) {
  if (n <= 0) return null
  const text = n > 99 ? '99+' : String(n)
  return (
    <>
      <span aria-hidden className={corner
        ? 'absolute left-[calc(50%+4px)] top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11.5px] font-extrabold leading-none text-on-accent tabular-nums shadow-[0_0_0_2px_var(--surface)]'
        : 'topnav-badge'}>
        {text}
      </span>
      <span className="sr-only">, {text} new</span>
    </>
  )
}
