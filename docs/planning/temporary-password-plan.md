# Plan: temporary passwords from the admin's pattern builder (D55, replaces the pattern part of D52)

Status: **approved by the owner 2026-10-04**, with the refinements under "Owner's final edits".

Owner, 2026-10-04: email and password is the second way to sign in, and it is open to everyone with an email, staff
included. The admin builds one pattern from blocks; every pattern has a random part; it makes only **temporary**
passwords, shown once, which expire and must be swapped for the person's own at first sign-in. One builder for everyone
(the old deterministic pattern goes). Lockout after failed tries uses the free route. Per-role patterns use the app's
existing roles. The owner's own first password is issued with the service role key once this is live.

## Functional DAG

```text
 INPUTS                          BUILD                                        INTEGRATE                          VERIFY
 ──────────────────────────────  ───────────────────────────────────────────  ─────────────────────────────────  ─────────────────────────
 owner's spec (2026-10-04) ────► 0048: password_policy, password_patterns,  ─┐
                                 profiles.email_sign_in none|temporary|own,  │
 0041 (pattern, email_sign_in) ► temp_expires_at, locked_until, failures,    ├─► password-admin function:     ─┐
                                 password_history + trigger, reuse check,    │   save policy, save pattern,    │
                                 access-token hook (lock, expiry), drop 0041 │   issue temporary password      │
                                 pattern table and RPCs                      │   (create or update auth user)  │
                                                                             │                                 ├─► npm test
 Web Crypto getRandomValues ───► _shared/passwordPattern.ts: blocks, policy ─┤─► password-auth function:      ─┤   npm run test:db
                                 validation (random part, length, classes,   │   sign in (counts failures,     │   npm run build
                                 entropy), generator, preview (shared with   │   locks), change password       │   deno check
                                 the app)                                    │   (policy + reuse, ends other   │   browser run on demo
                                                                             │   sessions)                     │   live: owner's temp
 Settings, LoginScreen, ───────► app: Settings → Authentication (rules card, ─┘─► demo backend follows the     ─┘   password → choose own →
 ChoosePasswordScreen,           builder with move controls and live preview,     same rules                        Admin opens
 PasswordSheet                   per-role tabs), Generate new temporary
                                 password on a person, password shown once,
                                 first-login screen with the rules
```

## Owner's final edits (2026-10-04)

1. Parents and family never get a temporary password automatically. Email sign-in is created for them only when the
   admin turns it on for that person ("Email sign-in" on their page). Staff with an email get one when the admin adds
   them, and the admin can issue a new one at any time.
2. A live strength meter sits beside the preview: Weak (refused, with the reason), Acceptable (24 to 39 bits of
   randomness) or Strong (40 bits or more).
3. Saving or changing a pattern never touches anyone's password. A pattern is used only when a temporary password is
   issued.
4. Recommended default pattern: `[EMAIL_FIRST:4] + [RANDOM_UPPER:2] + [RANDOM_NUMBER:4] + [RANDOM_SPECIAL:1]`.
5. The admin can issue a temporary password, or turn email sign-in off, which clears it. They can never see, read
   back or set anyone's own password.
6. A lock affects password sign-in only. WhatsApp-code sign-in is never affected.

## As built (2026-10-04): where it differs from the plan above

- **No sign-in proxy.** The app signs in with Supabase Auth directly and reports a wrong password through
  `password_sign_in_failed`; the token hook refuses locked, off and expired accounts. A proxy function would have been no
  stronger (a direct call skips either) and would have put every email sign-in behind one IP's rate limit.
- **Function names.** The issuing function keeps the name `password-pattern` (no old function to delete); the change
  function is `password-change`. Saving the rules and patterns are database calls that repeat the checks
  (`app.pattern_problem`), following 0042's precedent.
- **Security review fixes in 0048.** A password set outside the app never turns email sign-in on (`'none'` stays
  `'none'`); recovery links, magic links, invites and email changes are refused by the hook; locked and off answer
  exactly like a wrong password; an active lock is never extended; `profiles.user_id` and the password columns can't be
  written directly, on insert or update.
- **Email fields.** No admin form had an email field (D51 removed them). Add staff and Edit staff, and Edit on a parent
  or relative, now have an optional email.

## Decisions (made here, low impact)

| Topic | Decision | Why |
|---|---|---|
| Hashing | Supabase Auth stores only a bcrypt hash (`auth.users.encrypted_password`). We add no second hashing layer and never store the plaintext. | Already true; a second layer adds nothing. |
| Randomness | `crypto.getRandomValues` with rejection sampling (no modulo bias), in the edge function. `Math.random` is banned in the module, and a test greps for it. | Deno has no Node `crypto.randomInt`; Web Crypto is the CSPRNG there. |
| Weak patterns | Refused unless: at least one `RANDOM_*` block; at least **24 bits** of randomness from the random blocks (e.g. 2 capitals + 4 digits + 1 symbol is about 26 bits); shortest possible length ≥ the policy minimum; longest ≤ the policy maximum and ≤ 72 bytes (bcrypt's limit); every character class the policy requires is guaranteed by a block (`RANDOM_LETTER` guarantees neither case). Each refusal names the reason, e.g. "Passwords would be only 6 characters; the rules need 10." | "Has a random part" alone allows `[EMAIL_FIRST:9][RANDOM_NUMBER:1]`, 10 guesses. With the lockout and 48-hour expiry, 24 bits is far out of reach. |
| Name blocks | `FIRST_NAME`, `LAST_NAME` from the person's name; `EMAIL_FIRST`, `EMAIL_LAST` from the email's first and last word before the @. Accents are removed and only A–Z kept, lower case. If a name gives fewer letters than asked, the rest are random lower-case letters. | Passwords stay typeable on any keyboard; a short name never shortens the password. |
| Specials | `!@#$%&*?-_+=` (12). No quotes, spaces or look-alikes. | Easy to read out and type on a phone. |
| Bulk | Saving a pattern **no longer** resets everyone. Temporary passwords are issued one person at a time (staff when added with an email, parents and family only when the admin turns email sign-in on, or "Generate new temporary password"). | Each password must be shown once to the admin; hundreds at once can't be. |
| Who may be issued one | The admin, for anyone active with app access and an email, except themselves (they use Change password). | Two owners hold Admin; a self-reset path would be a bypass. |
| Per-role patterns | One default pattern plus optional ones for Admin, Core team, Center Leader, Coordinator, Front desk, and Parents and family. Someone with several roles gets the most senior role's pattern (Admin, Core team, Center Leader, Coordinator, Front desk). | Matches the app's real roles (owner). |
| Order controls | Move earlier and Move later buttons on each block; no drag and drop. | The spec allows either; buttons work with screen readers and need no new dependency. |
| Lockout scope | A lock stops **password** sign-ins only. The WhatsApp code still works, and is the way back in. | A stranger guessing passwords must not be able to lock staff out of the gate. |

## Policy (Settings → Authentication → Password rules)

Defaults: minimum 10, maximum 64, upper, lower, number and special required, temporary password valid 48 hours,
force change on first sign-in on, no reuse of the last 5 passwords, 5 failed tries then locked 15 minutes. Limits
the admin can set: minimum 10–64; maximum up to 72; expiry 1–168 hours; reuse 0–24; failed tries 3–20; lock 1–1440
minutes. "Force change on first sign-in" is shown on and fixed: a temporary password that never had to change would
be a permanent password the admin knows.

## How it works

1. **Database `0048`** (replaces the pattern part of `0041`):
   - **Tables:** `password_policy` (one row) and `password_patterns` (scope `default` or a role or `family`, blocks as
     JSON). Both are admin-only, saved through audited RPCs that re-run the validation in SQL.
   - **Person columns:** `profiles.email_sign_in` becomes `none | temporary | own`; any `pattern` rows become `none` and
     their passwords are cleared. New columns `temp_password_expires_at` and `locked_until`.
   - **Failures and history:** `app.password_failures` (email key and time; purged after 1 day). `app.password_history`
     (user and old bcrypt hash; the newest N are kept), filled by the `password_changed` trigger. Comparisons use
     `pgcrypto`'s `crypt()`, which ships with Supabase.
   - **Drops:** `password_pattern`, `admin_save_password_pattern`, `admin_password_target`, `app.pattern_eligible`.
2. **Custom Access Token hook** (a Postgres function; this hook is on the free plan). For a password sign-in, it
   refuses a session when the account is locked, or when the password is temporary and past its expiry. It doesn't
   touch WhatsApp-code sessions.
3. **`password-admin` function** (the rebuilt `password-pattern`, as the admin):
   - **Saving:** `save_policy` and `save_pattern`.
   - **`issue`:** loads the person's pattern, policy and name; generates the password; creates or updates their auth
     user; marks them `temporary` with the expiry; returns the password once. It's never logged or stored.
4. **`password-auth` function** (no admin needed):
   - **`sign_in`:** checks the lock; asks Supabase Auth for a session with the email and password; on failure it
     records the try and locks after N. It always gives the same neutral message: "That email and password don't
     match, or this account is locked for now."
   - **`change`** (signed in): checks the policy and the last N hashes, sets the password, marks `own`, and signs out
     the person's other sessions.
5. **App:**
   - **Settings → Authentication:** the Password rules card and Temporary passwords. That screen has the per-role
     tabs, the block list (Add block, Remove, Move earlier, Move later, a count for each block, Fixed text), a
     one-line summary ("Email first 4 → Random capitals 2 → Random digits 4 → Symbol 1"), a live preview from a
     made-up address, Save pattern, Restore recommended pattern, and the note "This pattern is used only for temporary
     passwords. Everyone must create their own password after their first sign-in."
   - **Adding a staff member with an email** issues the temporary password and shows it once, with Copy and its
     expiry. A person's page has an "Email sign-in" switch (on issues one, off clears it) and "Generate new
     temporary password", which replaces "Reset to the pattern".
   - **Strength meter** beside the preview: Weak with the reason, Acceptable, or Strong.
   - **Sign-in:** the login screen signs in through `password-auth`. The choose-password screen lists the rules and
     uses `change`.
   - **Demo backend:** `demo.ts` follows the same rules.

## Limits we accept (written down, not hidden)

- **The failure counter only sees the app.** Someone calling Supabase's sign-in API directly, outside the app, skips
  our counter. They still meet Supabase's own rate limits, and a locked or expired account still can't get a session,
  because the token hook refuses it. Supabase's Password Verification Attempt hook would see every try, but it needs
  the Team plan (paid).
- **Reuse is checked in the app's change flow.** A direct call to Supabase's change-password API skips the reuse check.
  Supabase's own password requirements (minimum length and character classes) are set to match the policy's floor, so
  they still apply there.

## Owner steps after deploy

1. **Supabase → Authentication → Hooks:** turn on Custom Access Token and point it at `public.access_token_hook`.
2. **Supabase → Authentication → Providers → Email:** set the minimum password length to 10, and require upper case,
   lower case, numbers and symbols.
3. **Deploy:** run the migration and the two functions (commands in environments.md).

## Checks

- **Unit tests:** every block, every refusal reason, the entropy sum, that no generated password breaks the policy
  across 10,000 runs, that there's no modulo bias, and that `Math.random` never appears.
- **Handler tests:** `password-admin` and `password-auth` with fakes, covering a lock after N failures, a neutral
  message, an expired temporary password, reuse refused, and the admin issuing for themselves refused.
- **SQL tests:** admin-only policy and pattern, SQL validation, the history trigger, the token hook's answers, and
  that nobody else can read the failures table.
- **Builds and browser:** `npm run build`, `deno check`, and a browser run on the demo (builder, preview, issue
  shown once, first sign-in, lock).
- **Live:** the owner's temporary password is issued with the service role key, then sign-in, choose your own
  password, and Admin opens.
