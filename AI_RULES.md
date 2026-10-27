# AI_RULES.md - Project-Specific Guidelines

## Detailed notes: read on demand (kept out of this file on purpose)
Long reference material lives in `docs/` so it is not loaded on every turn. Before you start a task on one of these topics, read the matching note with read_file. It takes a little longer, and that is expected; tell Tim in a few words that you are reading it. Anything new you learn on these topics goes into the matching note, not into this file.
- `docs/voice-and-fractions.md`: read before touching speech recognition, the microphone, the auto-restart and idle limits, or how spoken fractions (32nds and 64ths) become numbers. It holds every recognizer quirk and fraction shape seen so far.
- `docs/conventions.md`: read before adding a feature or changing structure, styling or UI behavior. It holds the established code and UI conventions.
- `docs/backlog.md`: read when planning new work or when Tim asks what is next. It holds the deferred backlog agreed 2026-10-01.

## Stack & Versions
- **HTML5** (index.html)
- **CSS3** (custom properties, variables)
- **ECMAScript 2023** (vanilla JavaScript, no transpilation)
- No external libraries, frameworks, or build tools in the web app.
- No root package.json; therefore no npm scripts at the root. `mobile/` has its own package.json, but only for the Capacitor toolchain — it never touches the web app's source.
- **Android**: Capacitor 8 wrapper in `mobile/`, JDK 21, minSdk 24, compile/target SDK 36.
- **Android launcher icons are generated**, not hand-drawn: `mobile/scripts/make-icons.ps1` renders every `res/mipmap-*/ic_launcher*.png` from the master art `mobile/resources/app-icon-source.jpg`. Never edit those PNGs directly — replace the master and re-run the script.

## Entry Point
- `index.html` serves as the single-page application entry point.
- All logic, styling, and markup reside in this file.

## Scripts & Commands
- No defined npm scripts at the repo root (the Android project in `mobile/` has its own).
- There is no web hosting for this app any more. To try it in a browser, serve this folder with any static server, for example `python -m http.server`.

## Persistence
- Browser **localStorage** is used for persistent slot storage:
  - Slot images: `cutonce_slot_<n>` (dataURL PNG)
  - Slot metadata: `cutonce_slot_meta_<n>` (human‑readable timestamp)
- No server‑side databases or external APIs are used for persistence.

## External Integrations
- **Web Speech API** (`SpeechRecognition`) for voice‑to‑text number input.
- **Navigator.share API** for sharing the final image (web only, when available).
- **Android build only**: the `CutOnce` Capacitor plugin (on-device `SpeechRecognizer`, MediaStore gallery save), plus `@capacitor/share` and `@capacitor/filesystem`. Android WebView has neither the Web Speech API nor `navigator.share`, so these are not enhancements there — they are the only working paths. Details in `mobile/BUILD-ANDROID.md`.
- **Clipboard / File System** via `<input type="file">` for camera/gallery photos.
- No third‑party services, analytics, or APIs.

## Distribution
- Cut Once ships as an **Android app** (the APK is a GitHub Release), plus the how-to slideshow and install page at https://get.crackerbox.app/cut-once (served by the `get-crackerbox` repo, deployed by hand).
- The old web hosting was retired on 2026-10-27: the Cloudflare Workers deploy (`wrangler.json`, `.assetsignore`, the deploy workflow) and the old Cloudflare Pages project (cut-once.pages.dev) are gone. Nothing in this repo deploys to the web. Do not bring them back unless Tim asks.
- The app is still a single static file with no server logic.

## Native Android Build
Full instructions, the plugin contract, and the offline test checklist live in **`mobile/BUILD-ANDROID.md`**. The short version:

- `mobile/www/index.html` and `mobile/android/app/src/main/assets/public/index.html` are **generated**. The only source of truth is the root `index.html`, copied by `mobile/scripts/sync-www.mjs`.
- Every edit to `index.html` needs `npm run sync` (from `mobile/`) before the APK picks it up, then `gradlew.bat assembleDebug` (from `mobile/android/`).
- `gradlew.bat` needs `JAVA_HOME` and `ANDROID_HOME`. They are set at user/machine level, but a process only inherits variables that existed at launch — an already-open shell or the agent's own shell will not see them and Gradle fails with `JAVA_HOME is not set`. Restart the program or inject them for one command.
- The web app must keep working with **no bridge present**: `window.Capacitor` is undefined in a plain browser, `probeNative()` short-circuits, `nativeOk` stays false, and voice plus export take the original browser paths.

## Rules for Future Agents
- Preserve the **single‑file nature** of the app; do not split into multiple files unless absolutely necessary and only if the new files are still copied into the Android app by `mobile/scripts/sync-www.mjs`.
- Keep the **localStorage key format** (`cutonce_slot_*` and `cutonce_slot_meta_*`) unchanged to avoid breaking user data.
- Do **not** introduce any build step, bundler, or framework (e.g., React, Vue, Svelte, TypeScript) unless the user explicitly requests a migration; such a change would alter the deployment model.
- Maintain the **same CSS variable names** (`--bg`, `--ink`, `--pill`, etc.) if modifying theme‑related styles; otherwise update consistently.
- Preserve the **op-stack undo** (`ops`, `pushOp`/`replayOp`, `voicePoints` revival via `revivePoint`) unless a well‑justified change is made. It is **not** 12 ImageData snapshots any more — reverting it to snapshots would be a regression.
- Keep the **voice‑to‑text flow** (engine → `handleTranscript` → `formatMeasurement` → `fillText`) intact; any changes should retain the same behavior for number input. "Engine" means the browser `SpeechRecognition` on web and the `CutOnce` plugin's `listenOnce()` on Android.
- Do **not** remove or change the **share/save slot mechanics** without ensuring backward compatibility for existing slot data.
- If adding new features, follow the existing code style: vanilla JS, direct DOM manipulation, minimal abstractions, and avoid global namespace pollution where possible (though the current code already uses globals).
- Ensure any new code works in modern browsers that support the Web Speech API and Navigator.share (graceful fallbacks are already present).
- The app must keep working as a plain static page (served from any local static server) as well as inside the Android app.
- **Voice has two engines behind one handler.** Any new spoken command goes in `handleTranscript()`, never in an engine-specific callback, or the web and Android builds drift apart. Likewise keep the plugin's error codes Web-Speech-compatible so `handleVoiceError()` stays shared.
- Reach native plugins through `window.Capacitor.nativePromise(plugin, method, opts)`. `registerPlugin()` is **not** available — it lives in `@capacitor/core`, which is deliberately not bundled.
- Never hand-edit `mobile/www/**` or `mobile/android/app/src/main/assets/**`; both are regenerated by `npm run sync`.
