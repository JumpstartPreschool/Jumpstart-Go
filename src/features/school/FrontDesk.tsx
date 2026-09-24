import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Headset, Phone } from 'lucide-react'
import { Button } from '../../ui/Button'
import { ErrorState, SkeletonList } from '../../ui/States'
import { useNow } from '../../ui/hooks'
import { supabase } from '../../lib/supabase'
import { AreaShell } from '../auth/AreaShell'
import { clockTime } from '../trips/rules'
import { todayInIndia } from '../trips/api'
import { useLive, type Call } from './api'
import { Board } from './Board'
import { CallSheet } from './CallSheet'
import { useSchoolDay } from './useSchoolDay'

/**
 * The PRO team's front desk (D25, Screen Book v3): log calls from parents who phone or walk in, see today's calls, and
 * every child's day to answer questions. It can't change programmes, roles or attendance rules.
 */
export function FrontDesk() {
  const navigate = useNavigate()
  const { children, error, reload } = useSchoolDay()
  const nowMs = useNow(15_000)
  const [calling, setCalling] = useState<string | true | null>(null)
  const day = todayInIndia()
  const calls = useLive<Call>('calls', () => supabase.from('calls').select('*').gte('created_at', `${day}T00:00:00+05:30`).order('created_at', { ascending: false }), [day])
  // Names for the call list: the parents who called and the staff who logged it (the desk can read both).
  const [people, setPeople] = useState<Map<string, string>>(new Map())
  useEffect(() => { void supabase.from('profiles').select('id, full_name').then(({ data }) => setPeople(new Map((data ?? []).map((p) => [p.id as string, p.full_name as string])))) }, [])

  return (
    <AreaShell area="pro" title="Front desk" subtitle="For parents who phone or walk in. Anything you log reaches the gate's iPads at once."
      actions={<Button icon={<Phone />} disabled={!children} onClick={() => setCalling(true)}>Log a call</Button>}>
      <div className="mt-6 grid gap-6">
        {error ? <ErrorState title="Couldn't load today" onRetry={reload}>Check your connection and try again.</ErrorState> : !children ? <SkeletonList count={6} /> : (
          <Board children={children} editable={false} nowMs={nowMs} onChanged={reload} onLogCall={(id) => setCalling(id)} onMessages={(id) => navigate(`/pro/messages?child=${id}`)}
            title={
              <section aria-labelledby="calls-h" className="grid gap-2.5">
                <h2 id="calls-h" className="kicker flex items-center gap-2 [&_svg]:size-4"><Headset aria-hidden />Calls today</h2>
                {calls.rows?.length ? (
                  <ul className="card divide-y divide-line rounded-2xl px-5">
                    {calls.rows.map((c) => {
                      const kid = children.find((k) => k.id === c.child_id)
                      return (
                        <li key={c.id} className="grid grid-cols-[1fr_auto] gap-3 py-3">
                          <div className="min-w-0">
                            <p className="text-h4">{people.get(c.guardian_id)?.split(' ')[0] ?? 'A parent'} about {kid?.first ?? 'a child'}</p>
                            <p className="text-small font-semibold text-ink-2">{c.summary}. Logged by {people.get(c.logged_by)?.split(' ')[0] ?? 'the desk'}.</p>
                          </div>
                          <time className="text-small font-bold text-ink-2 tabular-nums">{clockTime(c.created_at)}</time>
                        </li>
                      )
                    })}
                  </ul>
                ) : <p className="rounded-lg bg-sunken px-4 py-3 text-small font-semibold text-ink-2">No calls logged yet today. When a parent phones, tap Log a call: on-the-way calls, new times and absences go straight to the gate.</p>}
                <h2 className="kicker mt-3">Children today</h2>
              </section>
            } />
        )}
      </div>
      {calling && children && <CallSheet open onClose={() => setCalling(null)} children={children} initialChild={typeof calling === 'string' ? calling : undefined} nowMs={nowMs} onLogged={() => { reload(); void calls.reload() }} />}
    </AreaShell>
  )
}
