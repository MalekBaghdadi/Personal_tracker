package com.malekbaghdadi.logbook;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

/**
 * The notification's Stop button. Runs with the phone locked: the stop time is recorded at once,
 * then saved straight to Firestore, with StopWorker as the fallback when there's no network.
 */
public class StopReceiver extends BroadcastReceiver {

    static final String ACTION_STOP = "com.malekbaghdadi.logbook.STOP_TIMER";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_STOP.equals(intent.getAction())) return;
        final Context ctx = context.getApplicationContext();
        String startedAt = intent.getStringExtra("startedAt");
        JSONObject rec = startedAt == null ? null : TimerStore.recordStop(ctx, startedAt, System.currentTimeMillis());
        if (rec == null) {
            // A stale notification: that timer is no longer the one shown.
            TimerNotifier.cancel(ctx);
            return;
        }
        TimerNotifier.showStopNotice(ctx, rec, "saving");
        // Queued first, so the stop is still saved if this process is killed mid-request.
        StopWorker.enqueue(ctx, true);
        LockTimerPlugin.emitStopsChanged();
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                StopSync.syncAll(ctx, 4000, System.currentTimeMillis() + 7000);
            } finally {
                LockTimerPlugin.emitStopsChanged();
                pending.finish();
            }
        }, "logbook-stop").start();
    }
}
