# iPhone and iPad: gate alerts in the school's voice when locked

Status (2026-10-22): **server side built and tested; the notification service extension is written but has never been built or run.** There is no iOS app yet. Building one needs a Mac with Xcode and the Apple Developer Program (paid; see Cost). Until then iPads use the Home Screen web app, which speaks only while open and on screen ([notification-architecture.md](notification-architecture.md)).

## What Apple allows, and what we use

| Approach | Allowed? | Used |
|---|---|---|
| Web app (PWA) speaking while locked | No. iOS suspends the page; a web push plays only the standard sound | Current iPads: open and on screen only |
| **Notification service extension sets the alert's sound** to a file it prepared | **Yes.** It may change an alert's content, sound included, within about 30 seconds of it arriving | **Yes: the school's recording becomes the alert's sound** |
| Extension runs speech, or starts audio playback | No. An extension can't play audio and has no background audio session | No |
| Background audio mode, silent audio loop to stay awake | Only for apps really playing audio to the person; a silent loop is rejected in review (guideline 2.5.4) | No |
| VoIP push (PushKit) without a real call | No. Every VoIP push must report a CallKit call | No |
| Critical alerts (play in Silent mode and through Focus) | Only with an entitlement Apple grants on request, mainly for health, home security and public safety apps | Not requested; a school pickup is unlikely to qualify. Worth asking only if Silent mode turns out to be the problem in practice |
| **Time-sensitive alerts** (shown and sounded through Focus, if the person allows it) | Yes, with the Time Sensitive Notifications capability | **Yes**, for gate alerts (already in the payload) |

## How it works

```text
push-send (same as Android) ─► FCM ─► APNs alert, mutable-content 1, time-sensitive
   data: clips [{key, url}], chime                                    │
                                                                      ▼
                     GateSoundExtension (NotificationService.swift), about 30 s allowed
                       1. download each recording (link valid ≤ 10 min, made for this alert)
                       2. chime (the duty screen's notes) + recordings with a 150 ms gap
                       3. write 16-bit Linear PCM CAF, under 29 s, into the app group's Library/Sounds
                       4. alert.sound = that file  ──►  iOS shows the alert and plays it
                     anything fails or takes too long ─► the alert keeps the standard sound
```

- **Same voice, same audio.** push-send picks the recordings exactly as for Android (`_shared/phoneVoice.ts`): the duty screen's words for that trip at that moment, so the very clips the pronounce function made ahead in Azure's voice. The extension only re-wraps them (MP3 → Linear PCM, which Apple requires for alert sounds) and adds the same chime. Nothing is re-synthesised on the device.
- **Same file for the same announcement.** The sound's name is a hash of its recordings and chime, so a reminder that says the same words reuses the file. The newest 40 are kept.
- **Words never in the payload.** The lock screen text is the first-name-only title and body; recordings are fetched by hashed key through a link that expires with the alert.

## What iOS decides, whatever we do

| Device state | What happens (expected, **not yet verified on a device**) |
|---|---|
| App open, screen on | The duty screen inside the app speaks, as on the web. The app shows the banner without its sound (its `willPresent` answer, part of step 6), so the announcement isn't heard twice |
| App in the background, another app open (WhatsApp) | Banner with the school's sound |
| Screen locked (auto or by hand) | Lock-screen alert with the school's sound |
| App swiped away | Alerts are still delivered and the extension still runs (it is separate from the app) |
| Phone restarted, not unlocked since | Files in the app group can't be written before the first unlock: **standard sound** |
| Silent switch on | **No sound**, vibration only. iOS doesn't let an app override this without critical alerts |
| Focus or Do Not Disturb | Sounds only if the person allows time-sensitive alerts for Jumpstart Go in that Focus |
| Volume | Alert sounds follow the ringer volume, not the media volume |
| Bluetooth speaker connected | iOS normally sends alert sounds to connected audio; verify on the speaker the school uses |
| Several alerts at once | iOS plays each alert's sound as it arrives; there is no queue across alerts. A newer alert about the same trip replaces the older (collapse id) |
| No network | Nothing arrives; APNs keeps the newest alert per trip until it expires (10 minutes) |
| Recording takes longer than about 30 s to fetch | Standard sound |

So the full spoken announcement **cannot be guaranteed** on iPhone and iPad: Silent mode, Focus and a restart before unlock all fall back to vibration or the standard sound, and the alert's text is always shown. That is the strongest Apple-compliant option.

## To build it (owner, once the Apple membership exists)

1. Enrol in the Apple Developer Program. Install Xcode on a Mac.
2. `npm install @capacitor/ios@8.5.3 && npx cap add ios`, then open `ios/App/App.xcworkspace`.
3. App target → Signing & Capabilities: Push Notifications; Background Modes → Remote notifications; Time Sensitive Notifications; App Groups → `group.in.jumpstartpreschool.go`.
4. File → New → Target → Notification Service Extension, named `GateSoundExtension`. Replace its `NotificationService.swift` with [`native-ios/GateSoundExtension/NotificationService.swift`](../../native-ios/GateSoundExtension/NotificationService.swift). Give it the same App Group. Deployment target iOS 16 or later.
5. Firebase: add an iOS app with the bundle id, upload an APNs authentication key (.p8) in Project settings → Cloud Messaging, add `GoogleService-Info.plist` to the app target (git-ignored, like `google-services.json`).
6. The app presents alerts that arrive while it is open without their sound (`UNUserNotificationCenterDelegate.willPresent` returning banner and list only). It needs the plugin the web code already calls on Android (`src/native/duty.ts`: `getPushToken`, `requestNotificationPermission`, `status`), in Swift, and `isNativeAndroid()` widened to iOS where it applies; the token is saved with platform `ios` (`save_device_token` already accepts it). **Not written yet**: it needs Xcode to build and test.
7. Build to a device, sign in as a Center Coordinator, Start duty, allow notifications, and run the checklist below.

## Checklist (real device; nothing run yet)

| Test | iPhone | iPad |
|---|---|---|
| A. App open: school voice | not run | not run |
| B. In WhatsApp: banner with school voice | not run | not run |
| C. Auto-lock: lock-screen alert with school voice | not run | not run |
| D. Locked by hand: same | not run | not run |
| E. Bluetooth speaker: sound on the speaker | not run | not run |
| F. Three requests within seconds: three alerts, each its own sound, none doubled | not run | not run |
| G. Offline 5 min, back online: the newest alert per open request arrives, expired ones don't | not run | not run |
| H. Staff without the child's class: no alert, no recording link | covered by push routing (only `coordinators_for` the child are queued); device not run | not run |
| I. Swiped away / restarted before unlock / Silent / Focus: note what is heard | not run | not run |

`Console.app` (device selected, filter `GateSoundExtension`) shows whether the extension ran and whether it fell back.

## Cost

- **Apple Developer Program: US$99 a year** (Apple shows the local price at enrolment). Needed for push notifications on a device, TestFlight and the App Store. Not approved yet; nothing on the iOS side can ship without it.
- A Mac able to run the current Xcode (the school's or a team member's).
- Firebase Cloud Messaging and APNs: free.
