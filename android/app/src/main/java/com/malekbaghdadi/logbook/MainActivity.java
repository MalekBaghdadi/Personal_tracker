package com.malekbaghdadi.logbook;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The lock-screen timer (LockTimerPlugin.java, src/lib/native.ts).
        registerPlugin(LockTimerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
