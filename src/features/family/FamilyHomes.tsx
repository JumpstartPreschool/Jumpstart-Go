import { ErrorState, SkeletonList } from '../../ui/States'
import { useNow } from '../../ui/hooks'
import { AreaShell } from '../auth/AreaShell'
import { Board } from '../school/Board'
import { useSchoolDay } from '../school/useSchoolDay'

export { ParentToday as ParentHome } from './ParentToday'

/** The core team's Today (Screen Book v3): every child's day live, attendance and today's times. */
export function CoreHome() {
  const { children, error, reload } = useSchoolDay()
  const nowMs = useNow(15_000)
  const date = new Date(nowMs).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })
  return (
    <AreaShell area="core" title="Today" subtitle={`${date}. Tap a child to mark attendance or change today's time.`}>
      <section className="mt-6" aria-busy={!children}>
        {error ? <ErrorState title="Couldn't load today" onRetry={reload}>Check your connection and try again.</ErrorState>
          : !children ? <SkeletonList count={6} />
          : <Board children={children} editable nowMs={nowMs} onChanged={reload} />}
      </section>
    </AreaShell>
  )
}
