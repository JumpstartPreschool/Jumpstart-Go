import { useState } from 'react'
import { CalendarClock, CalendarX, DoorOpen, UserCheck } from '../../ui/icons'
import { Avatar, childKind, adultKind } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { Sheet } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { childColor } from '../../ui/childColor'
import { formatTime } from '../../domain/time'
import type { Direction } from '../../domain/programme'
import { explainDbError } from '../admin/api'
import { gateWalkIn } from '../school/api'
import { AWAY_LABEL } from '../school/dayModel'
import type { SchoolChild } from '../school/useSchoolDay'

const WORD: Record<Direction, string> = { dropoff: 'drop-off', pickup: 'pickup' }

/**
 * Someone arrived without "I'm on my way" (Screen Book v3): check the child in, or hand them to one of their registered
 * parents or family (D4). Anyone else needs a link and a code from a parent.
 */
function WalkInSheet({ c, direction, onClose, onDone }: { c: SchoolChild; direction: Direction; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function go(handedTo: string | null, name?: string) {
    setBusy(true)
    setError(null)
    try {
      await gateWalkIn(c.id, direction, handedTo)
      toast(direction === 'dropoff' ? `${c.first} checked in.` : `${c.first} handed over to ${name}. Recorded.`)
      onDone()
      onClose()
    } catch (e) {
      setError(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }
  if (direction === 'dropoff') {
    return (
      <Sheet open onClose={onClose} title={`Check in ${c.first}?`} description={`${c.fullName} is at the gate for drop-off. Their parents see it straight away.`}>
        {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Button variant="secondary" onClick={onClose}>Not yet</Button>
          <Button variant="success" icon={<DoorOpen />} loading={busy} onClick={() => void go(null)}>Check in {c.first}</Button>
        </div>
      </Sheet>
    )
  }
  return (
    <Sheet open onClose={onClose} title={`Hand over ${c.first}`} description="Who is collecting? Only the parents and family the school has added are listed. Anyone else needs a link and a code from a parent.">
      <div className="grid gap-2.5">
        {(['parent', 'family'] as const).map((kind) => {
          const list = c.guardians.filter((g) => g.kind === kind)
          return list.length > 0 && (
            <div key={kind} className="grid gap-2.5">
              <p className="kicker mt-1">{kind === 'parent' ? 'Parents' : 'Family'}</p>
              {list.map((g) => (
                <button key={g.id} type="button" className="choice flex items-center gap-3 p-3 text-left" disabled={busy} onClick={() => void go(g.id, g.full_name.split(' ')[0])}>
                  <Avatar name={g.full_name} kind={adultKind(g.relation)} color={kind === 'parent' ? 'var(--rb-blue)' : 'var(--ink-3)'} size="sm" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-h4">{g.full_name}</span><span className="block text-small font-semibold text-ink-2">{g.relation}{g.abroad ? ', lives outside India' : ''}</span></span>
                  <UserCheck className="size-5 text-accent" aria-hidden />
                </button>
              ))}
            </div>
          )
        })}
        {error && <Notice tone="danger">{error}</Notice>}
        <Notice tone="warning">Someone not on this list? Don't hand over. Call a parent first.</Notice>
      </div>
    </Sheet>
  )
}

/**
 * Who else the gate expects today (Screen Book v3: "Coming up") at their regular or changed times, with Check in or
 * Hand over for someone who arrives without the app; then who isn't in today.
 */
export function ExpectedLists({ children, onDone }: { children: SchoolChild[]; onDone: () => void }) {
  const [walkIn, setWalkIn] = useState<{ c: SchoolChild; direction: Direction } | null>(null)
  const coming = children
    .filter((c) => (c.day.state === 'expected' || c.day.state === 'here') && !c.day.trip)
    .map((c) => ({ c, direction: (c.day.state === 'here' ? 'pickup' : 'dropoff') as Direction }))
    .sort((a, b) => (a.c.day.next.at ?? 9999) - (b.c.day.next.at ?? 9999))
  const away = children.filter((c) => c.day.state === 'away')
  return (
    <>
      <section className="grid gap-2.5">
        <h2 className="kicker flex items-center gap-2 px-0.5 [&_svg]:size-4"><CalendarClock />Coming up · {coming.length}</h2>
        {coming.length ? (
          <ul className="grid gap-2.5">
            {coming.map(({ c, direction }) => (
              <li key={c.id} className="card flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl p-3 pr-3.5">
                <Avatar name={c.first} color={childColor(c.id)} kind={childKind(c.gender)} />
                <span className="min-w-0 flex-1 basis-[180px]">
                  <span className="block truncate text-h4">{c.fullName}</span>
                  <span className="block truncate text-small font-semibold text-ink-2">
                    {c.day.changed[direction] ? 'Changed today' : c.regular ? 'Regular' : 'Window'} {WORD[direction]}, {c.day.next.at !== null ? formatTime(c.day.next.at) : 'time not set'}{c.className ? ` · ${c.className}` : ''}
                  </span>
                </span>
                <Button size="md" variant="secondary" icon={direction === 'dropoff' ? <DoorOpen /> : <UserCheck />} onClick={() => setWalkIn({ c, direction })}>
                  {direction === 'dropoff' ? 'Check in' : 'Hand over'}
                </Button>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-lg bg-sunken px-4 py-3 text-small font-semibold text-ink-2">Nobody else is expected today.</p>}
      </section>
      {away.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-small font-semibold text-ink-2">
          <CalendarX className="size-4" aria-hidden />Not in today:
          {away.map((c) => <Pill key={c.id}>{c.first}, {(AWAY_LABEL[c.day.away!.status] ?? 'away').toLowerCase()}</Pill>)}
        </p>
      )}
      {walkIn && <WalkInSheet c={walkIn.c} direction={walkIn.direction} onClose={() => setWalkIn(null)} onDone={onDone} />}
    </>
  )
}
