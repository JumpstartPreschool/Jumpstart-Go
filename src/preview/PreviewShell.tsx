import { Link } from 'react-router'
import { Eye } from 'lucide-react'

/** Every preview screen carries this label: the data is sample data, not a real trip (NFR-7). */
export function PreviewRibbon() {
  return (
    <Link
      to="/preview"
      className="glass fixed right-[max(12px,env(safe-area-inset-right))] top-[max(10px,env(safe-area-inset-top))] z-50 flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-extrabold text-ink-2"
    >
      <Eye className="size-3.5" aria-hidden /> Preview · sample data
    </Link>
  )
}
