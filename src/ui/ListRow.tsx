import type { ReactNode } from 'react'

/**
 * One person, child or class in a list: avatar, name, a detail line, optional tags and an action on the right.
 * On narrow phones the action drops under the text instead of squeezing the name.
 */
export function ListRow({ avatar, title, detail, badges, action }: { avatar: ReactNode; title: string; detail: ReactNode; badges?: ReactNode; action?: ReactNode }) {
  return (
    <li className="card flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-xl p-3.5 pr-4">
      {avatar}
      <div className="min-w-0 flex-1 basis-[180px]">
        <p className="truncate text-h3">{title}</p>
        <p className="truncate text-small font-semibold text-ink-2">{detail}</p>
        {badges && <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div>}
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </li>
  )
}
