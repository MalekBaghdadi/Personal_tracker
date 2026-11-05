// Test driver for LogbookRest.java (the Android app's lock-screen Stop), run by e2e/native-rest.mjs
// on a plain JVM against the emulators:
//   java RestCli <authBase> <firestoreBase> <projectId> <apiKey> <uid> <refreshToken>
//                <entryId> <metricId> <startedAt> <localDate> <seconds> <logEntry>
// Prints the outcome (SAVED, GONE, RETRY, AUTH or ERROR).
import com.malekbaghdadi.logbook.LogbookRest;

public class RestCli {
    public static void main(String[] a) {
        LogbookRest.Session s = new LogbookRest.Session(a[4], a[5], a[3], a[2], a[0], a[1]);
        LogbookRest.Stop stop = new LogbookRest.Stop(a[6], a[7], a[8], a[9], Long.parseLong(a[10]), Boolean.parseBoolean(a[11]));
        System.out.println(LogbookRest.saveStop(s, stop, 5000));
    }
}
