package com.malekbaghdadi.logbook;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.concurrent.TimeUnit;

/** Saves lock-screen stops that couldn't be sent at once, as soon as there's a network. */
public class StopWorker extends Worker {

    private static final String NAME = "lock-screen-stops";

    public StopWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void enqueue(Context ctx, boolean delayed) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(StopWorker.class)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInitialDelay(delayed ? 20 : 0, TimeUnit.SECONDS)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build();
        WorkManager.getInstance(ctx).enqueueUniqueWork(NAME, ExistingWorkPolicy.KEEP, req);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        if (!TimerStore.hasUnsynced(ctx)) return Result.success();
        boolean retry = StopSync.syncAll(ctx, 15_000, System.currentTimeMillis() + 5 * 60_000);
        return retry ? Result.retry() : Result.success();
    }
}
