# Environments

| | Development / pilot |
|---|---|
| Supabase project | `pwmsjcpdihwtgjreizup` (free plan) |
| Region | AWS Singapore (ap-southeast-1); database pooler aws-0-ap-southeast-1.pooler.supabase.com |
| Postgres | 17.6 |
| Migrations applied | `0001`–`0035` live; `0036`–`0039` (the collector's "I'm at the gate", the voice minute job skipping inactive children, and sign-in by mobile number with WhatsApp codes) to push with `npx supabase db push` before deploying `pronounce` and the app |
| App hosting | Cloudflare Workers static assets, `jumpstart-go` at https://jumpstart-go.singhankit91624.workers.dev (production; the old `jumpstart-preschool` address redirects there, see `scripts/old-link-redirect/`) and `jumpstart-preschool-design` (design review); waiting for the API token to get publishing permission |

## Publishing
- `npm run deploy` publishes the production app; `npm run deploy:design` publishes the design-review build with the sample-data preview. Both read `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from `.env.local` (load it first: `set -a; . ./.env.local; set +a`).
- The token needs **Account → Workers Scripts → Edit**, **Account → Account Settings → Read**, **User → User Details → Read** and **User → Memberships → Read**.
- **Temporary secure link without an account:** `VITE_DESIGN_PREVIEW=true npm run build`, then `npx vite preview --port 4173 --host 127.0.0.1` and `cloudflared tunnel --url http://127.0.0.1:4173`. The printed `https://….trycloudflare.com` address works while both are running.

## Configuration
- Local settings live in `.env.local` (git-ignored); `.env.example` lists every variable.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are public and ship in the app. Row-level security is what protects the data.
- `SUPABASE_DB_PASSWORD` is the database owner password, used only by scripts on a developer's machine. It never goes in the app, the repository or chat.

## Applying migrations
```
npx supabase@latest db push --db-url "postgresql://postgres:<url-encoded password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
```
Run `npm run test:db` first. Add `--dry-run` to see what would be applied.

The direct database address only works over IPv6. Machines without IPv6 (including GitHub Actions, used for backups) must use the Supabase connection pooler (Project Settings → Database → Connection pooling).

## Edge Functions
| Function | What it does | Secrets |
|---|---|---|
| `route` | Road route and ETA range from a position to the school, for signed-in users | `ORS_API_KEY` |
| `push-send` | Delivers queued push notifications (0016) and forgets dead devices; called by the database | `PUSH_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| `pronounce` | The gate voice (0035, D50): makes each child's announcements ahead with Azure AI Speech (minute job), and a staff member's preview or a sentence not made ahead, within the monthly cap | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `AZURE_SPEECH_VOICE`, `VOICE_CRON_SECRET`, `APP_ORIGIN` (optional) |
| `send-sms` | Supabase Auth's Send SMS hook (0039, D51): sends each sign-in code as a WhatsApp template through WATI; sends nothing for an unregistered number | `WATI_API_TOKEN`, `WATI_API_BASE_URL` (optional), `SEND_SMS_HOOK_SECRET`, `WATI_TEMPLATE_SIGNIN_CODE` (optional), `WATI_CHANNEL` (optional) |
| `password-pattern` | Admin → Settings → Email sign-in (0041, D52): saves the password pattern and sets every email account's starting password to it, or resets one person | `APP_ORIGIN` (optional); uses the built-in Supabase keys |
| `whatsapp-invite` | Admin Settings WhatsApp setup check and invitation dispatch: checks token and template statuses via WATI API | `WATI_API_TOKEN`, `WATI_API_BASE_URL` (optional), `WATI_CHANNEL` (optional), `APP_ORIGIN` (optional) |
| `wati-webhook` | Records delivered, read and failed statuses from WATI in app.whatsapp_log via webhook | `WATI_WEBHOOK_SECRET` |

Deploying needs a Supabase login on this machine (`npx supabase login`, once):
```
npx supabase secrets set --project-ref <project-ref> WATI_API_TOKEN="..." WATI_API_BASE_URL="https://live-server-XXXXX.wati.io"
npx supabase functions deploy send-sms --project-ref <project-ref> --no-verify-jwt
npx supabase functions deploy whatsapp-invite --project-ref <project-ref>
npx supabase functions deploy wati-webhook --project-ref <project-ref> --no-verify-jwt
```
`--no-verify-jwt` because the function checks the user's session itself (and `push-send` checks its secret).

### Turning on push notifications
1. `node scripts/vapid-keys.mjs` once. Put `VITE_VAPID_PUBLIC_KEY` in `.env.local` (and the publishing build); keep `VAPID_PRIVATE_KEY` only as a function secret.
2. `npx supabase secrets set --project-ref <ref> PUSH_SECRET=<long random> VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:ai@jumpstartpreschool.in`
3. `npx supabase functions deploy push-send --project-ref <ref> --no-verify-jwt`
4. In the SQL editor: enable the `pg_net` and `pg_cron` extensions, then
   `insert into app.push_config (url, secret) values ('https://<ref>.supabase.co/functions/v1/push-send', '<the same PUSH_SECRET>');`
   and re-run the `cron.schedule` blocks from `0016` and `0021` (push delivery, morning reminders and the daily clean-up of old records; they only schedule when `pg_cron` exists at migration time). `npm run check:routing` tests the key and the ETA maths from this machine.

### Turning on the gate voice (0035, D50)
Azure AI Speech, made ahead by `pronounce`; [voice-architecture.md](../architecture/voice-architecture.md) has the design and cost.
1. portal.azure.com (the school's Microsoft account; Microsoft verifies a card even for free use): Create a resource → **Speech** → Region **Central India** → Pricing tier **Free F0** → Create.
2. The resource → **Keys and Endpoint**: copy Key 1 and the region name (`centralindia`). Never paste the key into chat, the app, or git.
3. `npx supabase secrets set --project-ref <ref> AZURE_SPEECH_KEY=<key 1> AZURE_SPEECH_REGION=centralindia AZURE_SPEECH_VOICE=en-IN-NeerjaNeural VOICE_CRON_SECRET=<openssl rand -hex 32>`
4. `npx supabase db push` (0033–0035), then `npx supabase functions deploy pronounce --project-ref <ref> --no-verify-jwt`.
5. SQL editor, once: `insert into app.voice_config (url, secret) values ('https://<ref>.supabase.co/functions/v1/pronounce', '<the same VOICE_CRON_SECRET>') on conflict (id) do update set url = excluded.url, secret = excluded.secret;` With pg_cron on, the minute job from 0030 makes every child's clips over the next few minutes (Admin → a child shows Ready).
6. Remove the school computer's secrets: `npx supabase secrets unset --project-ref <ref> TTS_SERVICE_URL TTS_SHARED_SECRET TTS_ALLOWED_HOSTS`. Then stop the voice on the school Mac (`launchctl bootout gui/$(id -u)/in.jumpstartpreschool.voice-watch`, and quit the uvicorn and cloudflared processes).
7. On a coordinator's iPad: Start duty; the sound check should be in the new voice. Speaker → Play a test.

## Auth settings (Supabase dashboard)
Required before anyone logs in (AUTH-1, AUTH-2, PRD D1, D51, D52). The main sign-in is a mobile number and a 6-digit code sent on WhatsApp. Parents and family with an email on their record can also sign in with it and a password from the admin's pattern; staff always use the mobile code. Applying 0041 removes every password set before it. Nothing in the app sends email.
- **Sign-ups stay on:** a person's first code creates their sign-in account (`shouldCreateUser`), and the database refuses anyone the school hasn't added (0002, 0039). Turning sign-ups off would stop every first sign-in.
- **Phone provider on:** Authentication → Sign In / Providers → Phone: enable it. Phone OTP Length **6** (the app has exactly six boxes), OTP Expiration **300** seconds, and leave the SMS rate limit at its default (one request per number a minute; the app tolerates it). Leave "Enable phone confirmations" on. The SMS provider list can stay empty: the hook below delivers the code.
- **Send SMS hook:** Authentication → Auth Hooks → Send SMS hook → type **HTTPS** → URL `https://<ref>.supabase.co/functions/v1/send-sms` → Generate secret. Copy the generated secret (`v1,whsec_…`) into the function secret `SEND_SMS_HOOK_SECRET`, then save the hook.
- **Email provider on, for passwords only:** Sign In / Providers → Email: turn it on and leave **Confirm email** on (the school's accounts are made already confirmed; anyone else's sign-up is refused by the database, 0041). Remove any custom SMTP (Project Settings → Authentication → SMTP settings): nothing sends email. Leave **Secure password change** off, so people can choose their own password right after signing in with the starting one.
- **Password rules:** Authentication → Sign In / Providers → Email → Minimum password length **8**, matching the app. If you add character rules there, make the admin's pattern meet them too.
- **password-pattern function:** `npx supabase functions deploy password-pattern --project-ref <ref>`. It uses only the built-in Supabase keys. Then set the pattern in Admin → Settings → Email sign-in.
- **Stay signed in:** Authentication → Sessions: leave **Time-box user sessions** and **Inactivity timeout** unset (both are Pro-plan options and default to off). People stay signed in until they tap Sign out; the app keeps the session fresh by itself.
- **Invitations (0020, D51):** set the app's https address in Admin → Settings. Once the app has its address, set `APP_ORIGIN` (for example `https://app.jumpstartpreschool.in`) so only the app can call `password-pattern` and `route`. Invitations go from the admin's own phone, on WhatsApp or by SMS.

### Turning on WhatsApp through WATI
1. **Templates.** In WATI → Broadcast → Template Messages → New, create the sign-in template with a *positional* parameter (`{{1}}`) and submit it to Meta. Use these names exactly, or set the matching secret.

   | Name (secret that overrides it) | Category | Parameters |
   |---|---|---|
   | `jumpstart_signin_code` (`WATI_TEMPLATE_SIGNIN`) | Authentication, or Utility if WATI doesn't offer a code button | 1 = the 6-digit code |

   Wait until it shows APPROVED.
2. **Secrets.** WATI → API Docs shows the API endpoint and Bearer token. Then:
   `npx supabase secrets set --project-ref <ref> WATI_API_TOKEN=<token> SEND_SMS_HOOK_SECRET=<v1,whsec_… from the hook> WATI_WEBHOOK_SECRET=$(openssl rand -hex 32) APP_ORIGIN=<https address>`
   Optional: `WATI_API_BASE_URL` (default `https://live-mt-server.wati.io`; use the endpoint WATI shows for your account if it differs), `WATI_CHANNEL` (only if the account has several WhatsApp numbers), and `WATI_TEMPLATE_SIGNIN` above. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are built in. None of these ever goes in the app, `.env.local` copies in git, or chat.
3. **Deploy.** `npx supabase db push` (0039), then:
   ```
   npx supabase functions deploy send-sms --project-ref <ref> --no-verify-jwt
   npx supabase functions deploy password-pattern --project-ref <ref>
   npx supabase functions deploy wati-webhook --project-ref <ref> --no-verify-jwt
   ```
   `send-sms` and `wati-webhook` take no user session, so they check their own secret (the hook signature, and `?key=`). `password-pattern` keeps JWT verification on and only works for an admin.
4. **Webhook.** WATI → Webhooks → Add: URL `https://<ref>.supabase.co/functions/v1/wati-webhook?key=<the same WATI_WEBHOOK_SECRET>`, status Enabled. WATI doesn't sign webhooks, so the key in the URL is the check. Tick these events: **Template Message Sent**, **Message Delivered** (sent message), **Message Read** (sent message) and **Template Message Failed**. They fill the delivery log that Admin → Settings summarises.
5. **Check.** Admin → Settings → WhatsApp: "Check WhatsApp setup" confirms the token and shows each template's status without sending anything. Then sign in with a registered number and confirm the code arrives on WhatsApp.

Delivery log: `app.whatsapp_log` holds the number, template, status and failure category for each message, never a code. Rows older than 90 days are purged daily (pg_cron).
