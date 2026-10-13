package in.jumpstartpreschool.go;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import java.lang.ref.WeakReference;

@CapacitorPlugin(
    name = "Duty",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class DutyPlugin extends Plugin {
    private static volatile WeakReference<DutyPlugin> instance = new WeakReference<>(null);

    @Override public void load() {
        instance = new WeakReference<>(this);
    }

    /** Called by the messaging service when Firebase rotates the token. */
    static void emitToken(String token) {
        DutyPlugin p = instance.get();
        if (p != null) p.notifyListeners("pushToken", new JSObject().put("token", token));
    }

    private boolean firebase() {
        return !FirebaseApp.getApps(getContext()).isEmpty();
    }

    @PluginMethod public void start(PluginCall call) {
        DutyService.bridge = new WeakReference<>(getBridge());
        try {
            ContextCompat.startForegroundService(getContext(), new Intent(getContext(), DutyService.class));
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Could not start the duty service: " + e.getMessage());
        }
    }

    @PluginMethod public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), DutyService.class));
        DutyService.running = false;
        call.resolve();
    }

    @PluginMethod public void alive(PluginCall call) {
        DutyService.lastAlive = System.currentTimeMillis();
        call.resolve();
    }

    @PluginMethod public void status(PluginCall call) {
        Context c = getContext();
        AudioManager am = c.getSystemService(AudioManager.class);
        JSObject r = new JSObject();
        r.put("running", DutyService.running);
        r.put("ignoringBatteryOptimizations", c.getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(c.getPackageName()));
        r.put("notificationsAllowed", NotificationManagerCompat.from(c).areNotificationsEnabled());
        r.put("alarmVolume", am.getStreamVolume(AudioManager.STREAM_ALARM));
        r.put("alarmMax", am.getStreamMaxVolume(AudioManager.STREAM_ALARM));
        r.put("mediaVolume", am.getStreamVolume(AudioManager.STREAM_MUSIC));
        r.put("mediaMax", am.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
        r.put("manufacturer", Build.MANUFACTURER);
        r.put("firebase", firebase());
        call.resolve(r);
    }

    @PluginMethod public void openBatterySettings(PluginCall call) {
        open(call, new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
    }

    @PluginMethod public void openNotificationSettings(PluginCall call) {
        open(call, new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName()));
    }

    private void open(PluginCall call, Intent i) {
        try {
            getActivity().startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Could not open settings");
        }
    }

    @PluginMethod public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled()));
        } else {
            requestPermissionForAlias("notifications", call, "notificationsResult");
        }
    }

    @PermissionCallback private void notificationsResult(PluginCall call) {
        call.resolve(new JSObject().put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled()));
    }

    @PluginMethod public void getPushToken(PluginCall call) {
        if (!firebase()) {
            call.resolve(new JSObject().put("token", JSObject.NULL));
            return;
        }
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener((t) ->
            call.resolve(new JSObject().put("token", t.isSuccessful() ? t.getResult() : JSObject.NULL)));
    }
}
