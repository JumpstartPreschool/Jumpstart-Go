// Everything on the old address moves to the same path on the new one (invite links, /t/{token} pickup links).
const NEW_ORIGIN = 'https://jumpstart-go.singhankit91624.workers.dev'

// Home Screen installs of the old address run from their service-worker cache and never see a redirect. When they
// check for an update they fetch /sw.js; this replacement clears their cache, removes itself and opens the new address.
const RETIRE = `
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) await caches.delete(key)
  await self.registration.unregister()
  for (const client of await self.clients.matchAll({ type: 'window' })) {
    const url = new URL(client.url)
    client.navigate('${NEW_ORIGIN}' + url.pathname + url.search + url.hash)
  }
})()))
`

export default {
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/sw.js') {
      return new Response(RETIRE, { headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' } })
    }
    return Response.redirect(NEW_ORIGIN + url.pathname + url.search, 301)
  },
}
