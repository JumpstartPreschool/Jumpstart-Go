// Web push for Jumpstart (loaded into the app's service worker). Shows what push-send sends; a tap opens that page.
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { body: event.data ? event.data.text() : '' } }
  event.waitUntil(self.registration.showNotification(d.title || 'Jumpstart', {
    body: d.body || '',
    tag: d.tag,
    renotify: Boolean(d.tag),
    data: { url: typeof d.url === 'string' && d.url.startsWith('/') && !d.url.startsWith('//') ? d.url : '/' },
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const win = open.find((c) => c.url.startsWith(self.location.origin))
    if (win) { await win.focus(); if ('navigate' in win) await win.navigate(url); return }
    await self.clients.openWindow(url)
  })())
})
