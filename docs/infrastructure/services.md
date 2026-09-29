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
| Spoken announcements | **Microsoft Azure AI Speech**, Free F0 resource, Indian English female neural voice (`AZURE_SPEECH_VOICE`, default `en-IN-NeerjaNeural`), region Central India; each child's announcements made ahead by the `pronounce` function and kept in the private `voice-audio` bucket and on each iPad | Free: 0.5 million neural characters a month on F0 (no charge on F0; the account needs a verified card) | The database stops at 450,000 characters a month (`voice_count`); about 75,000 to make every child's clips once, then only changes | Low: clips already made keep playing; if Azure is unavailable the iPad's own Indian English voice speaks | Google Cloud Chirp 3 HD (1M characters free, needs billing enabled); Sarvam Bulbul |
| Fonts | **Plus Jakarta Sans** (open-source, bundled with the app) | Free | — | None | — |
| SMS login codes | *Not used in release 1* | Paid per SMS, plus DLT registration | — | — | MSG91 when approved |
| School-sent WhatsApp | *Not used in release 1* (parent sends from their own WhatsApp) | Paid per message | — | — | Meta WhatsApp Business Platform when approved |

## Azure AI Speech: confirmed facts (checked 2026-09-29)

- **Free tier:** "Neural 0.5 million characters free per month" on the Free (F0) tier. ([pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/))
- **en-IN female neural voices:** Aarti, Aashi, Ananya, Kavya, Neerja (plus "Indic" variants and HD voices). Male: Aarav, Arjun, Kunal, Prabhat, Rehaan. ([language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support))
- **Request:** `POST https://<region>.tts.speech.microsoft.com/cognitiveservices/v1`, headers `Ocp-Apim-Subscription-Key`, `Content-Type: application/ssml+xml`, `X-Microsoft-OutputFormat` (we use `audio-24khz-48kbitrate-mono-mp3`), `User-Agent`; body SSML. 429 means the quota or rate was exceeded. ([REST API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech))
- **Data:** "Microsoft doesn't retain or store the text that you provide with the real-time synthesis text to speech API", and doesn't store the output audio. ([data, privacy and security](https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security))

## Mobile sign-in codes (not set up)

No provider sends SMS codes in India for free, and TRAI's DLT rules require the school to register as a sender first. Decided 2026-09-26: keep email codes for now. When mobile sign-in is wanted, the plan is MSG91 through a Supabase "Send SMS" hook (about ₹0.15–0.25 per code, after DLT registration). Firebase phone sign-in was ruled out: it needs a Google billing account, costs about ₹6 per code in India and would add a second sign-in system.
