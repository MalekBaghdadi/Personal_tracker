package com.malekbaghdadi.logbook;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;

/** Sends every stop that isn't in Firestore yet (LogbookRest) and updates the notice. */
final class StopSync {

    private StopSync() {}

    private static final Object RUNNING = new Object();

    /** Returns true when something still waits for the network (StopWorker retries it). */
    static boolean syncAll(Context ctx, int timeoutMs, long deadlineMs) {
        synchronized (RUNNING) {
            boolean retry = false;
            LogbookRest.Session session = TimerStore.session(ctx);
            JSONArray stops = TimerStore.stops(ctx);
            for (int i = 0; i < stops.length(); i++) {
                JSONObject rec = stops.optJSONObject(i);
                if (rec == null || rec.optBoolean("synced")) continue;
                String id = rec.optString("id");
                if (session == null || !session.uid.equals(rec.optString("uid"))) {
                    // Signed out (or into another account) since: the web app finishes it when
                    // that account opens the app again.
                    TimerStore.setProblem(ctx, id, "auth");
                    TimerNotifier.showStopNotice(ctx, rec, "needs-app");
                    continue;
                }
                if (System.currentTimeMillis() > deadlineMs) {
                    retry = true;
                    continue;
                }
                LogbookRest.Stop stop = new LogbookRest.Stop(
                    id,
                    rec.optString("metricId"),
                    rec.optString("startedAt"),
                    rec.optString("localDate"),
                    rec.optLong("seconds"),
                    "log".equals(rec.optString("kind"))
                );
                LogbookRest.Outcome outcome = LogbookRest.saveStop(session, stop, timeoutMs);
                switch (outcome) {
                    case SAVED:
                    case GONE: {
                        String result = outcome == LogbookRest.Outcome.SAVED ? "saved" : "gone";
                        JSONObject now = TimerStore.markSynced(ctx, id, result);
                        // Not changed: the web app got there first and owns the notice.
                        if (now != null && now.optBoolean("changed")) TimerNotifier.showStopNotice(ctx, rec, result);
                        LockTimerPlugin.emitStopsChanged();
                        break;
                    }
                    case RETRY:
                        TimerStore.setProblem(ctx, id, "offline");
                        if (!isSynced(ctx, id)) TimerNotifier.showStopNotice(ctx, rec, "offline");
                        retry = true;
                        break;
                    case AUTH:
                    case ERROR:
                    default:
                        TimerStore.setProblem(ctx, id, outcome == LogbookRest.Outcome.AUTH ? "auth" : "error");
                        if (!isSynced(ctx, id)) TimerNotifier.showStopNotice(ctx, rec, "needs-app");
                        break;
                }
            }
            return retry;
        }
    }

    private static boolean isSynced(Context ctx, String id) {
        JSONObject r = TimerStore.stop(ctx, id);
        return r == null || r.optBoolean("synced");
    }
}
