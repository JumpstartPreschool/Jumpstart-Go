# Security policy

Jumpstart Go handles information about young children, their families and school staff. We take reports about it seriously.

## Reporting a vulnerability

Please report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue, pull request or discussion about a vulnerability.

Include what you found, the steps to reproduce it and what an attacker could do with it. Please do not access, change or keep data that isn't yours, and do not test against the production app with real accounts.

We will acknowledge a report as soon as we can, keep you informed while we fix it, and credit you if you want.

## Scope

In scope: this repository's code, including the web app, database migrations and row-level security, Edge Functions and the Android wrapper.

Out of scope: third-party services the app uses (Supabase, Cloudflare, WATI, Azure, Firebase); report those to the provider.

## How the app protects data

- Access is invite only, and every table is protected by Postgres row-level security. Every state change goes through a SQL function that checks the caller's role.
- Secrets are Supabase Edge Function secrets. The browser holds only the public Supabase URL and publishable key.
- Location is shared only by someone collecting with a one-time link, and only the parent who created the link can see it.
- Sensitive actions are recorded in an audit log.

More detail: [data-protection.md](docs/security/data-protection.md).
