# Services

Free-first. Every external provider sits behind an interface so it can be replaced. **Nothing paid is used without the owner's approval.** Limits were checked against the providers' published plans on 2026-09-24; re-check before launch.

| Need | Service | Cost | Free-plan limits that matter | Risk | Alternative |
|---|---|---|---|---|---|
| Hosting the app | **Cloudflare Workers static assets** (Cloudflare's successor to Pages) | Free | Commercial use allowed; static files are free and unmetered | Low | Cloudflare Pages, Netlify free |
| Database, auth, realtime, functions, cron | **Supabase**, Mumbai region | Free | 500 MB database; 50,000 monthly active users; 200 concurrent realtime connections; 500,000 edge-function calls a month; **pauses after 7 days without activity; no automatic backups** | Medium: backups and pausing | Supabase Pro ($25/month, needs approval); self-hosted Postgres |
| Backups | **Nightly `pg_dump` from GitHub Actions**, encrypted, stored in Cloudflare R2 | Free | R2: 10 GB storage free | Low once tested; restore is rehearsed monthly | Supabase Pro backups |
| Login and trip-link email | **Brevo** SMTP (or Resend) | Free | Brevo: 300 emails a day; Resend: 100 a day / 3,000 a month | Low at 50 children | Amazon SES (cheap, paid) |
| Map tiles | **OpenFreeMap** vector tiles with MapLibre GL | Free | No key; attribution required | Low–medium (community service) | Protomaps file on R2; MapTiler free plan |
| Routing and ETA | **OpenRouteService** (key set up 2026-09-24; server side only) | Free | About 2,000 directions a day on the free plan; responses also carry a per-window rate limit (200 when checked) | Low at a few hundred a day | OSRM self-hosted |
| Web push | Browsers' own push services (Apple, Google, Mozilla), signed with the school's VAPID key; sent by the `push-send` Edge Function | Free | iPhone and iPad only from the Home Screen app (iOS 16.4+) | Low | Email for the same events |
| Spoken announcements | **Kokoro** natural voice (open weights, Apache-2.0) made on the iPad; model from Hugging Face's CDN, runtime from jsDelivr, both cached after the first download; the device's own voice as the fallback | Free | About 330 MB once with WebGPU (iPadOS 26), 90 MB without; only while the app is on screen | Medium until tested on a real iPad (memory) | Device voice (already the fallback); a paid cloud voice (Deepgram Aura-2 on Cloudflare, needs approval) |
| Fonts | **Plus Jakarta Sans** (open-source, bundled with the app) | Free | — | None | — |
| SMS login codes | *Not used in release 1* | Paid per SMS, plus DLT registration | — | — | MSG91 when approved |
| School-sent WhatsApp | *Not used in release 1* (parent sends from their own WhatsApp) | Paid per message | — | — | Meta WhatsApp Business Platform when approved |
