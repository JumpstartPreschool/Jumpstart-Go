# Contributing to Jumpstart Go

Jumpstart Go runs a real school gate. A change that breaks sign-in, the gate queue or announcements stops pickups, so every change goes through a pull request with green checks and a review.

## Branches

Branch from `main` and name the branch after the change:

| Prefix | Use |
|---|---|
| `feat/` | New behaviour, e.g. `feat/late-pickup-reminder` |
| `fix/` | A bug, e.g. `fix/duty-sound-after-lock` |
| `refactor/` | Structure without behaviour change |
| `docs/` | Documentation only |
| `chore/` | Tooling, dependencies, cleanup |

Never push directly to `main` and never force-push a shared branch.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary` in the imperative, for example `fix(duty): keep sound on after a reopened screen`. One logical change per commit. Explain the why in the body when the diff doesn't make it obvious.

## Before opening a pull request

```bash
npm run typecheck
npm test
npm run test:db      # needs PostgreSQL 18
npm run build
```

- Add or update tests for changed behaviour. Database permissions get SQL tests in `supabase/tests`.
- A schema change is a new numbered migration in `supabase/migrations`, plus a rollback script in `scripts/rollback/` when the change is risky. Never edit an applied migration.
- Run `npm run check:queries` against a project with the new migration when you change a query or the schema.
- Update the docs your change makes wrong: the [PRD](docs/product/prd.md) for product decisions, `docs/architecture/` for design, [deployment.md](docs/infrastructure/deployment.md) for release steps.
- Check UI changes on a phone width and a tablet width. `npm run dev:demo` gives you demo data.

SQL test files run in byte order, and later files depend on data from earlier ones, so a new file needs a longer `zz_` prefix.

### Manual checks

These depend on real devices or services and have no automated test:

- **Gate sound and voice:** start duty on a tablet, send a trip from **Demo: act as a parent**, and confirm the chime and announcement. `/scripts/qa/voice-lag/` on `npm run dev` measures voice start time.
- **Phone widths:** `node scripts/qa/width.cjs` (needs `npm run dev` on port 5173 and a local Chrome).
- **Android:** screen-off announcements need the APK on a real phone ([android-app.md](docs/architecture/android-app.md)).
- **iOS:** the extension in `native-ios/` has not been built yet ([ios-app.md](docs/architecture/ios-app.md)).
- **WhatsApp, web push and Azure speech** are covered by mocked handler tests; real delivery is confirmed only on a configured project.

## Pull requests

Start the description with what changes for parents or staff, then the technical summary, then a test plan of checks a reviewer can repeat. Call out migrations, new secrets, Edge Function deploys and anything that changes the release order.

A pull request merges when:

1. CI is green (typecheck, unit tests, build, database tests).
2. At least one maintainer has reviewed it.
3. Migrations and deploy steps are listed in the description.

Merging does not deploy. A maintainer releases by following [deployment.md](docs/infrastructure/deployment.md).

## Data and secrets

- Never commit `.env.local`, database dumps, exports, logs or screenshots with real names, phone numbers or messages. Use demo mode or invented test data.
- Never put a secret in a `VITE_` variable; it is bundled into the browser. Server secrets are Supabase Edge Function secrets.
- Report security issues privately, as described in [SECURITY.md](SECURITY.md).
