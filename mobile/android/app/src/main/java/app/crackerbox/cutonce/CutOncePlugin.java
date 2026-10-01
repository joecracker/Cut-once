package app.crackerbox.cutonce;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.OutputStream;
import java.util.ArrayList;

/**
 * Native half of Cut Once.
 *
 * Two jobs the browser cannot do:
 *
 * 1. Offline speech. The Web Speech API ships audio to Google's servers and
 *    streams text back, which is useless in a dead-signal crawlspace. Android's
 *    own SpeechRecognizer with EXTRA_PREFER_OFFLINE runs against the on-device
 *    language model instead.
 *
 * 2. Saving a PNG into the system gallery. A WebView anchor download goes
 *    nowhere useful, so the export is handed to MediaStore directly.
 *
 * The speech API is deliberately one promise per utterance (listenOnce) rather
 * than a start/stop + event stream: the web side already owns the "keep
 * listening until the user taps the mic off" loop, and this keeps the plugin
 * reachable through window.Capacitor.nativePromise() with no bundler, no
 * registerPlugin, and no listener lifecycle to leak.
 */
@CapacitorPlugin(
    name = "CutOnce",
    permissions = { @Permission(alias = CutOncePlugin.MIC_ALIAS, strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class CutOncePlugin extends Plugin {

    static final String MIC_ALIAS = "microphone";

    private static final String LANG = "en-US";

    private final Handler main = new Handler(Looper.getMainLooper());

    /** The live listenOnce() call, or null when nothing is awaiting a phrase. */
    private volatile PluginCall pending;

    private SpeechRecognizer recognizer;

    /**
     * One plugin instance, one activity. MainActivity drives this from its own
     * onPause/onResume rather than trusting Capacitor to dispatch
     * handleOnPause() here — see enteredBackground().
     */
    private static volatile CutOncePlugin active;

    private volatile boolean foreground = true;

    // ---------------------------------------------------------------- speech

    @PluginMethod
    public void check(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        boolean available = false;
        String service = "";
        try {
            available = SpeechRecognizer.isRecognitionAvailable(getContext());
            ResolveInfo info = pm.resolveActivity(new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH), 0);
            if (info != null && info.serviceInfo != null) {
                service = info.serviceInfo.packageName;
            } else if (info != null && info.activityInfo != null) {
                service = info.activityInfo.packageName;
            }
        } catch (Exception ignored) {
            // some OEM builds throw instead of reporting "no recognizer"
        }
        JSObject ret = new JSObject();
        ret.put("available", available);
        ret.put("mic", pm.hasSystemFeature(PackageManager.FEATURE_MICROPHONE));
        ret.put("service", service);
        ret.put("offlineSupported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M);
        call.resolve(ret);
    }

    /**
     * Resolves once with { transcript } or { error, message } when the
     * recognizer produces a phrase or gives up on one. Call it again to keep
     * listening — that mirrors how the web version restarts after each result.
     */
    @PluginMethod
    public void listenOnce(PluginCall call) {
        if (getPermissionState(MIC_ALIAS) != PermissionState.GRANTED) {
            requestPermissionForAlias(MIC_ALIAS, call, "micPermissionResult");
            return;
        }
        beginListen(call);
    }

    @PermissionCallback
    private void micPermissionResult(PluginCall call) {
        if (getPermissionState(MIC_ALIAS) == PermissionState.GRANTED) {
            beginListen(call);
        } else {
            call.resolve(errorResult("not-allowed", "Microphone permission denied"));
        }
    }

    /** Cancels an in-flight listenOnce and tears the recognizer down. */
    @PluginMethod
    public void stop(PluginCall call) {
        forceStop();
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    private void beginListen(PluginCall call) {
        // The web loop can wake from its retry sleep after the activity has
        // already paused. Starting a recognizer then leaves the mic recording
        // for as long as the app sits in recents, so refuse outright instead of
        // depending on the loop noticing in time.
        if (!foreground) {
            call.resolve(cancelledResult());
            return;
        }
        PluginCall waiting = takePending();
        if (waiting != null) {
            // only one phrase can be awaited at a time; don't strand the caller
            waiting.resolve(errorResult("busy", "Recognizer already busy"));
        }
        pending = call;
        getActivity()
            .runOnUiThread(() -> {
                if (recognizer == null) {
                    recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                    recognizer.setRecognitionListener(listener);
                }
                try {
                    recognizer.startListening(recognizerIntent());
                } catch (Exception ex) {
                    PluginCall stranded = takePending();
                    if (stranded != null) stranded.resolve(errorResult("client", String.valueOf(ex.getMessage())));
                }
            });
    }

    private Intent recognizerIntent() {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, LANG);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, LANG);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // the whole point of going native: recognize on the device, no signal needed
            intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        }
        return intent;
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override
        public void onReadyForSpeech(Bundle params) {}

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {}

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {}

        @Override
        public void onPartialResults(Bundle partialResults) {}

        @Override
        public void onEvent(int eventType, Bundle params) {}

        @Override
        public void onResults(Bundle results) {
            PluginCall call = takePending();
            if (call == null) return;
            JSObject ret = new JSObject();
            ret.put("transcript", firstTranscript(results));
            call.resolve(ret);
        }

        @Override
        public void onError(int error) {
            PluginCall call = takePending();
            if (call == null) return;
            call.resolve(errorResult(codeFor(error), messageFor(error)));
        }
    };

    private static String firstTranscript(Bundle results) {
        if (results == null) return "";
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) return "";
        String first = matches.get(0);
        return first == null ? "" : first.trim();
    }

    /**
     * Maps Android's numeric errors onto the names the web handler already
     * knows. Codes added in API 31 (too many requests, server disconnected,
     * language not supported) fall through to "error-N".
     */
    private static String codeFor(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_NETWORK:
                return "network";
            case SpeechRecognizer.ERROR_AUDIO:
                return "audio-capture";
            case SpeechRecognizer.ERROR_SERVER:
                return "server";
            case SpeechRecognizer.ERROR_CLIENT:
                return "client";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "no-speech";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "busy";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "not-allowed";
            default:
                return "error-" + error;
        }
    }

    private static String messageFor(int error) {
        switch (codeFor(error)) {
            case "network":
                return "No signal and no offline speech pack";
            case "audio-capture":
                return "Microphone unavailable";
            case "not-allowed":
                return "Microphone permission denied";
            case "no-speech":
                return "Didn't catch that";
            default:
                return "Recognizer error " + error;
        }
    }

    private static JSObject errorResult(String code, String message) {
        JSObject ret = new JSObject();
        ret.put("error", code);
        ret.put("message", message);
        return ret;
    }

    private static JSObject cancelledResult() {
        JSObject ret = new JSObject();
        ret.put("cancelled", true);
        return ret;
    }

    private PluginCall takePending() {
        PluginCall call = pending;
        pending = null;
        return call;
    }

    private void destroyRecognizer() {
        getActivity()
            .runOnUiThread(() -> {
                if (recognizer != null) {
                    try {
                        recognizer.cancel();
                        recognizer.destroy();
                    } catch (Exception ignored) {}
                    recognizer = null;
                }
            });
    }

    // ---------------------------------------------------------------- gallery

    /**
     * Writes a PNG data URL into Pictures/Cut Once via MediaStore.
     * Resolves { ok:false, reason:"unsupported" } below Android 10 so the web
     * side can fall back to the share sheet instead of failing silently.
     */
    @PluginMethod
    public void saveToGallery(PluginCall call) {
        String dataUrl = call.getString("dataUrl", "");
        String name = call.getString("name", "cut-once.png");

        byte[] bytes;
        try {
            int comma = dataUrl.indexOf(',');
            bytes = Base64.decode(comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl, Base64.DEFAULT);
        } catch (IllegalArgumentException ex) {
            call.reject("Not a valid data URL");
            return;
        }
        if (bytes == null || bytes.length == 0) {
            call.reject("Empty image data");
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.resolve(galleryFailure("unsupported"));
            return;
        }

        try {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Cut Once");
            values.put(MediaStore.Images.Media.IS_PENDING, 1);

            Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                call.resolve(galleryFailure("insert-failed"));
                return;
            }
            OutputStream out = resolver.openOutputStream(uri);
            if (out == null) {
                call.resolve(galleryFailure("no-stream"));
                return;
            }
            try {
                out.write(bytes);
            } finally {
                out.close();
            }
            values.clear();
            values.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, values, null, null);

            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception ex) {
            call.resolve(galleryFailure(ex.getMessage() == null ? "error" : ex.getMessage()));
        }
    }

    private static JSObject galleryFailure(String reason) {
        JSObject ret = new JSObject();
        ret.put("ok", false);
        ret.put("reason", reason);
        return ret;
    }

    // ---------------------------------------------------------------- lifecycle

    @Override
    public void load() {
        active = this;
    }

    /**
     * Releases the mic and refuses to take it back until the activity resumes.
     *
     * Capacitor does dispatch handleOnPause() to plugins, but that alone left a
     * hole: when the activity paused between phrases there was no pending call
     * to cancel, so the web loop woke from its retry sleep, saw nothing had
     * told it to stop, and started a brand new recognizer in the background.
     * Since silence restarts for free at that cadence, the mic then stayed hot
     * indefinitely. Blocking beginListen() on the foreground flag closes it no
     * matter what the web side does.
     */
    static void enteredBackground() {
        CutOncePlugin plugin = active;
        if (plugin == null) return;
        plugin.foreground = false;
        plugin.forceStop();
    }

    static void enteredForeground() {
        CutOncePlugin plugin = active;
        if (plugin != null) plugin.foreground = true;
    }

    /** Tears the recognizer down and settles any awaiting listenOnce(). */
    private void forceStop() {
        PluginCall waiting = takePending();
        destroyRecognizer();
        if (waiting != null) waiting.resolve(cancelledResult());
    }

    @Override
    protected void handleOnPause() {
        enteredBackground();
    }

    @Override
    protected void handleOnDestroy() {
        forceStop();
        super.handleOnDestroy();
    }
}
