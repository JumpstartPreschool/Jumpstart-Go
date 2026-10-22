# Android app (Jumpstart Go)

An Android phone or tablet on duty keeps announcing pickups with the screen off, in the school's own voice. The app is the live web app wrapped in Capacitor 8 (`in.jumpstartpreschool.go`), plus a small native layer. iOS: [ios-app.md](ios-app.md) (needs a paid Apple developer account; not built yet).

## How it works

| Layer | What runs | Needs Firebase |
|---|---|---|
| 1. Duty service (primary) | A foreground service of type `mediaPlayback` keeps the app process and its WebView alive. The existing web announcer (Realtime, chime, school voice clips) keeps working unchanged. | No |
| 2. Phone's own announcer | A high-priority FCM data message shows a heads-up notification. If the WebView announcer is not alive, the app plays the duty screen's chime and **the school's own recording** (the Azure clip the duty screen would play), falling back to Android text-to-speech only when the recording can't be fetched in time. | Yes |

**Layer 1.** Tapping Start duty starts `DutyService` (`android/app/src/main/java/in/jumpstartpreschool/go/`). It shows an ongoing "On duty" notification, holds a partial wake lock and a Wi-Fi lock, and returns `START_STICKY`. `mediaPlayback` services have no time limit. `MainActivity` re-resumes the WebView and its timers in `onPause` and `onStop` while duty is on, so the page is not suspended. Every 5 seconds the service dispatches `jumpstart-native-tick` into the page; `useDuty` runs its sound health check on it and pings `alive()` every 10 seconds.

**Layer 2.** `JumpstartMessagingService` receives data-only messages (`kind`, `tag`, `title`, `body`, `url`, `speak`, `outbox_id`, and for gate alerts `clips`, `chime`, `priority`, `order`, `expires`, `receipt`, `ack`; built by `fcmMessageFor` in `_shared/push.ts`). It always posts a notification; the lock screen shows only "Pickup update", and a tap opens the app at `url` when it is a path on this site. For `kind=gate` without a live WebView, and for every `kind=test` alert, it starts `DutyService` with the push's data, and the service's `GateVoice` says it (below). The notification then uses the silent channel `gate_quiet`, so the system's beep never talks over the announcement; if Android refuses to start the service from the background, the notification uses channel `gate` with its sound instead. A parent's alert about the same trip is `kind=info` and never spoken.

### GateVoice: the school's voice with the screen off

`GateVoice.java` plays exactly what the duty screen would (`src/features/duty/sound.ts`):

1. **Words and recording.** push-send works out the duty screen's words for that trip at that moment (`phoneVoiceFor` in `_shared/phoneVoice.ts`, using the same `_shared/gateTrip.ts` and templates as the duty screen) and sends each recording's key with a storage link signed for this alert only, valid until the alert expires (at most 10 minutes). The key is the same clip the pronounce function made ahead for that child, in the same voice version, with the school's pronunciation. The words themselves are not sent: FCM data is readable by Google, so the device-voice fallback reads the first-name-only title and body.
2. **Chime.** The duty screen's notes and envelope, generated on the phone (`GateVoice.chime`, tested against sound.ts's timings).
3. **Recording.** Fetched during the chime and kept in the app's cache by key (newest 300); a recording already on the phone plays offline. Up to 5 s is allowed after the chime; otherwise, or if it won't play, Android's own en-IN voice reads the title and body.
4. **Queue.** One announcement at a time; most urgent first (arrived, urgent, running late, outside the usual time, the rest), reminders after every new announcement, then the earliest arrival, then first come: the duty screen's order. A newer alert about the same trip replaces one still waiting. Each alert plays once per phone (the last 100 alert ids are remembered across restarts, since FCM may deliver twice); another phone of the gate team gets and plays its own copy. Nothing plays after its expiry.
5. **Audio.** Alarm stream at full volume for the announcement (it plays in silent mode too, as before), other sound ducked (`AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`), both restored when the queue is empty. A phone call or another alarm taking the audio cuts the announcement; it is tried again once after 15 s if still current, otherwise the next reminder carries it.
6. **Reports.** `displayed` when the notification is posted and `spoken` when an announcement was said to its end (`push-send/receipt`, the receipt id travels only inside that phone's push; 0060). A spoken gate alert also counts as heard in **Who gets alerts** (`app.gate_heard`). The page, if it is running, is told (`jumpstart-native-spoke`) so it doesn't say the same request again at once.
7. **Settings and status** (duty screen, `NativeHealth`): "Speak alerts with the screen off" (on by default; off leaves notifications only), and a status line from what the phone reports: when it last spoke with the screen off and in which voice, push not set up, or an app version too old for the school's voice. A **test alert** (Who gets alerts → Send a test alert, sent 10 s later so the screen can be locked) plays the chime and the school's sound check through this same path.

**Remote page.** `capacitor.config.ts` sets `server.url` to the live site. Web deploys reach installed apps at once and the native bridge is injected for that origin (the URL is in Capacitor's allowed-origin list). Trade-off: the app needs a connection to open. To bundle the web build instead, remove `server.url`, run `npm run build && npx cap sync android`, and rebuild the APK; every web change then needs a new APK.

**Push on the web side.** The Android WebView has no Push API. `push.ts` uses the native FCM token instead: `save_device_token` / `delete_device_token` RPCs, state `not-configured` until Firebase is set up.

## Build and install

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Sideloading a debug APK works for the school's own devices (allow "install unknown apps" once). A release build needs a signing key kept outside the repository (`*.jks` is ignored). Play Store internal testing costs a one-time $25 and is optional.

## Firebase setup (owner, free)

1. Create a free Firebase project at console.firebase.google.com.
2. Add an Android app with package name `in.jumpstartpreschool.go`.
3. Download `google-services.json` into `android/app/`. It is git-ignored; never commit it. The Gradle build applies the Google services plugin only when the file exists.
4. In Project settings, Service accounts, create a private key (JSON). Store it as the Supabase secret `FCM_SERVICE_ACCOUNT`.
5. Rebuild and reinstall the APK, open the app, and turn notifications on.

## Battery settings per maker

Android's battery saver is the main thing that stops background apps. The duty screen shows a card with a button when it is on. Tap "Allow running in background" and choose Allow, then also:

- Xiaomi, Redmi, Poco: Settings, Apps, Jumpstart Go, Autostart on; Battery saver: No restrictions.
- Vivo, iQOO: Settings, Battery, Background power consumption, Jumpstart Go, Allow high background power.
- Oppo, Realme, OnePlus: Settings, Battery, Jumpstart Go, Allow background activity and auto launch.
- Samsung: Settings, Battery, Background usage limits, Never sleeping apps, add Jumpstart Go.

Other makers: see dontkillmyapp.com.

## Test checklist (real device)

1. Install, open, sign in as a coordinator, tap Start duty, allow notifications.
2. Confirm the "On duty" notification appears and the sound check plays.
3. Turn the screen off. Create a pickup request from another device. Expect the chime and the school voice within a few seconds.
4. Repeat after 10 minutes and after 1 hour with the screen off, on battery, Wi-Fi and mobile data.
5. Silent mode and media volume zero: note what is heard. Layer 1 plays on the media stream; layer 2 speaks on the alarm stream.
6. Swipe the app away from recent apps (do not force-stop it), then send a pickup (needs Firebase): expect a heads-up notification and the chime with the school voice. On Xiaomi, Vivo and Oppo a swipe can count as a force stop; repeat after the battery steps above.
7. Force-stop the app in Settings, then send a pickup: expect nothing until the app is opened again. Android does not deliver push to a force-stopped app.
8. Tap a notification: the app opens at the right page.
9. End duty: the notification disappears and `adb shell dumpsys activity services in.jumpstartpreschool.go` lists no `DutyService`.
10. `adb logcat -s JumpstartDuty` shows a `tick` line about every minute while duty is on (logged every 12th tick), and `voice school`, `voice device`, `voice cut` or `voice silent` for each background announcement.

### Acceptance tests A to I (Android app; nothing run on a device yet)

Mark a cell only after running it on that device. "Expected" is what the code is built to do.

| Test | Expected | Phone | Tablet |
|---|---|---|---|
| A. App open, screen on | The duty screen speaks in the school voice (layer 1) | not run | not run |
| B. Switched to WhatsApp | Layer 1 keeps speaking (the duty service keeps the page running); if the page is suspended, GateVoice plays the school voice | not run | not run |
| C. Screen timed out | As B | not run | not run |
| D. Locked by hand | As B | not run | not run |
| E. Bluetooth speaker | Alarm audio goes to the speaker, and on many phones to the phone's speaker as well | not run | not run |
| F. Three requests within seconds | One after another, most urgent first, none doubled; a reminder never before a new request | not run | not run |
| G. Offline, then back | FCM delivers the newest alert per request still within its 10 minutes; the page re-reads today's trips; nothing expired plays | not run | not run |
| H. Staff without the child's class | No alert queued for them (`coordinators_for`), so no link to the recording | covered by `zz_push.test.sql`; device not run | not run |
| I. App swiped away; phone restarted; Do Not Disturb | Swiped: alert and school voice (layer 2). Restarted: layer 2 works once the phone is unlocked; duty (layer 1) restarts when the duty screen is opened. DND: the alarm stream plays if alarms are allowed in DND (Android's default); the volume can't be raised without DND access | not run | not run |

## Known limits

- The page is hidden when the screen is off, and Chromium may throttle hidden-page timers. The Realtime WebSocket, Web Audio playback and the 5 second native tick keep running, but this has not been confirmed on a physical device or emulator; run the checklist before relying on it. Layer 2 covers a suspended page.
- Some makers kill foreground services regardless of settings; the battery steps above reduce this, layer 2 covers what remains.
- Layer 2 needs Firebase and a network connection. A recording not already on the phone needs the connection too; without it the phone's own voice reads the title.
- Android 12 and later may refuse to start a foreground service from the background (always if the app is in the Restricted battery bucket); the notification still shows, with its sound. High-priority FCM messages are what allow the start, and FCM may lower their priority if an app often doesn't show a notification for them; this app always shows one.
- Android 15 and later forbid starting a media-playback foreground service when the phone boots, so duty mode is never restarted at boot: open the duty screen after a restart.
- Checked against Android 12 to 16 behaviour as documented; Android 17's changes have not been checked yet.
- A duty service left over after the page reloads is stopped when the duty screen opens again.
- Volume cannot be raised by the app beyond what Android allows; the duty screen asks the person to do it. The phone's own announcer turns the alarm volume up itself while it speaks.
- No output chooser on Android: alarm audio follows Android's routing (Bluetooth speaker and phone speaker). The iPad's Speaker sheet is Safari's own picker.
