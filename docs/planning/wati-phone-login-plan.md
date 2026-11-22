# Plan: phone-only sign-in with WhatsApp codes (WATI), Brevo removed

Owner decision, 2026-10-02: phone number is the only sign-in identity; codes go by WhatsApp through WATI; email is
removed from sign-in and from the app's forms (stored emails stay in the database, unused). Brevo goes completely.

## Functional DAG

```text
 INPUTS                         BUILD                                         INTEGRATE                         VERIFY
 ─────────────────────────────  ────────────────────────────────────────────  ────────────────────────────────  ──────────────────────
 Supabase phone auth + ───────► 0039: phone is the key: guard/link new auth ─┐
 Send SMS hook (docs)           users by phone, login_allowed(phone),        │
                                app access needs a mobile, copy every         ├─► LoginScreen / SetPassword:  ─┐
                                linked profile's phone into auth.users       │   phone + password, code on    │
 WATI v3 send-template ───────► _shared/wati.ts: sendTemplate(), one phone  ─┤   WhatsApp, #phone= invites    │
 (exact body from owner)        normaliser, retries (5xx/429/timeout only)   │                                 ├─► npm test
                                                                             ├─► auth-sms-hook (Send SMS hook) ┤   npm run test:db
 message log table ───────────► 0039: app.messages_log (no OTP stored),    ─┤   wati-send (invites, test)     │   npm run build
                                status from wati-webhook                     │   wati-webhook (statuses)       │   rg -i brevo = 0
 invite-send (Brevo) ─────────► delete; scripts/email-templates.ts and     ─┘   Admin forms: mobile, no email ─┘   real WhatsApp code
                                supabase/templates removed                       Settings: WhatsApp status
```

## Facts established (2026-10-02)

- Supabase: `signInWithOtp({ phone })`, `verifyOtp({ phone, token, type: 'sms' })`, `signInWithPassword({ phone, password })`.
  The **Send SMS hook** receives `{ user, sms: { otp } }`, verified with Standard Webhooks (`SEND_SMS_HOOK_SECRET`,
  prefix `v1,whsec_` stripped). Supabase still generates and checks the code; the hook only delivers it.
- auth.users stores phone without the `+` (e.g. `919220991947`).
- WATI v3: `POST https://live-mt-server.wati.io/api/ext/v3/messageTemplates/send`, Bearer token, body has
  `template_name`, `broadcast_name`, `channel` (null = default) and `recipients` (1–10,000). **The exact field names
  inside each recipient (phone and template parameters) are not readable from the docs page outside a browser: get the
  example request from https://docs.wati.io/reference/post_api-ext-v3-messagetemplates-send before writing the body.**
- Live data after the reset: staff with a mobile can sign in by phone once auth.users.phone is copied (Ankit Singh
  +919220991947, Aditya Tapadia +919822596916, Suvarna M, Sukhada Prabhune). Staff **without** a mobile (Jumpstart Baner,
  KarveRoad JS gate tablet, Vaishnavi M, Ank 2, the second Ankit Singh) can't sign in until one is added.
- Brevo is used in: Supabase Auth SMTP (dashboard), `supabase/functions/invite-send`, `supabase/templates/*`,
  `scripts/email-templates.ts`, Admin → Settings "Check email setup", docs (services.md, environments.md, README).

## Steps

1. 0039 migration: phone-keyed `app.guard_new_auth_user` / `app.link_new_auth_user`; `login_allowed(p_phone, p_purpose)`;
   `email_required` → `phone_required` in admin_save_child / admin_add_guardian / admin_update_person / import; copy
   profile phones into auth.users (phone, phone_confirmed_at); `app.message_log`. SQL tests for each.
2. `_shared/wati.ts` (+ tests: auth header, body, normalisation, 400/401/403/429/5xx/timeout, bounded retries).
3. Edge functions: `auth-sms-hook`, `wati-send`, `wati-webhook`; delete `invite-send`.
4. App: sign-in, set-password, invitations, admin and parent forms, bulk import, settings; remove email copy.
5. Remove Brevo files, env vars and docs; `rg -i 'brevo|sendinblue|smtp'` must show no live use.
6. Owner's manual steps: create and approve WATI templates; set secrets; Supabase → Auth → enable Phone, turn on the Send
   SMS hook pointing at `auth-sms-hook`, turn off custom SMTP; deploy functions.

## Templates to approve in WATI (positional parameters)

| Name | Parameters |
|---|---|
| `jumpstart_signin_code` | 1 code, 2 minutes valid. Used for first sign-in **and** password reset: the Send SMS hook only receives the code, not why it was asked for |
| `jumpstart_invitation` | 1 first name, 2 children, 3 app link |
| `jumpstart_staff_invitation` | 1 first name, 2 role, 3 app link |
