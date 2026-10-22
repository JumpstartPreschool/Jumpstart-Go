package in.jumpstartpreschool.go;

import android.app.Notification;
import android.content.Intent;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Receives the school's data-only push messages, also when the app is closed. */
public class JumpstartMessagingService extends FirebaseMessagingService {
    static final String PREFS = "jumpstart";

    @Override public void onNewToken(String token) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("fcmToken", token).apply();
        DutyPlugin.emitToken(token);
    }

    @Override public void onMessageReceived(RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        boolean webSpeaks = DutyService.webAlive();
        Notif.channels(this);

        String title = d.get("title") == null ? "Pickup update" : d.get("title");
        String body = d.get("body") == null ? "" : d.get("body");
        String channel = webSpeaks ? Notif.GATE_QUIET : Notif.GATE;
        Notification n = new NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.drawable.ic_stat_duty)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            // The lock screen shows no names or details.
            .setPublicVersion(new NotificationCompat.Builder(this, channel)
                .setSmallIcon(R.drawable.ic_stat_duty).setContentTitle("Pickup update").build())
            .setAutoCancel(true)
            .setContentIntent(Notif.open(this, d.get("url")))
            .build();
        try {
            // The same tag replaces the older notification.
            NotificationManagerCompat.from(this).notify(d.get("tag"), 2, n);
        } catch (SecurityException e) {
            Log.w(DutyService.TAG, "notifications not allowed", e);
        }

        String speak = d.get("speak");
        if ("gate".equals(d.get("kind")) && speak != null && !speak.isEmpty() && !webSpeaks
            && msg.getPriority() == RemoteMessage.PRIORITY_HIGH) {
            try {
                ContextCompat.startForegroundService(this, new Intent(this, DutyService.class).putExtra(DutyService.EXTRA_SPEAK, speak));
            } catch (RuntimeException e) {
                // ForegroundServiceStartNotAllowedException: the notification above still shows.
                Log.w(DutyService.TAG, "cannot start speaker", e);
            }
        }
    }
}
