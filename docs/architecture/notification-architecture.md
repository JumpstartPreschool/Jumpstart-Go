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

Nobody is told about their own action. Only people on the record, with app access and at least one registered device (a web subscription or a phone token), are queued.

Gate alerts also repeat; see Repeating gate alerts below.

## How it flows
1. Triggers on `trips`, `app.trip_links`, `announcements`, `messages` and `attendance` call `app.notify`, which writes one row per person to `app.push_outbox` (not readable through the API).
2. An insert statement asks `push-send` to run now (`pg_net`), and a once-a-minute job catches anything missed (`pg_cron`).
3. `push-send` (secret-checked) claims a batch with `push_claim` (`for update skip locked`, so two runs never send twice; it returns one row per alert and device, `platform` being `web`, `android` or `ios`), sends each to every device (web with `web-push`; phones through Firebase Cloud Messaging), and records the result with `push_result`. A 404 or 410 from the push service deletes that device. A web alert about a trip (`trip-` tag) is held by the push service for 10 minutes at most, any other for an hour.
4. The service worker (`public/push-sw.js`, loaded into the app's worker) shows it; a tap opens the page it names, inside the app only.
5. The outbox keeps 14 days.

## Devices
- `push_subscriptions`: one row per device, owned by the person signed in on it; a shared iPad moves to whoever signs in.
- Turned on from **Account** (parents), **Start duty** (coordinators) or the account sheet (other staff), always from a tap. iPhone and iPad need the Home Screen app (iOS 16.4+); the switch says so.
- No VAPID key in the build means the switch says notifications aren't set up yet, rather than failing.

- `device_tokens`: one row per phone running the native app (`platform` android or ios), saved with `save_device_token`, moved to whoever signs in on it, removed with `delete_device_token` or when Firebase reports it unregistered (`push_forget_token`). Each person keeps their 10 newest.
- Android phones get a data-only FCM message (`kind`, `tag`, `title`, `body`, `url`, `speak`, `outbox_id`, high priority, collapse key = tag, 10 minutes to live for a trip). The app's own service shows it and speaks `speak` aloud, so the screen can be off. iOS gets a normal time-sensitive alert. `push-send` signs into Firebase with the `FCM_SERVICE_ACCOUNT` secret; without it native rows are recorded `skipped no fcm` and not retried, and web delivery carries on.
- Start duty asks the coordinator to turn notifications on first, because a locked screen is reached only by push; a small "Start without notifications" button keeps duty possible.

## Repeating gate alerts
- Duty is kept on the server: `app.gate_duty` records `started_at` and `seen_at` (the 30-second `gate_heartbeat`). Tapping End duty deletes the row.
- `app.send_gate_reminders()` runs every minute (job `gate-reminders`). For each open trip today that the gate has not acknowledged (or whose collector arrived after the last acknowledgement), once the latest news is `reminder_min` minutes old (Gate announcement settings: 2, 3 or 5), it sends "Reminder: Arnav, pickup at 4:15 PM" (or "Reminder: Meera has arrived for Arnav") under the trip's tag, so it replaces the earlier alert. At most 30 reminders per cycle; `app.gate_reminders` holds the count. Acknowledging ends the cycle, and a late update or a new arrival starts a fresh count.
- It tells the coordinators and leaders who cover the child and are on duty today; when none of them is on duty, all who cover the child.
- Acknowledging ends the cycle. A later "I've arrived" starts a new one.
- `app.alert_silent_duty()` (same job) tells every Center Leader and the person themselves, once, when a device on duty has not checked in for 2 minutes between 08:00 and 19:30: "No signal from Kavita's device. Announcements may not play on it. Open Jumpstart Go on that device." It fires again only when the device came back and went silent again, at most once every 30 minutes per person (a web app on an iPad goes silent whenever its screen locks).

## Privacy
Lock-screen text names the child's first name only (never the surname) and a time, never a location. The morning reminder and "other parent" alerts can be turned off per person. Provider: the browser's own push service; no third-party messaging account.
