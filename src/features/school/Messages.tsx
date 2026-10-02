import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, MessageSquare, Send } from '../../ui/icons'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { EmptyState, ErrorState, Notice, SkeletonList } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { childColor } from '../../ui/childColor'
import { supabase } from '../../lib/supabase'
import { AreaShell } from '../auth/AreaShell'
import { useSession, type Area } from '../auth/session'
import { explainDbError } from '../admin/api'
import { clockTime } from '../trips/rules'
import { markRead, sendMessage, useLive, type Message } from './api'

const ROLE_LABEL: Record<Message['sender_role'], string> = { parent: 'parent', family: 'family', admin: 'admin', core: 'head office', pro: 'front desk' }
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })

/** One child's conversation: bubbles by day, the reader's own on the right, and a box to write (Screen Book). */
export function Thread({ childId, mine, footnote }: { childId: string; mine: (m: Message) => boolean; footnote: string }) {
  const toast = useToast()
  const { rows, error, reload } = useLive<Message>('messages', () => supabase.from('messages').select('*').eq('child_id', childId).order('created_at'), [childId])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  // Reading the conversation marks it read; new messages scroll into view.
  useEffect(() => {
    if (!rows) return
    void markRead(childId).catch(() => {})
    end.current?.scrollIntoView({ block: 'end' })
  }, [rows?.length, childId])

  async function send() {
    const body = text.trim()
    if (!body) return
    setBusy(true)
    try {
      await sendMessage(childId, body)
      setText('')
      await reload()
    } catch (e) {
      toast(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorState title="Couldn't load the messages" onRetry={() => void reload()}>Check your connection and try again.</ErrorState>
  const days = rows ? [...new Set(rows.map((m) => dayLabel(m.created_at)))] : []
  return (
    <div className="grid gap-3">
      <div className="card grid max-h-[min(62dvh,640px)] gap-2 overflow-y-auto overscroll-contain rounded-2xl p-4" aria-live="polite" aria-busy={!rows}>
        {!rows ? <div className="h-40 animate-pulse rounded-lg bg-sunken" /> : rows.length === 0 ? (
          <p className="py-10 text-center text-body text-ink-2">No messages yet.</p>
        ) : days.map((d) => (
          <div key={d} className="grid gap-2">
            <p className="justify-self-center rounded-full bg-sunken px-3 py-1 text-caption font-bold text-ink-2">{d}</p>
            {rows.filter((m) => dayLabel(m.created_at) === d).map((m) => {
              const me = mine(m)
              return (
                <div key={m.id} className={`grid max-w-[80%] gap-0.5 rounded-2xl px-3.5 py-2.5 ${me ? 'justify-self-end rounded-br-md bg-accent text-on-accent' : 'justify-self-start rounded-bl-md bg-sunken'}`}>
                  {!me && <span className="text-caption font-bold text-ink-2">{m.sender_name.split(' ')[0]}, {ROLE_LABEL[m.sender_role]}</span>}
                  <span className="whitespace-pre-wrap text-body [overflow-wrap:anywhere]">{m.body}</span>
                  <span className={`justify-self-end text-caption font-semibold tabular-nums ${me ? 'opacity-80' : 'text-ink-3'}`}>{clockTime(m.created_at)}</span>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void send() }}>
        <label className="input min-w-0 flex-1">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Write a message" aria-label="Message" enterKeyHint="send" />
        </label>
        <Button type="submit" size="lg" icon={<Send />} aria-label="Send" loading={busy} disabled={!text.trim()} />
      </form>
      <p className="text-caption font-semibold text-ink-3">{footnote}</p>
    </div>
  )
}

interface Kid { id: string; full_name: string; preferred_name: string | null; gender?: string | null }

/**
 * The office's Messages (Screen Book v3: core team, front desk, admin): one conversation per child with the family, the
 * newest first, marked when the family is waiting for a reply.
 */
export function OfficeMessages({ area }: { area: Area }) {
  const { state } = useSession()
  const myId = state.status === 'signed-in' ? state.me?.profile_id : undefined
  const [kids, setKids] = useState<Kid[] | null>(null)
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(window.location.search).get('child'))
  const messages = useLive<Message>('messages', () => supabase.from('messages').select('*').order('created_at'), [])
  const reads = useLive<{ child_id: string; read_at: string }>('message_reads', () => supabase.from('message_reads').select('child_id, read_at'), [open])
  useEffect(() => { void supabase.from('children').select('id, full_name, preferred_name, gender').eq('active', true).order('full_name').then(({ data }) => setKids((data ?? []) as Kid[])) }, [])

  const kid = kids?.find((k) => k.id === open)
  const list = kids && messages.rows ? kids.map((k) => {
    const mine = messages.rows!.filter((m) => m.child_id === k.id)
    const last = mine.at(-1)
    const read = reads.rows?.find((r) => r.child_id === k.id)?.read_at
    return { k, last, waiting: !!last && (last.sender_role === 'parent' || last.sender_role === 'family') && (!read || read < last.created_at) }
  }).sort((a, b) => (b.last?.created_at ?? '').localeCompare(a.last?.created_at ?? '')) : null
  const waitingCount = list?.filter((x) => x.waiting).length ?? 0

  // Phones: the list, or one conversation. Wide screens: both side by side.
  return (
    <AreaShell area={area} title="Messages" subtitle={waitingCount ? `${waitingCount} ${waitingCount === 1 ? 'family is' : 'families are'} waiting for a reply.` : 'One conversation per child.'}>
      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]">
        <section className={`lg:sticky lg:top-24 ${kid ? 'max-lg:hidden' : ''}`} aria-busy={!list} aria-label="Conversations">
          {messages.error ? <ErrorState title="Couldn't load the messages" onRetry={() => void messages.reload()}>Check your connection and try again.</ErrorState>
            : !list ? <SkeletonList count={5} className="grid gap-2.5" />
            : list.length === 0 ? <EmptyState title="No children yet">Conversations appear here once children are added.</EmptyState>
            : (
              <ul className="grid gap-2 lg:max-h-[calc(100dvh-220px)] lg:overflow-y-auto lg:pr-1">
                {list.map(({ k, last, waiting }) => (
                  <li key={k.id}>
                    <button type="button" onClick={() => setOpen(k.id)} aria-current={k.id === open || undefined}
                      className="card flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-shadow duration-150 hover:shadow-[var(--shadow-lift)] aria-[current]:shadow-[inset_0_0_0_2px_var(--accent)]">
                      <Avatar name={k.preferred_name ?? k.full_name} color={childColor(k.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-h4">{k.full_name}</span>
                        <span className={`block truncate text-small ${waiting ? 'font-bold text-ink' : 'font-semibold text-ink-2'}`}>
                          {last ? `${last.sender_role === 'parent' || last.sender_role === 'family' ? last.sender_name.split(' ')[0] : 'School'}: ${last.body}` : 'No messages yet'}
                        </span>
                      </span>
                      {last && <span className="text-caption font-bold text-ink-2 tabular-nums">{clockTime(last.created_at)}</span>}
                      {waiting && <span className="size-2.5 shrink-0 rounded-full bg-accent" aria-label="Waiting for a reply" />}
                      {!last && <MessageSquare className="size-5 shrink-0 text-ink-3" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          {list && <Notice className="mt-4">The gate team doesn't read messages; they hear the gate.</Notice>}
        </section>

        <section className={kid ? '' : 'max-lg:hidden'} aria-label="Conversation">
          {kid ? (
            <div className="card grid gap-4 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <Button size="md" variant="quiet" icon={<ChevronLeft />} className="lg:hidden" aria-label="All conversations" onClick={() => setOpen(null)} />
                <Avatar name={kid.preferred_name ?? kid.full_name.split(' ')[0]!} color={childColor(kid.id)} />
                <h2 className="text-h2">{kid.preferred_name ?? kid.full_name.split(' ')[0]} and the school</h2>
              </div>
              <Thread childId={kid.id} mine={(m) => m.sender === myId || m.sender_role === 'core' || m.sender_role === 'pro' || m.sender_role === 'admin'}
                footnote="Chat is for everyday things. Time changes go through Today, so the gate always knows." />
            </div>
          ) : (
            <div className="grid min-h-[360px] place-items-center rounded-2xl border-2 border-dashed border-line p-8 text-center">
              <div className="grid justify-items-center gap-2">
                <MessageSquare className="size-10 text-ink-3" aria-hidden />
                <p className="text-h4">Choose a conversation</p>
                <p className="max-w-[36ch] text-small font-semibold text-ink-2">Families waiting for a reply have a red dot and are at the top.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </AreaShell>
  )
}
