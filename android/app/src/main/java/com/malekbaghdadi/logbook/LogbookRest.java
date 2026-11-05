package com.malekbaghdadi.logbook;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Saves a timer stopped from the lock screen, over Firestore's REST API, with no Android classes
 * so it runs (and is tested, e2e/native-rest.mjs) on a plain JVM against the emulators.
 *
 * It writes exactly what stopTimer() in src/lib/repo.ts writes, in one atomic commit: the timer
 * entry (same fields and types as buildEntry), the deleted state/timer doc and the
 * state/timerClosed marker. The commit only goes through if state/timer is still the doc we read,
 * so a timer stopped (or replaced) on another device in the meantime is never logged twice.
 */
public final class LogbookRest {

    private LogbookRest() {}

    public static final String DEFAULT_AUTH_BASE = "https://securetoken.googleapis.com";
    public static final String DEFAULT_FIRESTORE_BASE = "https://firestore.googleapis.com";

    /** How a stop went. RETRY: no network (try again later). AUTH: the session no longer works. */
    public enum Outcome {
        SAVED,
        GONE,
        RETRY,
        AUTH,
        ERROR,
    }

    /** The signed-in account, as handed over by the web app. */
    public static final class Session {
        public final String uid;
        public final String refreshToken;
        public final String apiKey;
        public final String projectId;
        public final String authBase;
        public final String firestoreBase;

        public Session(String uid, String refreshToken, String apiKey, String projectId, String authBase, String firestoreBase) {
            this.uid = uid;
            this.refreshToken = refreshToken;
            this.apiKey = apiKey;
            this.projectId = projectId;
            this.authBase = authBase == null || authBase.isEmpty() ? DEFAULT_AUTH_BASE : authBase;
            this.firestoreBase = firestoreBase == null || firestoreBase.isEmpty() ? DEFAULT_FIRESTORE_BASE : firestoreBase;
        }
    }

    /** One stop to save. `seconds` <= 0 or `logEntry` false: stop the timer without logging. */
    public static final class Stop {
        public final String entryId;
        public final String metricId;
        public final String startedAt;
        public final String localDate;
        public final long seconds;
        public final boolean logEntry;

        public Stop(String entryId, String metricId, String startedAt, String localDate, long seconds, boolean logEntry) {
            this.entryId = entryId;
            this.metricId = metricId;
            this.startedAt = startedAt;
            this.localDate = localDate;
            this.seconds = seconds;
            this.logEntry = logEntry;
        }
    }

    /** Thrown for network failures and for 5xx/429 answers: worth retrying. */
    public static final class Transient extends IOException {
        public Transient(String message) {
            super(message);
        }
    }

    /** Thrown for a 4xx that retrying won't fix (for example the rules refused the write). */
    public static final class Refused extends IOException {
        public Refused(String message) {
            super(message);
        }
    }

    /** Thrown when the refresh token is refused (password changed, account removed, signed out). */
    public static final class AuthFailed extends IOException {
        public AuthFailed(String message) {
            super(message);
        }
    }

    private static final class Response {
        final int status;
        final String body;

        Response(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }

    public static Outcome saveStop(Session session, Stop stop, int timeoutMs) {
        try {
            String idToken = idToken(session, timeoutMs);
            // Twice at most: a failed precondition means state/timer changed between read and commit.
            for (int attempt = 0; attempt < 3; attempt++) {
                Response timer = request("GET", docUrl(session, "users/" + session.uid + "/state/timer"), idToken, null, timeoutMs);
                if (timer.status == 404) return Outcome.GONE;
                check(timer);
                JSONObject doc = new JSONObject(timer.body);
                JSONObject fields = doc.optJSONObject("fields");
                String startedAt = fields == null ? null : stringField(fields, "startedAt");
                String metricId = fields == null ? null : stringField(fields, "metricId");
                if (!stop.startedAt.equals(startedAt) || !stop.metricId.equals(metricId)) return Outcome.GONE;

                Response commit = request("POST", commitUrl(session), idToken, commitBody(session, stop, doc.getString("updateTime"), nowIso()).toString(), timeoutMs);
                if (commit.status == 400 || commit.status == 409) {
                    if (commit.body.contains("FAILED_PRECONDITION") || commit.body.contains("ABORTED")) continue;
                }
                check(commit);
                return Outcome.SAVED;
            }
            return Outcome.RETRY;
        } catch (AuthFailed e) {
            return Outcome.AUTH;
        } catch (Refused e) {
            return Outcome.ERROR;
        } catch (Transient e) {
            return Outcome.RETRY;
        } catch (IOException e) {
            // Connection refused, DNS, timeouts: the network, not the request.
            return Outcome.RETRY;
        } catch (JSONException | RuntimeException e) {
            return Outcome.ERROR;
        }
    }

    static JSONObject commitBody(Session s, Stop stop, String timerUpdateTime, String now) throws JSONException {
        JSONArray writes = new JSONArray();
        String base = "projects/" + s.projectId + "/databases/(default)/documents/users/" + s.uid;
        if (stop.logEntry && stop.seconds > 0) {
            JSONObject f = new JSONObject();
            f.put("id", str(stop.entryId));
            f.put("metricId", str(stop.metricId));
            f.put("localDate", str(stop.localDate));
            f.put("value", new JSONObject().put("integerValue", Long.toString(stop.seconds)));
            f.put("source", str("timer"));
            f.put("note", nul());
            f.put("occurredAt", str(stop.startedAt));
            f.put("createdAt", str(now));
            f.put("updatedAt", str(now));
            f.put("deletedAt", nul());
            writes.put(new JSONObject().put("update", new JSONObject().put("name", base + "/entries/" + stop.entryId).put("fields", f)));
        }
        writes.put(
            new JSONObject()
                .put("delete", base + "/state/timer")
                .put("currentDocument", new JSONObject().put("updateTime", timerUpdateTime))
        );
        JSONObject closed = new JSONObject().put("startedAt", str(stop.startedAt)).put("closedAt", str(now));
        writes.put(new JSONObject().put("update", new JSONObject().put("name", base + "/state/timerClosed").put("fields", closed)));
        return new JSONObject().put("writes", writes);
    }

    private static String idToken(Session s, int timeoutMs) throws IOException, JSONException {
        String url = s.authBase + "/v1/token?key=" + enc(s.apiKey);
        String body = "grant_type=refresh_token&refresh_token=" + enc(s.refreshToken);
        HttpURLConnection c = open("POST", url, null, timeoutMs);
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        Response r = send(c, body);
        if (r.status == 400 || r.status == 401 || r.status == 403) throw new AuthFailed(r.body);
        check(r);
        JSONObject json = new JSONObject(r.body);
        String uid = json.optString("user_id", "");
        if (!uid.isEmpty() && !uid.equals(s.uid)) throw new AuthFailed("token belongs to another account");
        return json.getString("id_token");
    }

    private static Response request(String method, String url, String idToken, String body, int timeoutMs) throws IOException {
        HttpURLConnection c = open(method, url, idToken, timeoutMs);
        if (body != null) c.setRequestProperty("Content-Type", "application/json");
        return send(c, body);
    }

    private static HttpURLConnection open(String method, String url, String idToken, int timeoutMs) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(timeoutMs);
        c.setReadTimeout(timeoutMs);
        c.setUseCaches(false);
        if (idToken != null) c.setRequestProperty("Authorization", "Bearer " + idToken);
        return c;
    }

    private static Response send(HttpURLConnection c, String body) throws IOException {
        try {
            if (body != null) {
                c.setDoOutput(true);
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                c.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = c.getOutputStream()) {
                    out.write(bytes);
                }
            }
            int status = c.getResponseCode();
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            return new Response(status, in == null ? "" : readAll(in));
        } finally {
            c.disconnect();
        }
    }

    private static void check(Response r) throws IOException {
        if (r.status >= 200 && r.status < 300) return;
        if (r.status == 429 || r.status >= 500) throw new Transient("HTTP " + r.status);
        if (r.status == 401) throw new AuthFailed(r.body);
        throw new Refused("HTTP " + r.status + ": " + r.body);
    }

    private static String readAll(InputStream in) throws IOException {
        try (InputStream is = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) != -1) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    private static String docUrl(Session s, String path) {
        return s.firestoreBase + "/v1/projects/" + s.projectId + "/databases/(default)/documents/" + path;
    }

    private static String commitUrl(Session s) {
        return s.firestoreBase + "/v1/projects/" + s.projectId + "/databases/(default)/documents:commit";
    }

    private static String stringField(JSONObject fields, String name) {
        JSONObject f = fields.optJSONObject(name);
        return f == null ? null : f.optString("stringValue", null);
    }

    private static JSONObject str(String v) throws JSONException {
        return new JSONObject().put("stringValue", v);
    }

    private static JSONObject nul() throws JSONException {
        return new JSONObject().put("nullValue", JSONObject.NULL);
    }

    private static String enc(String v) throws IOException {
        return URLEncoder.encode(v, "UTF-8");
    }

    /** Same shape as JS toISOString(): 2026-11-05T15:09:36.312Z. */
    public static String iso(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }

    public static String nowIso() {
        return iso(System.currentTimeMillis());
    }
}
