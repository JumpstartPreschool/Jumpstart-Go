# Android app (Jumpstart Go)

An Android phone or tablet on duty keeps announcing pickups with the screen off. The app is the live web app wrapped in Capacitor 8 (`in.jumpstartpreschool.go`), plus a small native layer. iOS is not covered: it needs a paid Apple developer account.

## How it works

| Layer | What runs | Needs Firebase |
|---|---|---|
| 1. Duty service (primary) | A foreground service of type `mediaPlayback` keeps the app process and its WebView alive. The existing web announcer (Realtime, chime, school voice clips) keeps working unchanged. | No |
| 2. Push backup | A high-priority FCM data message shows a heads-up notification. If the WebView announcer is not alive, the app speaks the alert with Android text-to-speech at alarm volume. | Yes |

**Layer 1.** Tapping Start duty starts `DutyService` (`android/app/src/main/java/in/jumpstartpreschool/go/`). It shows an ongoing "On duty" notification, holds a partial wake lock and a Wi-Fi lock, and returns `START_STICKY`. `mediaPlayback` services have no time limit. `MainActivity` re-resumes the WebView and its timers in `onPause` and `onStop` while duty is on, so the page is not suspended. Every 5 seconds the service dispatches `jumpstart-native-tick` into the page; `useDuty` runs its sound health check on it and pings `alive()` every 10 seconds.

**Layer 2.** `JumpstartMessagingService` receives data-only messages (`kind`, `tag`, `title`, `body`, `url`, `speak`, `outbox_id`). It always posts a notification (channel `gate`; channel `gate_quiet`, no sound, when the WebView announcer pinged within 20 seconds). The lock screen shows only "Pickup update". The tap opens the app at `url` when it is a path on this site. For `kind=gate` without a live WebView, a one-shot `DutyService` speaks `speak` with TextToSpeech (en-IN female voice if installed, else en-IN, else device default) and stops itself when done or after 30 seconds. If Android refuses to start the service from the background, only the notification shows.

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
6. Swipe the app away from recent apps (do not force-stop it), then send a pickup (needs Firebase): expect a heads-up notification and a spoken alert. On Xiaomi, Vivo and Oppo a swipe can count as a force stop; repeat after the battery steps above.
7. Force-stop the app in Settings, then send a pickup: expect nothing until the app is opened again. Android does not deliver push to a force-stopped app.
8. Tap a notification: the app opens at the right page.
9. End duty: the notification disappears and `adb shell dumpsys activity services in.jumpstartpreschool.go` lists no `DutyService`.
10. `adb logcat -s JumpstartDuty` shows a `tick` line about every minute while duty is on (logged every 12th tick).

## Known limits

- The page is hidden when the screen is off, and Chromium may throttle hidden-page timers. The Realtime WebSocket, Web Audio playback and the 5 second native tick keep running, but this has not been confirmed on a physical device or emulator; run the checklist before relying on it.
- Some makers kill foreground services regardless of settings; the battery steps above reduce this, layer 2 covers what remains.
- Layer 2 needs Firebase and a network connection; the spoken alert uses the phone's own voice, not the school voice.
- Android 12 and later may refuse to start a foreground service from the background; the notification still shows.
- A duty service left over after the page reloads is stopped when the duty screen opens again.
- Volume cannot be raised by the app; the duty screen asks the person to do it.
