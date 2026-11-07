package com.malekbaghdadi.logbook;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.lang.ref.WeakReference;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The web app's side of the Android app (src/lib/native.ts). The web app stays in charge: it
 * hands over the session and the running timer, and finishes lock-screen stops (note prompt,
 * over-12-hours sheet) when it next runs.
 */
@CapacitorPlugin(
    name = "LockTimer",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
)
public class LockTimerPlugin extends Plugin {

    /** Bump when the web app needs something new from this side (NATIVE_API in src/lib/native.ts). */
    static final int NATIVE_API = 1;

    private static WeakReference<LockTimerPlugin> instance = new WeakReference<>(null);
    private final ExecutorService updates = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        instance = new WeakReference<>(this);
    }

    /** Tells the web app (if it's running) that a stop was recorded or saved. */
    static void emitStopsChanged() {
        LockTimerPlugin p = instance.get();
        if (p != null) p.notifyListeners("stops", new JSObject());
    }

    @Override
    protected void handleOnResume() {
        notifyListeners("resume", new JSObject());
    }

    private Context ctx() {
        return getContext().getApplicationContext();
    }

    private String notificationState() {
        if (!TimerNotifier.enabled(ctx())) {
            PermissionState p = Build.VERSION.SDK_INT >= 33 ? getPermissionState("notifications") : null;
            // Asking still shows Android's dialog in these two; after a second "Don't allow" it won't.
            if (p == PermissionState.PROMPT || p == PermissionState.PROMPT_WITH_RATIONALE) return "prompt";
            return "denied";
        }
        return "granted";
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject out = new JSObject();
        out.put("api", NATIVE_API);
        try {
            PackageInfo p = ctx().getPackageManager().getPackageInfo(ctx().getPackageName(), 0);
            out.put("versionName", p.versionName);
            out.put("versionCode", Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode);
        } catch (Exception e) {
            out.put("versionName", "");
        }
        out.put("notifications", notificationState());
        call.resolve(out);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("notifications", notificationState()));
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsResult");
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        JSONObject shown = TimerStore.shown(ctx());
        if (shown != null && TimerNotifier.enabled(ctx())) TimerNotifier.showRunning(ctx(), shown);
        call.resolve(new JSObject().put("notifications", notificationState()));
    }

    @PluginMethod
    public void setSession(PluginCall call) {
        String uid = call.getString("uid");
        String token = call.getString("refreshToken");
        if (uid == null || token == null) {
            call.reject("uid and refreshToken are required");
            return;
        }
        try {
            JSONObject s = new JSONObject()
                .put("uid", uid)
                .put("refreshToken", token)
                .put("apiKey", call.getString("apiKey", ""))
                .put("projectId", call.getString("projectId", ""))
                .put("authBase", call.getString("authBase", ""))
                .put("firestoreBase", call.getString("firestoreBase", ""));
            TimerStore.saveSession(ctx(), s);
            // A stop recorded while the session was missing can go out now.
            if (TimerStore.hasUnsynced(ctx())) StopWorker.enqueue(ctx(), false);
            call.resolve();
        } catch (JSONException e) {
            call.reject(e.getMessage());
        }
    }

    /** Signed out: forget the account and the timer (TimerStore.signOut). */
    @PluginMethod
    public void clearSession(PluginCall call) {
        TimerStore.signOut(ctx());
        TimerNotifier.cancel(ctx());
        call.resolve();
    }

    /**
     * A JS number as whole milliseconds. Never call.getDouble(): the bridge parses each call with
     * org.json, which makes a whole number past the int range (any timestamp) a Long, and
     * getDouble() answers null for a Long. That made show() refuse every timer up to android-1.1,
     * so the notification never appeared.
     */
    private static Long millis(PluginCall call, String key) {
        Object v = call.getData().opt(key);
        return v instanceof Number ? ((Number) v).longValue() : null;
    }

    @PluginMethod
    public void show(PluginCall call) {
        String uid = call.getString("uid");
        String startedAt = call.getString("startedAt");
        Long startedAtMs = millis(call, "startedAtMs");
        if (uid == null || startedAt == null || startedAtMs == null || call.getString("metricId") == null || call.getString("localDate") == null) {
            call.reject("uid, metricId, startedAt, startedAtMs and localDate are required");
            return;
        }
        // Already stopped from the lock screen, and the web app hasn't caught up yet.
        if (TimerStore.hasStopFor(ctx(), uid, startedAt)) {
            call.resolve(new JSObject().put("shown", false).put("stopped", true));
            return;
        }
        try {
            JSONObject shown = new JSONObject()
                .put("uid", uid)
                .put("metricId", call.getString("metricId"))
                .put("metricName", call.getString("metricName", "Timer"))
                .put("color", call.getString("color", "#4f8cff"))
                .put("startedAt", startedAt)
                .put("startedAtMs", (long) startedAtMs)
                .put("localDate", call.getString("localDate"))
                .put("sinceText", call.getString("sinceText", ""));
            TimerStore.setShown(ctx(), shown);
            TimerNotifier.showRunning(ctx(), shown);
            call.resolve(new JSObject().put("shown", TimerNotifier.enabled(ctx())));
        } catch (JSONException e) {
            call.reject(e.getMessage());
        }
    }

    /** No timer runs any more (stopped in the app or elsewhere). Leaves a stop notice alone. */
    @PluginMethod
    public void clear(PluginCall call) {
        if (TimerStore.clearShown(ctx())) TimerNotifier.cancel(ctx());
        call.resolve();
    }

    /** The web app has dealt with the lock-screen stops: take their notice down. */
    @PluginMethod
    public void dismissNotice(PluginCall call) {
        if (TimerStore.shown(ctx()) == null) TimerNotifier.cancel(ctx());
        call.resolve();
    }

    @PluginMethod
    public void getStops(PluginCall call) {
        JSONArray stops = TimerStore.stops(ctx());
        try {
            call.resolve(new JSObject().put("stops", new JSArray(stops.toString())));
        } catch (JSONException e) {
            call.reject(e.getMessage());
        }
    }

    /** First one wins (see TimerStore.markSynced); `changed` says whether it was this call. */
    @PluginMethod
    public void markStop(PluginCall call) {
        String id = call.getString("id");
        String outcome = call.getString("outcome");
        if (id == null || !("saved".equals(outcome) || "gone".equals(outcome))) {
            call.reject("id and outcome (saved or gone) are required");
            return;
        }
        JSONObject rec = TimerStore.markSynced(ctx(), id, outcome);
        if (rec == null) {
            call.resolve(new JSObject().put("changed", false));
            return;
        }
        try {
            call.resolve(JSObject.fromJSONObject(rec));
        } catch (JSONException e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void removeStop(PluginCall call) {
        String id = call.getString("id");
        if (id != null) TimerStore.removeStop(ctx(), id);
        call.resolve();
    }

    /** Downloads a newer web bundle from the live site, if there is one. Doesn't switch to it. */
    @PluginMethod
    public void prepareUpdate(PluginCall call) {
        String base = call.getString("base");
        String current = call.getString("current", "");
        if (base == null) {
            call.reject("base is required");
            return;
        }
        String serving = getBridge().getServerBasePath();
        String servingDir = serving != null && serving.startsWith("/") ? serving : null;
        updates.execute(() -> {
            JSONObject res = BundleUpdater.prepare(ctx(), base, current, NATIVE_API, servingDir);
            try {
                call.resolve(JSObject.fromJSONObject(res));
            } catch (JSONException e) {
                call.reject(e.getMessage());
            }
        });
    }

    /** Switches to a downloaded bundle: the web app reloads into it. */
    @PluginMethod
    public void applyUpdate(PluginCall call) {
        String version = call.getString("version");
        String path = version == null ? null : BundleUpdater.readyPath(ctx(), version);
        if (path == null) {
            call.reject("that version isn't downloaded");
            return;
        }
        BundleUpdater.persist(ctx(), path);
        call.resolve();
        getBridge().setServerBasePath(path);
    }
}
