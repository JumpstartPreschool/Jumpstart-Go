package in.jumpstartpreschool.go;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import java.util.Arrays;

/** Notification channels and builders shared by the duty service and the push handler. */
final class Notif {
    static final String DUTY = "duty";
    static final String GATE = "gate";
    static final String GATE_QUIET = "gate_quiet";

    private Notif() {}

    static void channels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        NotificationChannel duty = new NotificationChannel(DUTY, "On duty", NotificationManager.IMPORTANCE_LOW);
        duty.setDescription("Shows while this device is listening for pickups");
        duty.setShowBadge(false);
        NotificationChannel gate = new NotificationChannel(GATE, "Pickup updates", NotificationManager.IMPORTANCE_HIGH);
        gate.enableVibration(true);
        NotificationChannel quiet = new NotificationChannel(GATE_QUIET, "Pickup updates (already announced)", NotificationManager.IMPORTANCE_HIGH);
        quiet.setSound(null, null);
        quiet.enableVibration(false);
        nm.createNotificationChannels(Arrays.asList(duty, gate, quiet));
    }

    /** Opens the app, at a same-origin path when one is given. */
    static PendingIntent open(Context ctx, String path) {
        Intent i = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        String safe = safePath(path);
        if (safe != null) i.putExtra("url", safe);
        // A request code per path keeps the PendingIntents for different paths apart.
        return PendingIntent.getActivity(ctx, safe == null ? 0 : safe.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Only a path on this site: starts with one slash, no scheme, host or backslash. */
    static String safePath(String p) {
        if (p == null || !p.startsWith("/") || p.startsWith("//") || p.indexOf('\\') >= 0) return null;
        return p;
    }

    static Notification duty(Context ctx, String text) {
        return new NotificationCompat.Builder(ctx, DUTY)
            .setSmallIcon(R.drawable.ic_stat_duty)
            .setContentTitle("On duty")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(open(ctx, null))
            .build();
    }
}
