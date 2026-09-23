# Environments

| | Development / pilot |
|---|---|
| Supabase project | `pwmsjcpdihwtgjreizup` (free plan) |
| Region | AWS Mumbai (ap-south-1) |
| Postgres | 17.6 |
| Migrations applied | `0001_foundation` (2026-09-24, via `supabase db push`) |
| App hosting | Cloudflare Workers static assets, `jumpstart-preschool` (production) and `jumpstart-preschool-design` (design review); waiting for the API token to get publishing permission |

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

Deploying needs a Supabase login on this machine (`npx supabase login`, once):
```
npx supabase secrets set --project-ref <project-ref> ORS_API_KEY=<key>
npx supabase functions deploy route --project-ref <project-ref> --no-verify-jwt
```
`--no-verify-jwt` because the function checks the user's session itself. `npm run check:routing` tests the key and the ETA maths from this machine.

## Auth settings (Supabase dashboard)
Required before anyone logs in (AUTH-1, AUTH-2, PRD D1):
- **Sign-ups off:** Authentication → Sign In / Providers → turn off "Allow new users to sign up". Users are created only by the admin flow.
- **Codes, not links:** the email templates use `{{ .Token }}` so people receive a 6-digit code.
- **Code lifetime:** email OTP expiry of 300 seconds.
- **Email sender:** custom SMTP (Brevo). The built-in sender is only for testing and delivers only to the project team.
