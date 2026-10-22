package in.jumpstartpreschool.go;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.ServiceCompat;

import com.getcapacitor.Bridge;

import java.lang.ref.WeakReference;

/**
 * Foreground service (mediaPlayback) that keeps this process, and so the WebView announcer, alive with the screen off.
 * Also the phone's own announcer (GateVoice) for push messages that arrive while the WebView can't speak.
 */
public class DutyService extends Service {
    static final String TAG = "JumpstartDuty";
    /** The push's data, as a Bundle of strings (JumpstartMessagingService). */
    static final String EXTRA_PUSH = "push";
    static final long TICK_MS = 5_000;
    static final long ALIVE_MS = 20_000;
    // A one-shot announcer never outlives its announcements: stopped once the queue is empty, and after three minutes
    // without a new alert whatever happens.
    static final long ONE_SHOT_MAX_MS = 180_000;

    /** True while duty mode is on (a one-shot announcement does not set it). */
    static volatile boolean running = false;
    static volatile long lastAlive = 0;
    static volatile WeakReference<Bridge> bridge = new WeakReference<>(null);

    private final Handler main = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;
    private GateVoice voice;
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

    private final Runnable oneShotOver = () -> { if (!dutyMode) stopSelf(); };

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        Notif.channels(this);
        Bundle push = intent == null ? null : intent.getBundleExtra(EXTRA_PUSH);
        boolean oneShot = push != null;
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
        if (voice == null) voice = new GateVoice(this, () -> { if (!dutyMode && voice != null && voice.idle()) stopSelf(); });
        voice.add(GateVoice.Item.from(push));
        main.removeCallbacks(oneShotOver);
        main.postDelayed(oneShotOver, ONE_SHOT_MAX_MS);
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

    @Override public void onDestroy() {
        main.removeCallbacksAndMessages(null);
        if (dutyMode) running = false;
        if (voice != null) { voice.close(); voice = null; }
        if (wake != null && wake.isHeld()) wake.release();
        if (wifi != null && wifi.isHeld()) wifi.release();
        super.onDestroy();
    }
}
