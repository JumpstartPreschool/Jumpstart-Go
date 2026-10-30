package in.jumpstartpreschool.go;

import android.app.Notification;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

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

        // Quiet when something is already saying it aloud, so the system's beep never talks over the announcement. If this
        // phone then can't say it after all (a call has the audio, no voice), GateVoice shows it again with its sound.
        boolean shown = show(this, data, webSpeaks || saying ? Notif.GATE_QUIET : Notif.GATE);
        // Reception, kept apart from acceptance by FCM and from being spoken (0059, 0060). Sent off FCM's thread, which
        // handles one message at a time, so the next alert waits 2 s at most, and only when no announcer keeps this
        // process alive (Android may freeze it once this returns).
        if (shown || saying) {
            Future<?> sent = GateVoice.report(d.get("ack"), GateVoice.num(data, "outbox_id", 0), d.get("receipt"), "displayed");
            if (!saying && !webSpeaks) {
                try { sent.get(2, TimeUnit.SECONDS); } catch (Exception e) { Log.d(DutyService.TAG, "receipt still sending"); }
            }
        }
    }

    /** Shows an alert's notification on a channel, replacing the one with the same tag. True when notifications are on. */
    static boolean show(Context ctx, Bundle d, String channel) {
        String title = d.getString("title") == null ? "Pickup update" : d.getString("title");
        String body = d.getString("body") == null ? "" : d.getString("body");
        Notification n = new NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_stat_duty)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            // The lock screen shows no names or details.
            .setPublicVersion(new NotificationCompat.Builder(ctx, channel)
                .setSmallIcon(R.drawable.ic_stat_duty).setContentTitle("Pickup update").build())
            .setAutoCancel(true)
            .setContentIntent(Notif.open(ctx, d.getString("url")))
            .build();
        try {
            NotificationManagerCompat.from(ctx).notify(d.getString("tag"), 2, n);
            return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
        } catch (SecurityException e) {
            Log.w(DutyService.TAG, "notifications not allowed", e);
            return false;
        }
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
