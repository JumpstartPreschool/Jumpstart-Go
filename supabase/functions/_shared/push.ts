/** A notification claimed from the outbox, with one of the person's devices (public.push_claim). */
export interface Claimed { outbox_id: number; title: string; body: string; url: string; tag: string | null; subscription_id: string; endpoint: string; p256dh: string; auth: string }

/**
 * What the phone shows (public/push-sw.js reads it): short enough for a lock screen, a same-site link only, and a tag so
 * a newer alert about the same trip replaces the older one.
 */
export function payloadFor(r: Pick<Claimed, 'title' | 'body' | 'url' | 'tag'>): string {
  const url = r.url.startsWith('/') && !r.url.startsWith('//') ? r.url : '/'
  return JSON.stringify({ title: r.title.slice(0, 120), body: r.body.slice(0, 240), url, tag: r.tag ?? undefined })
}
