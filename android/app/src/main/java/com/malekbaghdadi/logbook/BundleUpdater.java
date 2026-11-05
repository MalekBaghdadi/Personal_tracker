package com.malekbaghdadi.logbook;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Keeps the web app inside the APK up to date without a new APK, from the live site on Firebase
 * Hosting (free): every `npm run build` writes dist/app-bundle.json (scripts/bundle-manifest.mjs)
 * listing each file with its SHA-256. A newer list is downloaded into files/bundles/<version>
 * (unchanged files are copied from the current bundle, every file is checked against its hash),
 * and the web app switches to it at a quiet moment, the same rule as the PWA's silent updates.
 * A new APK always starts from the bundle inside it again (Capacitor's isNewBinary()).
 */
final class BundleUpdater {

    private BundleUpdater() {}

    /** Capacitor reads this on start-up (Bridge.java) to serve a downloaded bundle. */
    static final String CAP_PREFS = "CapWebViewSettings";
    static final String CAP_SERVER_PATH = "serverBasePath";

    private static final Object LOCK = new Object();

    static File root(Context ctx) {
        return new File(ctx.getFilesDir(), "bundles");
    }

    /**
     * Returns {status: current | ready | needs-apk | error, version}. `servingDir` is the bundle
     * directory in use, or null while the APK's own copy is served.
     */
    static JSONObject prepare(Context ctx, String base, String current, int nativeApi, String servingDir) {
        synchronized (LOCK) {
            JSONObject out = new JSONObject();
            try {
                JSONObject manifest = new JSONObject(new String(get(base + "/app-bundle.json?t=" + System.currentTimeMillis()), "UTF-8"));
                String version = manifest.getString("version");
                out.put("version", version);
                if (!version.matches("[A-Za-z0-9._-]{1,64}")) throw new IOException("bad version");
                // What's served now: the APK's copy or a downloaded bundle, each with its manifest.
                JSONObject serving = currentManifest(ctx, servingDir);
                String servingVersion = serving == null ? current : serving.optString("version", current);
                if (version.equals(servingVersion) || version.equals(current)) return out.put("status", "current");
                // Never back to an older build (an APK built before the last deploy, or after).
                String builtAt = manifest.optString("builtAt", "");
                String servingBuiltAt = serving == null ? "" : serving.optString("builtAt", "");
                if (!builtAt.isEmpty() && !servingBuiltAt.isEmpty() && builtAt.compareTo(servingBuiltAt) <= 0) {
                    return out.put("status", "current");
                }
                if (manifest.optInt("minNative", 1) > nativeApi) return out.put("status", "needs-apk");

                File dir = new File(root(ctx), version);
                cleanUp(ctx, servingDir, dir);
                if (new File(dir, ".complete").exists()) return out.put("status", "ready");

                File tmp = new File(root(ctx), version + ".part");
                deleteTree(tmp);
                if (!tmp.mkdirs()) throw new IOException("can't create " + tmp);

                Map<String, String> have = currentHashes(ctx, servingDir);
                JSONArray files = manifest.getJSONArray("files");
                for (int i = 0; i < files.length(); i++) {
                    JSONObject f = files.getJSONObject(i);
                    String path = f.getString("path");
                    String sha = f.getString("sha256");
                    if (path.startsWith("/") || path.contains("..") || path.contains("\\")) throw new IOException("bad path " + path);
                    File target = new File(tmp, path);
                    File parent = target.getParentFile();
                    if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("can't create " + parent);
                    byte[] bytes = sha.equals(have.get(path)) ? readCurrent(ctx, servingDir, path) : null;
                    if (bytes == null || !sha.equals(sha256(bytes))) bytes = get(base + "/" + path);
                    if (!sha.equals(sha256(bytes))) throw new IOException("hash mismatch for " + path);
                    try (OutputStream o = new FileOutputStream(target)) {
                        o.write(bytes);
                    }
                }
                try (OutputStream o = new FileOutputStream(new File(tmp, "app-bundle.json"))) {
                    o.write(manifest.toString().getBytes("UTF-8"));
                }
                if (!new File(tmp, ".complete").createNewFile()) throw new IOException("can't mark complete");
                deleteTree(dir);
                if (!tmp.renameTo(dir)) throw new IOException("can't move bundle into place");
                return out.put("status", "ready");
            } catch (Exception e) {
                try {
                    return out.put("status", "error").put("message", String.valueOf(e.getMessage()));
                } catch (JSONException je) {
                    return out;
                }
            }
        }
    }

    /** The directory to serve for `version`, or null if it isn't fully downloaded. */
    static String readyPath(Context ctx, String version) {
        File dir = new File(root(ctx), version);
        return new File(dir, ".complete").exists() ? dir.getAbsolutePath() : null;
    }

    static void persist(Context ctx, String path) {
        SharedPreferences prefs = ctx.getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(CAP_SERVER_PATH, path).commit();
    }

    private static void cleanUp(Context ctx, String servingDir, File keep) {
        File[] all = root(ctx).listFiles();
        if (all == null) return;
        for (File f : all) {
            String p = f.getAbsolutePath();
            if (p.equals(keep.getAbsolutePath()) || (servingDir != null && p.equals(new File(servingDir).getAbsolutePath()))) continue;
            deleteTree(f);
        }
    }

    private static JSONObject currentManifest(Context ctx, String servingDir) {
        try {
            byte[] raw = readCurrent(ctx, servingDir, "app-bundle.json");
            return raw == null ? null : new JSONObject(new String(raw, "UTF-8"));
        } catch (Exception e) {
            return null;
        }
    }

    private static Map<String, String> currentHashes(Context ctx, String servingDir) {
        Map<String, String> out = new HashMap<>();
        try {
            JSONObject manifest = currentManifest(ctx, servingDir);
            if (manifest == null) return out;
            JSONArray files = manifest.getJSONArray("files");
            for (int i = 0; i < files.length(); i++) {
                JSONObject f = files.getJSONObject(i);
                out.put(f.getString("path"), f.getString("sha256"));
            }
        } catch (Exception e) {
            // Download everything.
        }
        return out;
    }

    private static byte[] readCurrent(Context ctx, String servingDir, String path) {
        try {
            InputStream in = servingDir != null
                ? new FileInputStream(new File(servingDir, path))
                : ctx.getAssets().open("public/" + path);
            return readAll(in);
        } catch (IOException e) {
            return null;
        }
    }

    private static byte[] get(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15_000);
        c.setReadTimeout(30_000);
        c.setUseCaches(false);
        try {
            int status = c.getResponseCode();
            if (status != 200) throw new IOException("HTTP " + status + " for " + url);
            return readAll(c.getInputStream());
        } finally {
            c.disconnect();
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        try (InputStream is = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = is.read(buf)) != -1) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    static String sha256(byte[] bytes) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void deleteTree(File f) {
        if (!f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
