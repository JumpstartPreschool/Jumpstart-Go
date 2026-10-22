package in.jumpstartpreschool.go;

import android.app.Notification;
import android.content.Intent;
import android.os.Bundle;
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
        Bundle data = toBundle(d);
        boolean webSpeaks = DutyService.webAlive();
        Notif.channels(this);

        // A gate alert the duty screen isn't saying, or a test alert (proving the background voice): this phone says it,
        // with the duty screen's chime and the school's recording, unless the person turned speaking off on this phone.
        String kind = d.get("kind");
        boolean say = ("test".equals(kind) || ("gate".equals(kind) && !webSpeaks))
            && GateVoice.prefs(this).getBoolean("speakAloud", true)
            && msg.getPriority() == RemoteMessage.PRIORITY_HIGH;
        boolean saying = say && startSpeaking(data);

        String title = d.get("title") == null ? "Pickup update" : d.get("title");
        String body = d.get("body") == null ? "" : d.get("body");
        // Quiet when something is already saying it aloud, so the system's beep never talks over the announcement.
        String channel = webSpeaks || saying ? Notif.GATE_QUIET : Notif.GATE;
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
        boolean shown = false;
        try {
            // The same tag replaces the older notification.
            NotificationManagerCompat.from(this).notify(d.get("tag"), 2, n);
            shown = NotificationManagerCompat.from(this).areNotificationsEnabled();
        } catch (SecurityException e) {
            Log.w(DutyService.TAG, "notifications not allowed", e);
        }
        // Reception, kept apart from acceptance by FCM and from being spoken (0059, 0060).
        if (shown || saying) GateVoice.receipt(d.get("ack"), GateVoice.num(data, "outbox_id", 0), d.get("receipt"), "displayed");
    }

    private boolean startSpeaking(Bundle data) {
        try {
            ContextCompat.startForegroundService(this, new Intent(this, DutyService.class).putExtra(DutyService.EXTRA_PUSH, data));
            return true;
        } catch (RuntimeException e) {
            // ForegroundServiceStartNotAllowedException: the notification still shows, with its sound.
            Log.w(DutyService.TAG, "cannot start speaker", e);
            return false;
        }
    }

    private static Bundle toBundle(Map<String, String> d) {
        Bundle b = new Bundle();
        for (Map.Entry<String, String> e : d.entrySet()) b.putString(e.getKey(), e.getValue());
        return b;
    }
}
