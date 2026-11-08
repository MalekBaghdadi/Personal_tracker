package com.malekbaghdadi.logbook;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Updates the APK from inside the app (LockTimerPlugin.installUpdate). The web app finds a newer
 * release on GitHub (src/state/apkUpdate.ts); this downloads it into the cache, checks it is
 * Logbook and newer than what's installed, and opens Android's installer. Android then asks the
 * user to confirm (always, for an app not from the Play Store; the first time it also asks to
 * allow installs from Logbook) and only accepts an APK signed with the same key. It's an update:
 * data and sign-in stay.
 */
final class AppUpdater {

    private AppUpdater() {}

    interface Progress {
        void percent(int p);
    }

    /** The downloaded APK isn't newer than the one installed. */
    static final class NotNewer extends Exception {}

    private static File dir(Context ctx) {
        return new File(ctx.getCacheDir(), "updates");
    }

    /** Downloads the APK at `url` and checks it. Throws with a message the user can read. */
    static File download(Context ctx, String url, Progress progress) throws IOException, NotNewer {
        if (!url.startsWith("https://")) throw new IOException("That isn’t a secure download link.");
        cleanUp(ctx);
        File dir = dir(ctx);
        if (!dir.mkdirs() && !dir.isDirectory()) throw new IOException("Couldn’t make room for the download.");
        File part = new File(dir, "logbook.apk.part");
        File apk = new File(dir, "logbook.apk");
        // GitHub answers with a redirect to its file host; HttpURLConnection follows https → https.
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15_000);
        c.setReadTimeout(30_000);
        c.setUseCaches(false);
        try {
            int status = c.getResponseCode();
            if (status != 200) throw new IOException("The download failed (HTTP " + status + ").");
            long total = c.getContentLengthLong();
            long got = 0;
            int last = -1;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                    got += n;
                    if (total > 0) {
                        int p = (int) (got * 100 / total);
                        if (p != last) {
                            last = p;
                            progress.percent(p);
                        }
                    }
                }
            }
            if (total > 0 && got != total) throw new IOException("The download was cut off.");
        } finally {
            c.disconnect();
        }
        if (!part.renameTo(apk)) throw new IOException("Couldn’t save the download.");
        check(ctx, apk);
        return apk;
    }

    /** Logbook, and newer than this one (a half-downloaded or wrong file fails here, not in the installer). */
    private static void check(Context ctx, File apk) throws IOException, NotNewer {
        PackageManager pm = ctx.getPackageManager();
        PackageInfo got = pm.getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        if (got == null) throw new IOException("The download isn’t a working app file.");
        if (!ctx.getPackageName().equals(got.packageName)) throw new IOException("That file isn’t Logbook.");
        PackageInfo have;
        try {
            have = pm.getPackageInfo(ctx.getPackageName(), 0);
        } catch (PackageManager.NameNotFoundException e) {
            throw new IOException("Couldn’t read this app’s version.");
        }
        if (versionCode(got) <= versionCode(have)) throw new NotNewer();
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo p) {
        return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
    }

    /** Hands the APK to Android's installer, which asks the user to confirm. */
    static void openInstaller(Activity activity, File apk) {
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", apk);
        Intent install = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        activity.startActivity(install);
    }

    /** Removes a downloaded APK (after it's installed, or before the next download). */
    static void cleanUp(Context ctx) {
        File[] files = dir(ctx).listFiles();
        if (files == null) return;
        //noinspection ResultOfMethodCallIgnored
        for (File f : files) f.delete();
    }
}
