# Environments

| | Development / pilot |
|---|---|
| Supabase project | `pwmsjcpdihwtgjreizup` (free plan) |
| Region | AWS Singapore (ap-southeast-1); database pooler aws-0-ap-southeast-1.pooler.supabase.com |
| Postgres | 17.6 |
| Migrations applied | `0001`–`0032` live, `0033` (password sign-in), `0034` (first-sign-in codes only without a password) and `0035` (Azure voice, I've arrived) to push (pushed from the owner's terminal with `npx supabase db push`; the push needs the database password) |
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

Deploying needs a Supabase login on this machine (`npx supabase login`, once):
```
npx supabase secrets set --project-ref <project-ref> ORS_API_KEY=<key>
npx supabase functions deploy route --project-ref <project-ref> --no-verify-jwt
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
Required before anyone logs in (AUTH-1, AUTH-2, PRD D1):
- **Sign-ups stay on:** a parent's first code creates their sign-in account (`shouldCreateUser`), and the database refuses anyone the school hasn't added (0002). Turning sign-ups off would stop every first sign-in.
- **Passwords (0033, D49):** Authentication → Sign In / Providers → Email: keep Email enabled, set Minimum password length to 8 (the app checks the same) and, optionally, Password requirements to "letters and digits". Leave "Secure password change" on: the app sets passwords right after a fresh code, which it allows. Leaked-password protection needs the Pro plan; the app refuses the most common passwords itself. Cloudflare Turnstile (free) under Attack Protection is the next step if the auth logs ever show password guessing.
- **Codes, not links:** the email templates use `{{ .Token }}` so people receive a 6-digit code.
- **Sign-in code:** Authentication → Sign In / Providers → Email: Email OTP Length 6 (the app has exactly six boxes) and Email OTP Expiration 300 seconds (the app and the emails say 5 minutes).
- **Email sender:** custom SMTP (Brevo). The built-in sender is only for testing and delivers only to the project team.
- **Invitations (0020, D36):** set the app's https address in Admin → Settings. Create a Brevo API key (SMTP & API → API keys) and deploy the function: `npx supabase secrets set BREVO_API_KEY=…` then `npx supabase functions deploy invite-send`. The sender (`INVITE_FROM`, default ai@jumpstartpreschool.in) must be a verified Brevo sender. Once the app has its address, set `APP_ORIGIN` (for example `https://app.jumpstartpreschool.in`) so only the app can call `invite-send` and `route`. Without the key the Invite sheet says email isn't set up and SMS and WhatsApp still work.
- **Sign-in emails:** `supabase/templates/magic_link.html` (subject "Your Jumpstart sign-in code") and `confirmation.html` (subject "Welcome to Jumpstart: your sign-in code", anyone's first sign-in; Supabase sends it as "Confirm signup"), pasted into Authentication → Emails → Templates. They show the 6-digit `{{ .Token }}` and no link. Codes are sent only for a first sign-in and a forgotten password; everyday sign-in uses the password and sends no email. The "Reset password" template is not used (a forgotten password goes through the same code email). Editing templates needs custom SMTP on. The logo is `jumpstart-email-logo.png` in a public Storage bucket named `brand`. In Brevo, turn off "block unknown IP addresses": Supabase sends from changing IPs.
