# AI_RULES.md - Project-Specific Guidelines

## Stack & Versions
- **HTML5** (index.html)
- **CSS3** (custom properties, variables)
- **ECMAScript 2023** (vanilla JavaScript, no transpilation)
- No external libraries, frameworks, or build tools in the web app.
- No root package.json; therefore no npm scripts at the root. `mobile/` has its own package.json, but only for the Capacitor toolchain — it never touches the web app's source.
- **Android**: Capacitor 8 wrapper in `mobile/`, JDK 21, minSdk 24, compile/target SDK 36.

## Entry Point
- `index.html` serves as the single-page application entry point.
- All logic, styling, and markup reside in this file.

## Scripts & Commands
- No defined npm scripts.
- Development: `wrangler dev` (starts Cloudflare Workers dev server).
- Publishing: `wrangler publish` (deploys to Cloudflare Workers).
- The project relies entirely on Wrangler for building and serving.

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

## Deployment Constraints
- Deployed to **Cloudflare Workers**.
- Configured in `wrangler.json`:
  - `name`: "cut-once"
  - `compatibility_date`: "2026-08-29"
  - `workers_dev`: true
  - `assets`: serves directory `./` with SPA fallback (`not_found_handling`: "single-page-application")
  - `routes`: pattern `cutonce.crackerbox.app` with custom domain.
- The app must be served as a static SPA; all routes fallback to `index.html`.
- `mobile` is listed in `.assetsignore` so the Android project is never uploaded as a static asset. Keep it there.

## Native Android Build
Full instructions, the plugin contract, and the offline test checklist live in **`mobile/BUILD-ANDROID.md`**. The short version:

- `mobile/www/index.html` and `mobile/android/app/src/main/assets/public/index.html` are **generated**. The only source of truth is the root `index.html`, copied by `mobile/scripts/sync-www.mjs`.
- Every edit to `index.html` needs `npm run sync` (from `mobile/`) before the APK picks it up, then `gradlew.bat assembleDebug` (from `mobile/android/`).
- `gradlew.bat` needs `JAVA_HOME` and `ANDROID_HOME`. They are set at user/machine level, but a process only inherits variables that existed at launch — an already-open shell or the agent's own shell will not see them and Gradle fails with `JAVA_HOME is not set`. Restart the program or inject them for one command.
- The web app must keep working with **no bridge present**: `window.Capacitor` is undefined on the Cloudflare deploy, `probeNative()` short-circuits, `nativeOk` stays false, and voice plus export take the original browser paths.

## Established Conventions
- **UI Layout**:
  - Fixed `<canvas id="pad">` for drawing, overlays `<img id="photoLayer">` for photos.
  - Toolbars: `.toolbar.primary` (bottom) and `.toolbar.secondary` (top‑right).
  - Voice markers (`#voiceMarks`, child `.cursor-indicator` dots) show tapped measurement spots; only the current one carries `.active` (pulsing), the rest are steady rings.
- **Drawing Modes**:
  - Tool cycles: pencil → straight line → eraser.
  - Undo stack limited to 12 steps (local `undoStack` of ImageData).
- **Theming**:
  - Two dark pads toggled via CSS variables `--bg` and `--ink`: `dark` (`#0b0b0c` / `#f4f4f2`) and `graphite` (`#2f3438` / `#e6e9ec`). There is **no light mode** — the cards and bubbles are hardcoded `#17171a` and never follow the theme, so a pale pad sat dark panels on a dirty-gray field.
  - Theme is not persisted; every load starts `dark`.
  - Photo mode overrides ink with a high‑visibility palette (`#c6ff00`, `#ff2d2d`, `#f4f4f2`, `#0b0b0c`).
- **Voice Input**:
  - Tap mic, then tap each spot to measure; each tap drops a marker (`voicePoints`).
  - Speaking a number draws it centered on the current marker (`voicePointIdx`) at `VOICE_FONT_SIZE` (18px) and removes that marker; no cursor advance.
  - Saying “next” advances to the next marker and moves the `.active` highlight (`syncActiveMark`); past the last marker it does nothing. There is no “next line” command.
  - Converts words to digits and formats fractions (e.g., “nine and a half” → “9½”).
- **Photo Handling**:
  - Loaded via camera or gallery inputs; displayed in `#photoLayer`.
  - When a photo is active, the ink palette is forced and the canvas is cleared on new photo load.
- **Sharing / Saving**:
  - Composite of background (or photo) + canvas ink is exported as PNG.
  - Uses `navigator.share` if available, otherwise triggers download.
- **Slots**:
  - Six numbered slots (1‑6) backed by localStorage.
  - Save/store current canvas (ink layer only) with timestamp metadata.
- **Miscellaneous**:
  - Touch actions disabled (`touch-action:none`) to prevent scrolling while drawing.
  - Splash screen on first load, dismissible via tap.
  - Info panel accessible via “i” button.

## Rules for Future Agents
- Preserve the **single‑file nature** of the app; do not split into multiple files unless absolutely necessary and only if the new files are still served as static assets via Wrangler.
- Keep the **localStorage key format** (`cutonce_slot_*` and `cutonce_slot_meta_*`) unchanged to avoid breaking user data.
- Do **not** introduce any build step, bundler, or framework (e.g., React, Vue, Svelte, TypeScript) unless the user explicitly requests a migration; such a change would alter the deployment model.
- Maintain the **same CSS variable names** (`--bg`, `--ink`, `--pill`, etc.) if modifying theme‑related styles; otherwise update consistently.
- Preserve the **undo limit (12)** and the **undo stack implementation** unless a well‑justified change is made.
- Keep the **voice‑to‑text flow** (engine → `handleTranscript` → `formatMeasurement` → `fillText`) intact; any changes should retain the same behavior for number input. "Engine" means the browser `SpeechRecognition` on web and the `CutOnce` plugin's `listenOnce()` on Android.
- Do **not** remove or change the **share/save slot mechanics** without ensuring backward compatibility for existing slot data.
- If adding new features, follow the existing code style: vanilla JS, direct DOM manipulation, minimal abstractions, and avoid global namespace pollution where possible (though the current code already uses globals).
- Ensure any new code works in modern browsers that support the Web Speech API and Navigator.share (graceful fallbacks are already present).
- Do not modify `wrangler.json` unless adjusting compatibility date, routes, or asset handling; the workers_dev flag should remain true for local development.
- The app must continue to pass as a valid Cloudflare Workers SPA; test with `wrangler dev` before deploying.
- **Voice has two engines behind one handler.** Any new spoken command goes in `handleTranscript()`, never in an engine-specific callback, or the web and Android builds drift apart. Likewise keep the plugin's error codes Web-Speech-compatible so `handleVoiceError()` stays shared.
- Reach native plugins through `window.Capacitor.nativePromise(plugin, method, opts)`. `registerPlugin()` is **not** available — it lives in `@capacitor/core`, which is deliberately not bundled.
- Never hand-edit `mobile/www/**` or `mobile/android/app/src/main/assets/**`; both are regenerated by `npm run sync`.
- The `MAX_AUTO_RESTARTS` (12) budget applies to both engines and counts **every** restart, silence included; any real result resets it to zero. It doubles as the idle timeout that ends an abandoned session, so do not make silence free again — that removes the only thing that ever releases the mic. The native loop adds a `NATIVE_RETRY_MS` pause between failed phrases — keep it, or a failing recognizer hot-loops.
- **The mic must never outlive the foreground.** `MainActivity.onPause()` sets the plugin's `foreground` flag and forces the recognizer down; `beginListen()` refuses to start while backgrounded. Keep that guard — the web listen loop can wake from its retry sleep *after* the activity has paused, and without it a fresh recognizer starts in the background and records indefinitely.
- Spoken 32nds/64ths are rewritten to ordinal form **before** `wordsToDigits`, which adds consecutive number words together ("three thirty" → 33) and would otherwise destroy the numerator. See `RE_32NDS` / `RE_64THS`. The settings panel's **"Last heard"** box shows raw transcripts verbatim — read it before adding any new fraction pattern, instead of guessing at what the recognizer emits.