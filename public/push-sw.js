// Web push for Jumpstart Go (loaded into the app's service worker). Shows what push-send sends; a tap opens that page.

// The number on the installed app's icon while it's closed, like WhatsApp: how many notifications are waiting. The open
// app sets the exact unread count itself (notifications/Unread.tsx). Not every device supports it; that's fine.
async function syncBadge() {
  try {
    const n = (await self.registration.getNotifications()).length
    if (n > 0) await self.navigator.setAppBadge?.(n)
    else await self.navigator.clearAppBadge?.()
  } catch { /* no badge on this device */ }
}

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { body: event.data ? event.data.text() : '' } }
  // A gate alert stays on screen until someone acts on it, and buzzes in a pattern that is hard to sleep through.
  const gate = typeof d.tag === 'string' && (d.tag.startsWith('trip-') || d.tag.startsWith('duty-'))
  event.waitUntil(self.registration.showNotification(d.title || 'Jumpstart Go', {
    body: d.body || '',
    ...(gate ? { requireInteraction: true, vibrate: [300, 150, 300, 150, 600] } : {}),
    tag: d.tag,
    renotify: Boolean(d.tag),
    data: { url: typeof d.url === 'string' && d.url.startsWith('/') && !d.url.startsWith('//') ? d.url : '/' },
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  }).then(syncBadge))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(syncBadge())
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const win = open.find((c) => c.url.startsWith(self.location.origin))
    if (win) { await win.focus(); if ('navigate' in win) await win.navigate(url); return }
    await self.clients.openWindow(url)
  })())
})

// The push service rotated or expired this device's subscription: subscribe again with the same key. The app saves it
// for the signed-in person the next time PushSwitch checks (pushState), since the worker has no sign-in of its own.
self.addEventListener('pushsubscriptionchange', (event) => {
  const key = event.oldSubscription?.options?.applicationServerKey
  if (!key) return
  event.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).catch(() => {}))
})
