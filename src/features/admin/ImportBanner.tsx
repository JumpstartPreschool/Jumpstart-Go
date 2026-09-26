import { CircleAlert, CircleCheck, LoaderCircle, X } from '../../ui/icons'
import { clearImport, useImportJob } from './importJob'

/** Floats at the bottom of every staff page while a bulk upload runs, then says how it went until it's closed. */
export function ImportBanner() {
  const job = useImportJob()
  if (!job) return null
  const notAdded = job.rows.filter((r) => r.problems.length || job.failed.has(r.line)).length
  const gaps = job.rows.filter((r) => !r.problems.length && r.warnings.length && !job.failed.has(r.line)).length
  return (
    <div className="gutter pointer-events-none fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-40 flex justify-center">
      <div role="status" aria-live="polite" className="glass page-in pointer-events-auto flex w-full max-w-[520px] items-center gap-3 rounded-xl py-3 pl-4 pr-2 shadow-float">
        {job.finished
          ? (notAdded ? <CircleAlert className="size-6 shrink-0 text-warning" aria-hidden /> : <CircleCheck className="size-6 shrink-0 text-live" aria-hidden />)
          : <LoaderCircle className="size-5 shrink-0 animate-spin text-accent" aria-hidden />}
        <div className="grid min-w-0 flex-1 gap-1.5">
          <p className="truncate text-small font-bold">
            {job.finished
              ? `Bulk upload done: ${job.added} added${gaps ? `, ${gaps} need details` : ''}${notAdded ? `, ${notAdded} not added` : ''}`
              : `Adding children: ${job.done} of ${job.total}`}
          </p>
          {!job.finished && <Progress done={job.done} total={job.total} />}
          {job.finished && (gaps > 0 || notAdded > 0) && <p className="text-caption font-semibold text-ink-2">Open Bulk upload to see them and download the list.</p>}
        </div>
        {job.finished && (
          <button type="button" className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-sunken" aria-label="Close" onClick={clearImport}><X className="size-5" /></button>
        )}
      </div>
    </div>
  )
}

export function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Upload progress">
      <div className="h-full origin-left rounded-full bg-accent transition-transform duration-200" style={{ transform: `scaleX(${total ? done / total : 0})` }} />
    </div>
  )
}
