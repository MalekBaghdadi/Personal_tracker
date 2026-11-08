package com.malekbaghdadi.logbook;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

/**
 * A restart or an app update clears notifications: put the running timer back. After an update,
 * also delete the APK it was installed from (AppUpdater).
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;
        Context ctx = context.getApplicationContext();
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) AppUpdater.cleanUp(ctx);
        JSONObject shown = TimerStore.shown(ctx);
        if (shown != null && TimerStore.session(ctx) != null) TimerNotifier.showRunning(ctx, shown);
        if (TimerStore.hasUnsynced(ctx)) StopWorker.enqueue(ctx, false);
    }
}
