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
}
