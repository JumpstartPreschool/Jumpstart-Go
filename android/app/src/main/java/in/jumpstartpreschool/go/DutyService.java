package in.jumpstartpreschool.go;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;

import androidx.core.app.ServiceCompat;

import com.getcapacitor.Bridge;

import java.lang.ref.WeakReference;
import java.util.Locale;

/**
 * Foreground service (mediaPlayback) that keeps this process, and so the WebView announcer, alive with the screen off.
 * Also the one-shot speaker for push messages that arrive while the WebView is not running.
 */
public class DutyService extends Service {
    static final String TAG = "JumpstartDuty";
    static final String EXTRA_SPEAK = "speak";
    static final long TICK_MS = 5_000;
    static final long ALIVE_MS = 20_000;

    /** True while duty mode is on (a one-shot speak does not set it). */
    static volatile boolean running = false;
    static volatile long lastAlive = 0;
    static volatile WeakReference<Bridge> bridge = new WeakReference<>(null);

    private final Handler main = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private String pending;
    private boolean dutyMode = false;
    private int ticks = 0;

    /** The WebView announcer is running and has pinged recently, so it is already speaking. */
    static boolean webAlive() {
        return running && System.currentTimeMillis() - lastAlive < ALIVE_MS;
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            Bridge b = bridge.get();
            if (b != null) b.eval("window.dispatchEvent(new Event('jumpstart-native-tick'))", null);
            if (++ticks % 12 == 1) Log.d(TAG, "tick " + ticks + " webAlive=" + webAlive());
            main.postDelayed(this, TICK_MS);
        }
    };

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        Notif.channels(this);
        String speak = intent == null ? null : intent.getStringExtra(EXTRA_SPEAK);
        boolean oneShot = speak != null;
        try {
            int type = Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
            ServiceCompat.startForeground(this, 1, Notif.duty(this, oneShot && !dutyMode ? "Announcing a pickup" : "Listening for pickups"), type);
        } catch (RuntimeException e) {
            // Not allowed to run in the foreground from here (Android 12+ background limits).
            Log.w(TAG, "startForeground refused", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!oneShot) {
            if (!dutyMode) {
                dutyMode = true;
                running = true;
                lastAlive = System.currentTimeMillis();
                hold();
                main.removeCallbacks(tick);
                main.post(tick);
            }
            return START_STICKY;
        }
        speak(speak);
        return dutyMode ? START_STICKY : START_NOT_STICKY;
    }

    @SuppressWarnings("deprecation")
    private void hold() {
        if (wake == null) {
            wake = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "jumpstart:duty");
            wake.acquire();
        }
        if (wifi == null) {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            int mode = Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifi = wm.createWifiLock(mode, "jumpstart:duty");
            wifi.acquire();
        }
    }

    private void speak(String text) {
        main.postDelayed(() -> { if (!dutyMode) stopSelf(); }, 30_000);
        if (tts != null && ttsReady) { say(text); return; }
        pending = text;
        if (tts != null) return;
        tts = new TextToSpeech(getApplicationContext(), status -> {
            if (status != TextToSpeech.SUCCESS) { if (!dutyMode) stopSelf(); return; }
            tts.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            pickVoice();
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) {}
                @Override public void onDone(String id) { main.post(() -> { if (!dutyMode) stopSelf(); }); }
                @Override public void onError(String id) { onDone(id); }
            });
            ttsReady = true;
            if (pending != null) { say(pending); pending = null; }
        });
    }

    private void say(String text) {
        tts.speak(text, TextToSpeech.QUEUE_ADD, null, "gate-" + System.nanoTime());
    }

    /** An en-IN female voice if there is one, else any offline en-IN voice, else en-IN by locale, else the device default. */
    private void pickVoice() {
        try {
            Voice best = null;
            int bestScore = 0;
            if (tts.getVoices() != null) for (Voice v : tts.getVoices()) {
                Locale l = v.getLocale();
                if (!"en".equals(l.getLanguage()) || !"IN".equals(l.getCountry()) || v.isNetworkConnectionRequired()) continue;
                String name = v.getName();
                // Voice names carry no standard gender field; "female" or Google's -enc-/-ene- ids are the best hint there is.
                int score = name.toLowerCase(Locale.ROOT).contains("female") || name.contains("-enc-") || name.contains("-ene-") ? 2 : 1;
                if (score > bestScore) { best = v; bestScore = score; }
            }
            if (best != null) tts.setVoice(best); else tts.setLanguage(Locale.forLanguageTag("en-IN"));
        } catch (RuntimeException e) {
            Log.w(TAG, "voice pick failed", e);
        }
    }

    @Override public void onDestroy() {
        main.removeCallbacksAndMessages(null);
        if (dutyMode) running = false;
        if (tts != null) { tts.stop(); tts.shutdown(); }
        if (wake != null && wake.isHeld()) wake.release();
        if (wifi != null && wifi.isHeld()) wifi.release();
        super.onDestroy();
    }
}
