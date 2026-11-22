# Deployment

How a release reaches production, in the order that keeps every installed app working. Run on the owner's machine,
in the repository, with `.env.local` in place (Supabase URL and publishable key, Cloudflare token and account) and a
Supabase access token (`npx supabase login`). Never paste secrets into a chat or commit them.

## Release 2026-10-22: background voice, persistent duty, Attendance & Reports (migrations 0060–0063)

Branch `claude/jumpstart-background-voice-jkomjf`. The database goes first: the new app calls `my_duty`, `set_duty`,
`gate_heartbeat(p_on, p_start)`, `attendance_report`, `correct_attendance` and `log_report_export`, which exist only
after these migrations. A web deploy reaches every installed Android app at once (`capacitor.config.ts` loads the live
site), so a web-first deploy would leave every duty screen on "loading". `npm run check:queries` checks function calls
against the migration files, not the live database, so it can't catch that order mistake: follow the steps.

```bash
# 0. Get the code and check it on this machine
git fetch origin claude/jumpstart-background-voice-jkomjf
git checkout claude/jumpstart-background-voice-jkomjf
npm ci
npm run typecheck && npm test && npm run build
npm run test:db                      # needs a local Postgres 16+ (initdb on PATH); not as root

# 1. Link the project once (asks for the database password), then back up production first
set -a; . ./.env.local; set +a
npx supabase@latest login
npx supabase@latest link --project-ref pwmsjcpdihwtgjreizup
npx supabase@latest db dump --linked -f backup-before-0060.sql            # schema
npx supabase@latest db dump --linked --data-only -f backup-before-0060-data.sql

# 2. See what production already has, then preview and apply the migrations
npx supabase@latest migration list --linked
npx supabase@latest db push --linked --dry-run
npx supabase@latest db push --linked

# 3. Edge Functions: push-send (phone voice, link caching) and pronounce (the clip query fix)
npx supabase@latest functions deploy push-send --project-ref pwmsjcpdihwtgjreizup --no-verify-jwt
npx supabase@latest functions deploy pronounce --project-ref pwmsjcpdihwtgjreizup --no-verify-jwt

# 4. The web app (also what the Android app loads)
npm run deploy

# 5. The Android app (native GateVoice changes need a new APK)
npx cap sync android
cd android && ./gradlew assembleDebug && cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`--no-verify-jwt` matches how these functions are already deployed (push-send checks its own `PUSH_SECRET`; its
`/receipt` path is called by phones without a session; pronounce is called by the database). If `supabase db dump`
isn't available on the free plan for your CLI version, use `pg_dump` with the database URL from
[environments.md](environments.md#applying-migrations).

### After deploying: smoke tests (production)

1. Open https://jumpstart-go.singhankit91624.workers.dev, sign in as the admin. Attendance & Reports opens, This month
   loads in a second or two, Register opens a day, Correct this day opens the form (cancel it).
2. Downloads: Preview the executive PDF (desktop Chrome), download Excel. Admin → Audit shows two `export` rows.
3. Gate tablet (coordinator): Start duty, reload the page: still On duty. Pause, switch apps, come back: still
   Paused. Resume. End duty.
4. Send a test alert from the duty screen's delivery sheet to the Android phone with the screen off: the school's
   sound check plays.
5. A pickup "On my way" from a test parent account: the gate tablet announces it; with the tablet's screen off, the
   coordinator's Android phone says it (school voice once pronounce has made the child's clips; the phone's voice
   until then).
6. Re-queue the clips once so children added since 0053 get theirs: in the SQL editor, `select public.voice_requeue_all();`
   (or wait for the next voice version change).

### Rollback (reverse order)

Undo only what is broken; data stays (corrections history and duty columns are kept).

```bash
# Web app: redeploy the previous build from main
git checkout main && npm ci && npm run deploy
# Database, newest first, each only after the app that needs it is gone:
psql "$DATABASE_URL" -f scripts/rollback/0063_duty_routing_fixes_down.sql
psql "$DATABASE_URL" -f scripts/rollback/0062_attendance_reports_down.sql
psql "$DATABASE_URL" -f scripts/rollback/0061_persistent_duty_down.sql   # ends paused duties
psql "$DATABASE_URL" -f scripts/rollback/0060_phone_spoken_receipt_down.sql
# Then mark them reverted so a later db push reapplies them:
npx supabase@latest migration repair --linked --status reverted 0063 0062 0061 0060
```

The rollbacks are tested on a throwaway database: `DB_TESTS=scripts/rollback/verify-0060-0063.sql npm run test:db`.

### Known limits of this release

- Old app versions (a tablet that hasn't tapped Update) still start and end duty the old way: leaving the duty screen
  ends that person's duty, also one started on an updated device. Update every gate device.
- 0061 converts only duty rows of pages still running at migration time into Active duty (earlier leftovers are
  removed). On a database that applied 0061 before this change, leftovers were kept as Active: check
  `select * from app.gate_duty` once and end any that are stale with End duty.
- Background voice on Android and the iOS extension are compiled/written, not yet tested on real devices.
