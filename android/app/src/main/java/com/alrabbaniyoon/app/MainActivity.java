package com.alrabbaniyoon.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SettingsOpenerPlugin.class);
        registerPlugin(BackgroundAudioPlugin.class);
        registerPlugin(CompassPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
