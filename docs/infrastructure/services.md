# Services

Free-first. Every external provider sits behind an interface so it can be replaced. **Nothing paid is used without the owner's approval.** Limits were checked against the providers' published plans on 2026-09-24; re-check before launch.

| Need | Service | Cost | Free-plan limits that matter | Risk | Alternative |
|---|---|---|---|---|---|
| Hosting the app | **Cloudflare Workers static assets** (Cloudflare's successor to Pages) | Free | Commercial use allowed; static files are free and unmetered | Low | Cloudflare Pages, Netlify free |
| Database, auth, realtime, functions, cron | **Supabase**, Singapore region (ap-southeast-1) | Free | 500 MB database; 50,000 monthly active users; 200 concurrent realtime connections; 500,000 edge-function calls a month; **pauses after 7 days without activity; no automatic backups** | Medium: backups and pausing | Supabase Pro ($25/month, needs approval); self-hosted Postgres |
| Backups | **Nightly `pg_dump` from GitHub Actions**, encrypted, stored in Cloudflare R2 | Free | R2: 10 GB storage free | Low once tested; restore is rehearsed monthly | Supabase Pro backups |
| Login and invitation email | **Brevo**: SMTP for sign-in codes (Supabase Auth), transactional API for invitations (`invite-send`) | Free | 300 emails a day across both | Low at 50 children | Resend (100 a day), Amazon SES (cheap, paid) |
| Invitations and pickup links by SMS or WhatsApp | The admin's or parent's own phone (`sms:` and `wa.me` links) | Free | None | None | Automatic SMS needs DLT registration in India and a paid provider (for example MSG91) |
| Map tiles | **OpenFreeMap** vector tiles with MapLibre GL | Free | No key; attribution required | Low–medium (community service) | Protomaps file on R2; MapTiler free plan |
| Routing and ETA | **OpenRouteService** (key set up 2026-09-24; server side only) | Free | About 2,000 directions a day on the free plan; responses also carry a per-window rate limit (200 when checked) | Low at a few hundred a day | OSRM self-hosted |
| Web push | Browsers' own push services (Apple, Google, Mozilla), signed with the school's VAPID key; sent by the `push-send` Edge Function | Free | iPhone and iPad only from the Home Screen app (iOS 16.4+) | Low | Email for the same events |
| Spoken announcements | **AI4Bharat Indic Parler-TTS** (Apache-2.0), self-hosted in `tts-service/` on an always-on school computer, reached by the `pronounce` function through a free **Cloudflare Tunnel**; clips kept in the private `voice-audio` bucket and on each gate tablet | ₹0 per announcement; no API or licence fee. **Not free to run:** the computer's electricity and upkeep, and it must stay on | Supabase Storage (1 GB free): each clip is ~10–25 KB, so about 50 children and the shared phrases take a few MB. Edge-function calls: one a minute while work waits, plus every 10 minutes (well under 500,000 a month) | Medium: the school computer is a single machine; if it's off, new names wait (made clips keep playing, and the tablet's own voice covers new sentences) | A small CPU server (e.g. Hetzner CX32, about €7/month, needs approval); any machine with an NVIDIA GPU for much faster making |
| Fonts | **Plus Jakarta Sans** (open-source, bundled with the app) | Free | — | None | — |
| SMS login codes | *Not used in release 1* | Paid per SMS, plus DLT registration | — | — | MSG91 when approved |
| School-sent WhatsApp | *Not used in release 1* (parent sends from their own WhatsApp) | Paid per message | — | — | Meta WhatsApp Business Platform when approved |

## Mobile sign-in codes (not set up)

No provider sends SMS codes in India for free, and TRAI's DLT rules require the school to register as a sender first. Decided 2026-09-26: keep email codes for now. When mobile sign-in is wanted, the plan is MSG91 through a Supabase "Send SMS" hook (about ₹0.15–0.25 per code, after DLT registration). Firebase phone sign-in was ruled out: it needs a Google billing account, costs about ₹6 per code in India and would add a second sign-in system.
