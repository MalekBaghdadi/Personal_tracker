package com.malekbaghdadi.logbook;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * What the lock-screen Stop needs to work while the web app isn't running, in app-private storage:
 *
 * - session: the signed-in account (uid, refresh token, API key, project), set by the web app.
 * - shown: the running timer the notification shows (set by the web app, cleared by Stop).
 * - stops: timers stopped from the notification. Each keeps the moment Stop was pressed, so the
 *   logged time is right however late it reaches Firestore. `synced` turns true once state/timer
 *   is gone, written either here (StopSync) or by the web app; the web app then shows the note
 *   prompt or the over-12-hours sheet and removes the record.
 */
final class TimerStore {

    private TimerStore() {}

    /** Same as ABANDONED_AFTER_S in src/state/TimerContext.tsx: longer runs ask before logging. */
    static final long ABANDONED_AFTER_S = 12 * 3600;

    private static final String PREFS = "logbook_lock_timer";
    private static final Object LOCK = new Object();

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject readObject(Context ctx, String key) {
        String raw = prefs(ctx).getString(key, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    private static JSONArray readStops(Context ctx) {
        String raw = prefs(ctx).getString("stops", null);
        if (raw == null) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static void writeStops(Context ctx, JSONArray stops) {
        prefs(ctx).edit().putString("stops", stops.toString()).commit();
    }

    // ── Session ─────────────────────────────────────────────────────────────

    static void saveSession(Context ctx, JSONObject session) {
        synchronized (LOCK) {
            prefs(ctx).edit().putString("session", session.toString()).commit();
        }
    }

    /**
     * Signed out: forget the account and the running timer. Stops not yet saved stay, and are
     * finished when that account signs in here again (each carries its uid).
     */
    static void signOut(Context ctx) {
        synchronized (LOCK) {
            prefs(ctx).edit().remove("session").remove("shown").commit();
        }
    }

    static LogbookRest.Session session(Context ctx) {
        synchronized (LOCK) {
            JSONObject s = readObject(ctx, "session");
            if (s == null) return null;
            String uid = s.optString("uid", "");
            String token = s.optString("refreshToken", "");
            if (uid.isEmpty() || token.isEmpty()) return null;
            return new LogbookRest.Session(
                uid,
                token,
                s.optString("apiKey", ""),
                s.optString("projectId", ""),
                s.optString("authBase", ""),
                s.optString("firestoreBase", "")
            );
        }
    }

    // ── The running timer ───────────────────────────────────────────────────

    static void setShown(Context ctx, JSONObject shown) {
        synchronized (LOCK) {
            prefs(ctx).edit().putString("shown", shown.toString()).commit();
        }
    }

    static JSONObject shown(Context ctx) {
        synchronized (LOCK) {
            return readObject(ctx, "shown");
        }
    }

    /** Clears the running timer; returns whether there was one. */
    static boolean clearShown(Context ctx) {
        synchronized (LOCK) {
            boolean had = prefs(ctx).contains("shown");
            prefs(ctx).edit().remove("shown").commit();
            return had;
        }
    }

    // ── Stops ───────────────────────────────────────────────────────────────

    /**
     * Stop pressed for the timer that started at `startedAt`. Returns the new record, or null when
     * the notification was stale (no such timer is shown any more).
     */
    static JSONObject recordStop(Context ctx, String startedAt, long nowMs) {
        synchronized (LOCK) {
            JSONObject shown = readObject(ctx, "shown");
            if (shown == null || !shown.optString("startedAt", "").equals(startedAt)) return null;
            try {
                long startedMs = shown.getLong("startedAtMs");
                long seconds = (long) Math.floor((nowMs - startedMs) / 1000.0);
                // Same split as doStop(): over 12h asks first, a negative time (clock skew) and
                // under a second log nothing.
                String kind = seconds > ABANDONED_AFTER_S ? "held" : seconds > 0 ? "log" : "none";
                JSONObject rec = new JSONObject();
                rec.put("id", UUID.randomUUID().toString());
                rec.put("uid", shown.getString("uid"));
                rec.put("metricId", shown.getString("metricId"));
                rec.put("metricName", shown.optString("metricName", "Timer"));
                rec.put("startedAt", startedAt);
                rec.put("startedAtMs", startedMs);
                rec.put("stoppedAt", LogbookRest.iso(nowMs));
                rec.put("localDate", shown.getString("localDate"));
                rec.put("seconds", Math.max(0, seconds));
                rec.put("kind", kind);
                rec.put("synced", false);
                rec.put("outcome", JSONObject.NULL);
                rec.put("problem", JSONObject.NULL);
                JSONArray stops = readStops(ctx);
                stops.put(rec);
                writeStops(ctx, stops);
                prefs(ctx).edit().remove("shown").commit();
                return rec;
            } catch (JSONException e) {
                return null;
            }
        }
    }

    static JSONArray stops(Context ctx) {
        synchronized (LOCK) {
            return readStops(ctx);
        }
    }

    static JSONObject stop(Context ctx, String id) {
        synchronized (LOCK) {
            JSONArray stops = readStops(ctx);
            for (int i = 0; i < stops.length(); i++) {
                JSONObject r = stops.optJSONObject(i);
                if (r != null && id.equals(r.optString("id"))) return r;
            }
            return null;
        }
    }

    static boolean hasStopFor(Context ctx, String uid, String startedAt) {
        synchronized (LOCK) {
            JSONArray stops = readStops(ctx);
            for (int i = 0; i < stops.length(); i++) {
                JSONObject r = stops.optJSONObject(i);
                if (r != null && uid.equals(r.optString("uid")) && startedAt.equals(r.optString("startedAt"))) return true;
            }
            return false;
        }
    }

    static boolean hasUnsynced(Context ctx) {
        synchronized (LOCK) {
            JSONArray stops = readStops(ctx);
            for (int i = 0; i < stops.length(); i++) {
                JSONObject r = stops.optJSONObject(i);
                if (r != null && !r.optBoolean("synced")) return true;
            }
            return false;
        }
    }

    /**
     * Marks a stop as written ("saved") or found already stopped elsewhere ("gone"). Only the first
     * caller wins, so the web app and StopSync never both act on one stop. Returns the record as it
     * now stands, with "changed" telling whether this call made the change.
     */
    static JSONObject markSynced(Context ctx, String id, String outcome) {
        synchronized (LOCK) {
            JSONArray stops = readStops(ctx);
            for (int i = 0; i < stops.length(); i++) {
                JSONObject r = stops.optJSONObject(i);
                if (r == null || !id.equals(r.optString("id"))) continue;
                try {
                    boolean changed = !r.optBoolean("synced");
                    if (changed) {
                        r.put("synced", true);
                        r.put("outcome", outcome);
                        r.put("problem", JSONObject.NULL);
                        writeStops(ctx, stops);
                    }
                    return new JSONObject(r.toString()).put("changed", changed);
                } catch (JSONException e) {
                    return null;
                }
            }
            return null;
        }
    }

    static void setProblem(Context ctx, String id, String problem) {
        synchronized (LOCK) {
            JSONArray stops = readStops(ctx);
            for (int i = 0; i < stops.length(); i++) {
                JSONObject r = stops.optJSONObject(i);
                if (r == null || !id.equals(r.optString("id")) || r.optBoolean("synced")) continue;
                try {
                    r.put("problem", problem);
                } catch (JSONException e) {
                    return;
                }
                writeStops(ctx, stops);
                return;
            }
        }
    }

    static void removeStop(Context ctx, String id) {
        synchronized (LOCK) {
            JSONArray stops = readStops(ctx);
            JSONArray kept = new JSONArray();
            for (int i = 0; i < stops.length(); i++) {
                JSONObject r = stops.optJSONObject(i);
                if (r != null && !id.equals(r.optString("id"))) kept.put(r);
            }
            writeStops(ctx, kept);
        }
    }
}
