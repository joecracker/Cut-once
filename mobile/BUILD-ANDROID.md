# Building the Cut Once Android app

The web app (`../index.html`, served by Cloudflare Workers) and the Android app
are the **same document**. There is no separate mobile codebase and no build
step for the web side — `scripts/sync-www.mjs` copies `index.html` into
`www/`, and Capacitor bundles that into the APK.

So: edit `../index.html`, then sync and rebuild. Never edit `www/index.html` or
`android/app/src/main/assets/public/index.html` — both are generated and will
be overwritten.

## Prerequisites

| Thing | Value on this machine |
|---|---|
| JDK | 21 — `C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot` |
| Android SDK | `C:\Users\user\AppData\Local\Android\Sdk` |
| Platform / build-tools | android-36 / 36.0.0 |
| Gradle | none installed globally; the wrapper fetches 8.14.3 |

Capacitor 8 requires JDK 21 (17+ tolerated), minSdk 24, compile/target SDK 36.

`JAVA_HOME` and `ANDROID_HOME` are set at the user/machine level. **A process
only inherits environment variables that existed when it launched** — so a
terminal, IDE, or agent shell that was already open will not see them, and
`gradlew.bat` fails with `JAVA_HOME is not set and no 'java' command could be
found in your PATH`. Restart the program, or inject them for one command:

```powershell
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot'
$env:ANDROID_HOME='C:\Users\user\AppData\Local\Android\Sdk'
```

## Build

```powershell
cd mobile
npm install          # first time only
npm run sync         # runs sync-www (presync hook) then cap sync android
cd android
./gradlew.bat assembleDebug
```

APK lands at `mobile/android/app/build/outputs/apk/debug/app-debug.apk`
(~4.4 MB, debug-signed, `applicationId: app.crackerbox.cutonce`).

`npm run sync` must be re-run after **every** edit to `../index.html`, or the
APK silently keeps the old copy.

## Install

```powershell
adb install -r mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

Requires USB debugging on the device. `npm run open` launches Android Studio
instead, if you prefer to run from there.

## Why the native half exists

Two things a browser cannot do:

1. **Offline speech.** The Web Speech API streams audio to Google's servers.
   In a dead-signal crawlspace it returns nothing. `CutOncePlugin` uses
   Android's own `SpeechRecognizer` with `EXTRA_PREFER_OFFLINE`, which runs
   against the on-device language model. This is not an enhancement in the
   APK — it is the *only* speech path, because Android WebView implements
   neither `SpeechRecognition` nor `webkitSpeechRecognition`.
2. **Saving to the gallery.** A WebView anchor download goes nowhere useful,
   and the Web Share API is absent too. `saveToGallery()` writes through
   MediaStore into `Pictures/Cut Once`; sharing stages a PNG in Cache and
   hands its `file://` URI to the `@capacitor/share` plugin.

Offline recognition needs a **speech pack** installed (Settings → Language &
input → on-device speech). Without one the recognizer falls back to the
network and reports `network`, which the UI surfaces as *"No offline speech
pack installed"*.

## Plugin contract (`CutOnce`)

Reached from JS with `window.Capacitor.nativePromise('CutOnce', method, opts)`.
`registerPlugin()` is **not** available — it lives in `@capacitor/core`, which
isn't bundled. The bridge itself is injected before any page script runs, so
`window.Capacitor` needs no readiness check.

| Method | Resolves with |
|---|---|
| `check()` | `{ available, mic, service, offlineSupported }` |
| `listenOnce()` | `{ transcript }`, or `{ error, message }`, or `{ cancelled: true }` |
| `stop()` | `{ ok: true }` |
| `saveToGallery({ dataUrl, name })` | `{ ok: true, uri }`, or `{ ok: false, reason }` |

`listenOnce()` resolves **once per phrase** — `SpeechRecognizer` is not built
for continuous use. `index.html` owns the restart cadence in `runNativeLoop()`,
reusing the same `autoRestarts` / `MAX_AUTO_RESTARTS` budget as the web engine,
with a `NATIVE_RETRY_MS` pause so a failing recognizer can't hot-loop. Plain
silence (`no-speech`) restarts for free and never touches that budget — walking
between marks is not a failure; only real errors count against it.

The plugin translates Android's numeric errors into Web Speech code names
(`network`, `no-speech`, `audio-capture`, `not-allowed`, `busy`), so both
engines share one `handleVoiceError()` and one `handleTranscript()`. Errors
added in API 31 fall through to `error-N`.

`saveToGallery()` returns `{ ok: false, reason: 'unsupported' }` below
Android 10 (no scoped-storage MediaStore route), and JS then falls through to
the share sheet rather than failing.

## Testing checklist

The point of the whole exercise is offline voice, so test it offline:

1. Install the APK, grant the microphone prompt.
2. **Airplane mode on.** Tap the mic — the toast should read
   *"Listening… on-device"*.
3. Tap a spot, say a number ("nine and a half" → `9½`), confirm it lands.
4. Say "next", then a second number. Say "back" and confirm it undoes.
5. Tap Send — the Android share sheet should appear.
6. Tap Download — the PNG should land in `Pictures/Cut Once`.
7. Background the app mid-listen and return; the mic should not be wedged
   (`handleOnPause` cancels the pending phrase).

Also re-check the **web** deploy after any voice change: with no bridge,
`probeNative()` short-circuits, `nativeOk` stays false, and both
`exportImage()` and `startVoice()` take the original browser paths.

## Deploy note

`mobile` is listed in the root `.assetsignore`, so `wrangler publish` skips
the entire Android project. Keep it there — otherwise every deploy uploads
the Gradle wrapper, launcher PNGs and build scripts as static assets.
