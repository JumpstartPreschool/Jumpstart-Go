# Services

Free-first. Every external provider sits behind an interface so it can be replaced. **Nothing paid is used without the owner's approval.** Limits were checked against the providers' published plans on 2026-09-24; re-check before launch.

| Need | Service | Cost | Free-plan limits that matter | Risk | Alternative |
|---|---|---|---|---|---|
| Hosting the app | **Cloudflare Workers static assets** (Cloudflare's successor to Pages) | Free | Commercial use allowed; static files are free and unmetered | Low | Cloudflare Pages, Netlify free |
| Database, auth, realtime, functions, cron | **Supabase**, Singapore region (ap-southeast-1) | Free | 500 MB database; 50,000 monthly active users; 200 concurrent realtime connections; 500,000 edge-function calls a month; **pauses after 7 days without activity; no automatic backups** | Medium: backups and pausing | Supabase Pro ($25/month, needs approval); self-hosted Postgres |
| Backups | **Nightly `pg_dump` from GitHub Actions**, encrypted, stored in Cloudflare R2 | Free | R2: 10 GB storage free | Low once tested; restore is rehearsed monthly | Supabase Pro backups |
| Sign-in codes and invitations on WhatsApp | **WATI** (WhatsApp Business API provider): the `send-sms` Auth hook sends each sign-in code, `whatsapp-invite` sends invitations, `wati-webhook` records delivery | **Paid.** WATI plan fee plus Meta's per-conversation WhatsApp pricing (owner approved on 2026-10-02) | WATI Growth plan: 30 messages per 10 seconds; one code is one conversation | Medium: every template must be approved by Meta first, and a rejected or paused template stops sign-in until it is fixed. Codes cost per person who signs in, so people staying signed in keeps the bill low | Gupshup, Interakt or AiSensy (same WhatsApp channel); MSG91 SMS (needs DLT registration) |
| Pickup links, and the invitation fallback, by SMS or WhatsApp | The admin's or parent's own phone (`sms:` and `wa.me` links) | Free | None | None | Automatic SMS needs DLT registration in India and a paid provider (for example MSG91) |
| Map tiles | **OpenFreeMap** vector tiles with MapLibre GL | Free | No key; attribution required | Low–medium (community service) | Protomaps file on R2; MapTiler free plan |
| Routing and ETA | **OpenRouteService** (key set up 2026-09-24; server side only) | Free | About 2,000 directions a day on the free plan; responses also carry a per-window rate limit (200 when checked) | Low at a few hundred a day | OSRM self-hosted |
| Web push | Browsers' own push services (Apple, Google, Mozilla), signed with the school's VAPID key; sent by the `push-send` Edge Function | Free | iPhone and iPad only from the Home Screen app (iOS 16.4+) | Low | Messages on WhatsApp for the same events |
| Spoken announcements | **Microsoft Azure AI Speech**, Free F0 resource, Indian English female neural voice (`AZURE_SPEECH_VOICE`, default `en-IN-NeerjaNeural`), region Central India; each child's announcements made ahead by the `pronounce` function and kept in the private `voice-audio` bucket and on each iPad | Free: 0.5 million neural characters a month on F0 (no charge on F0; the account needs a verified card) | The database stops at 450,000 characters a month (`voice_count`); about 75,000 to make every child's clips once, then only changes | Low: clips already made keep playing; if Azure is unavailable the iPad's own Indian English voice speaks | Google Cloud Chirp 3 HD (1M characters free, needs billing enabled); Sarvam Bulbul |
| Fonts | **Plus Jakarta Sans** (open-source, bundled with the app) | Free | — | None | — |

## Azure AI Speech: confirmed facts (checked 2026-09-29)

- **Free tier:** "Neural 0.5 million characters free per month" on the Free (F0) tier. ([pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/))
- **en-IN female neural voices:** Aarti, Aashi, Ananya, Kavya, Neerja (plus "Indic" variants and HD voices). Male: Aarav, Arjun, Kunal, Prabhat, Rehaan. ([language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support))
- **Request:** `POST https://<region>.tts.speech.microsoft.com/cognitiveservices/v1`, headers `Ocp-Apim-Subscription-Key`, `Content-Type: application/ssml+xml`, `X-Microsoft-OutputFormat` (we use `audio-24khz-48kbitrate-mono-mp3`), `User-Agent`; body SSML. 429 means the quota or rate was exceeded. ([REST API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech))
- **Data:** "Microsoft doesn't retain or store the text that you provide with the real-time synthesis text to speech API", and doesn't store the output audio. ([data, privacy and security](https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security))

## WhatsApp sign-in codes through WATI (decided 2026-10-02)

Sign-in is the person's mobile number and a 6-digit code. Supabase Auth makes and checks the code. Its Send SMS hook calls the `send-sms` function, which sends the code as a WhatsApp template message through WATI. No code is ever stored; the delivery log keeps only the number, the template and the status, and is purged after 90 days.

- **Cost:** paid, approved by the owner on 2026-10-02. WATI charges a plan fee, and Meta charges per conversation on top. People stay signed in until they tap Sign out, so a code is needed mostly once per person and device.
- **Templates:** one, approved by Meta before first use: `jumpstart_signin_code`. Authentication-category templates are approved fastest. If it is rejected or paused, WhatsApp codes stop (email and password sign-in keeps working); the Settings check shows its status. Invitations go from the admin's own phone, so they need no template.
- **Alternatives:** SMS through MSG91 needs DLT registration and costs about ₹0.15 to ₹0.25 a code. Firebase phone sign-in was ruled out: it needs a Google billing account, costs about ₹6 per code in India and adds a second sign-in system.
- **Facts used** (docs.wati.io v3, read 2026-10-02): `POST /api/ext/v3/messageTemplates/send` with a Bearer token answers 200 when WATI accepts a message, which is not the same as delivered. Delivery comes later through the webhook. Limit 30 requests per 10 seconds on the Growth plan.

## Email and password sign-in (decided 2026-10-03)

The second way in, for anyone whose record has an email (PRD D52). It is Supabase Auth's own password sign-in: no email is sent, so there is no email provider and nothing to pay. The admin's pattern sets the starting passwords through the `password-pattern` function, which calls the Supabase Auth admin API with the service role key (built into Edge Functions, never sent to the browser).

- **Cost:** free (Supabase Auth on the current plan).
- **Limits:** Supabase Auth's own sign-in rate limits apply to password attempts.
- **Brevo:** removed. No email provider, SMTP sender or email template remains.
