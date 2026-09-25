# Notification architecture

**Status:** built 2026-09-25 (migration `0016`, Edge Function `push-send`, `public/push-sw.js`). PRD D17, D33.

## What is sent, and to whom
| Event | Who hears it | Tag (a newer one replaces the older) |
|---|---|---|
| New request, or a new time, not yet acknowledged | Coordinators of the child's class; every coordinator if nobody covers it (D11) | `trip-<id>` |
| Someone else on the way (the other parent, a logged call, a link sent) | The child's other guardians who chose "when the other parent changes something" | `trip-<id>` |
| Ready at the gate · collected · checked in | All the child's guardians | `trip-<id>` |
| Cancelled by someone else | Other guardians who chose it | `trip-<id>` |
| Handover locked after three wrong codes | The child's guardians and the admins | `lock-<id>` |
| Announcement | Its recipients (all parents or one class, with the app) | `ann-<id>` |
| The school replied in Messages | The child's guardians | `msg-<child>` |
| Absence reported by one parent | Other guardians who chose it | `abs-<child>` |
| 08:00 reminder (D17) | Guardians with it on, per child with school today and not away | `morning-<child>` |

Nobody is told about their own action. Only people on the record, with app access and at least one registered device, are queued.

## How it flows
1. Triggers on `trips`, `app.trip_links`, `announcements`, `messages` and `attendance` call `app.notify`, which writes one row per person to `app.push_outbox` (not readable through the API).
2. An insert statement asks `push-send` to run now (`pg_net`), and a once-a-minute job catches anything missed (`pg_cron`).
3. `push-send` (secret-checked) claims a batch with `push_claim` (`for update skip locked`, so two runs never send twice), sends each to every device with `web-push`, and records the result with `push_result`. A 404 or 410 from the push service deletes that device.
4. The service worker (`public/push-sw.js`, loaded into the app's worker) shows it; a tap opens the page it names, inside the app only.
5. The outbox keeps 14 days.

## Devices
- `push_subscriptions`: one row per device, owned by the person signed in on it; a shared iPad moves to whoever signs in.
- Turned on from **Account** (parents), **Start duty** (coordinators) or the account sheet (other staff), always from a tap. iPhone and iPad need the Home Screen app (iOS 16.4+); the switch says so.
- No VAPID key in the build means the switch says notifications aren't set up yet, rather than failing.

## Privacy
Lock-screen text names the child's first name and a time, never a location. The morning reminder and "other parent" alerts can be turned off per person. Provider: the browser's own push service; no third-party messaging account.
