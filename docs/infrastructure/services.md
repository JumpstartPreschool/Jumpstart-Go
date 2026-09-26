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
| Spoken announcements (studio voice) | **ElevenLabs** text-to-speech (`voice-say` function, model `eleven_multilingual_v2`), each announcement made once and kept in the private `voice-cache` bucket and on the tablet | Free plan to try (non-commercial); **Starter $6/month** for school use (commercial licence) | Free: 10,000 credits a month (about one credit per character; a new announcement is roughly 100); only new words cost credits | Medium: a US service receives announcement words (names), stated in the Privacy Policy (D43) | Kokoro and the device voice below (already the fallback) |
| Spoken announcements | **Kokoro** natural voice (open weights, Apache-2.0) made on the iPad; model from Hugging Face's CDN, runtime from jsDelivr, both cached after the first download; the device's own voice as the fallback | Free | About 330 MB once with WebGPU (iPadOS 26), 90 MB without; only while the app is on screen | Medium until tested on a real iPad (memory) | Device voice (already the fallback); a paid cloud voice (Deepgram Aura-2 on Cloudflare, needs approval) |
| Fonts | **Plus Jakarta Sans** (open-source, bundled with the app) | Free | — | None | — |
| SMS login codes | *Not used in release 1* | Paid per SMS, plus DLT registration | — | — | MSG91 when approved |
| School-sent WhatsApp | *Not used in release 1* (parent sends from their own WhatsApp) | Paid per message | — | — | Meta WhatsApp Business Platform when approved |

## Mobile sign-in codes (not set up)

No provider sends SMS codes in India for free, and TRAI's DLT rules require the school to register as a sender first. Decided 2026-09-26: keep email codes for now. When mobile sign-in is wanted, the plan is MSG91 through a Supabase "Send SMS" hook (about ₹0.15–0.25 per code, after DLT registration). Firebase phone sign-in was ruled out: it needs a Google billing account, costs about ₹6 per code in India and would add a second sign-in system.

## Gate voice: Microsoft Azure (Indian English)

Azure AI Speech, free F0 tier: 500,000 characters a month, permanent, no charge beyond it. Voice en-IN-NeerjaNeural by default (AZURE_VOICE to change, e.g. en-IN-PrabhatNeural). Announcements are short repeating sentences made once and kept, so expected use is about 175,000 characters in the first month and about 20,000 after. Secrets: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION. Preferred over ElevenLabs when both are set. Alternatives: Google Cloud TTS (1M free, needs billing on), Sarvam AI Bulbul (Indian, about ₹30 per 10,000 characters).
