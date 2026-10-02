package app.crackerbox.cutonce;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // must be registered before super.onCreate() builds the bridge
        registerPlugin(CutOncePlugin.class);
        super.onCreate(savedInstanceState);

        // Capacitor 8's core library has no back-button handling at all — that
        // lives in @capacitor/app, which is deliberately not a dependency. So
        // without this, Android's Back exits the app even while the settings or
        // slots overlay is open. The web side already pushes one history entry
        // per open panel in openModal(), so goBack() pops that entry and the
        // resulting popstate closes the panel through the normal path.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge().getWebView();
                if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                // Nothing left to pop: hand the press back to the default
                // handler, which finishes the activity. Disabling ourselves
                // first stops the dispatcher looping straight back in here.
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
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
