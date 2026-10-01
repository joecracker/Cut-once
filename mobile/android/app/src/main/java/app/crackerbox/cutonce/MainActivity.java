package app.crackerbox.cutonce;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // must be registered before super.onCreate() builds the bridge
        registerPlugin(CutOncePlugin.class);
        super.onCreate(savedInstanceState);
    }

    // These two are the authoritative foreground signal. The plugin also gets
    // Capacitor's handleOnPause(), but driving it from here means the mic is
    // released even if that dispatch ever changes or fails.
    // public, not protected: BridgeActivity widens both of these.
    @Override
    public void onResume() {
        super.onResume();
        CutOncePlugin.enteredForeground();
    }

    @Override
    public void onPause() {
        super.onPause();
        CutOncePlugin.enteredBackground();
    }
}
