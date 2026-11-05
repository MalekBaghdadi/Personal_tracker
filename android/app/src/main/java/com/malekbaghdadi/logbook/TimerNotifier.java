package com.malekbaghdadi.logbook;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONObject;

/**
 * The one notification the app posts: the running timer, with a live clock (drawn by Android, so
 * nothing runs while it counts) and a Stop button that works on the lock screen without unlocking.
 * After Stop, the same notification becomes a short notice of what happened.
 */
final class TimerNotifier {

    private TimerNotifier() {}

    static final String CHANNEL_ID = "timer";
    static final int NOTIFICATION_ID = 1;

    static boolean enabled(Context ctx) {
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        // Default importance, not low: many phones hide silent notifications on the lock screen,
        // which is the one place this has to show. No sound or vibration though.
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Running timer", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("The running timer, with Stop, on the lock screen");
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setShowBadge(false);
        ch.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private static PendingIntent openApp(Context ctx) {
        Intent open = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static int color(JSONObject o) {
        try {
            return Color.parseColor(o.optString("color", "#4f8cff"));
        } catch (IllegalArgumentException e) {
            return Color.parseColor("#4f8cff");
        }
    }

    private static NotificationCompat.Builder base(Context ctx, JSONObject o) {
        ensureChannel(ctx);
        return new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_timer)
            .setColor(color(o))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(openApp(ctx));
    }

    private static void post(Context ctx, NotificationCompat.Builder b) {
        if (!enabled(ctx)) return;
        try {
            NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException e) {
            // Permission withdrawn between the check and the post.
        }
    }

    static void showRunning(Context ctx, JSONObject shown) {
        Intent stop = new Intent(ctx, StopReceiver.class)
            .setAction(StopReceiver.ACTION_STOP)
            .putExtra("startedAt", shown.optString("startedAt"));
        PendingIntent stopPi = PendingIntent.getBroadcast(ctx, 1, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Action action = new NotificationCompat.Action.Builder(R.drawable.ic_stat_stop, "Stop", stopPi)
            // Explicitly: Stop works from the lock screen without unlocking.
            .setAuthenticationRequired(false)
            .build();
        String since = shown.optString("sinceText", "");
        NotificationCompat.Builder b = base(ctx, shown)
            .setContentTitle(shown.optString("metricName", "Timer"))
            .setContentText(since.isEmpty() ? "Running" : "Running since " + since)
            .setWhen(shown.optLong("startedAtMs", System.currentTimeMillis()))
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .addAction(action)
            // Android 16+: may show as a Live Update (status bar chip, top of the lock screen).
            .setRequestPromotedOngoing(true);
        post(ctx, b);
    }

    /** After Stop: what happened, in the notification's place. */
    static void showStopNotice(Context ctx, JSONObject rec, String state) {
        String name = rec.optString("metricName", "Timer");
        long seconds = rec.optLong("seconds", 0);
        String kind = rec.optString("kind", "log");
        String took = formatDuration(seconds);
        String title;
        String text;
        long timeoutMs = 0;
        switch (state) {
            case "saving":
                title = "held".equals(kind) ? name + " stopped after " + took : name + " stopped · " + took;
                text = "Saving…";
                break;
            case "offline":
                title = "held".equals(kind) ? name + " stopped after " + took : name + " stopped · " + took;
                text = "held".equals(kind)
                    ? "Open Logbook to log the time you actually spent, or discard it."
                    : "Saves when you’re back online.";
                break;
            case "needs-app":
                title = name + " stopped · " + took;
                text = "Open Logbook to save it.";
                break;
            case "gone":
                title = name + " was already stopped";
                text = "It was stopped on another device.";
                timeoutMs = 60_000;
                break;
            case "saved":
            default:
                if ("held".equals(kind)) {
                    title = name + " stopped after " + took;
                    text = "Over 12 hours. Open Logbook to log the time you actually spent, or discard it.";
                } else if ("none".equals(kind)) {
                    cancel(ctx);
                    return;
                } else if (seconds > 600) {
                    title = "Logged " + took + " to " + name;
                    text = "Open Logbook to add what you accomplished.";
                } else {
                    title = "Logged " + took + " to " + name;
                    text = "";
                    timeoutMs = 10 * 60_000;
                }
        }
        NotificationCompat.Builder b = base(ctx, rec).setContentTitle(title).setAutoCancel(true).setShowWhen(false);
        if (!text.isEmpty()) b.setContentText(text);
        if (timeoutMs > 0) b.setTimeoutAfter(timeoutMs);
        post(ctx, b);
    }

    static void cancel(Context ctx) {
        NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID);
    }

    /** Same as formatDuration() in src/lib/format.ts. */
    static String formatDuration(long seconds) {
        long s = Math.max(0, seconds);
        if (s == 0) return "0m";
        if (s < 60) return s + "s";
        long h = s / 3600;
        long m = (s % 3600) / 60;
        if (h == 0) return m + "m";
        return m == 0 ? h + "h" : h + "h " + m + "m";
    }
}
