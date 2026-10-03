# AI_RULES.md - Project-Specific Guidelines

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
  - Splash screen on first load; **the entire `#splash` overlay is the dismiss target** (one click listener on the container), so the bottom affordance is labelled "Tap anywhere to begin" rather than pretending only it works. That listener is on `#splash`, not on the image — keep the art inside the overlay so a tap anywhere still dismisses it.
  - Splash art is **one finished portrait raster: `splash-bg.jpg`** (768×1376, project root, listed in `WEB_FILES` in `mobile/scripts/sync-www.mjs`). The blade *and* the "CUT · ONCE" wordmark are both painted into that single frame, so there is **no live `#splashWord` and no `buildSplashBlade()`** any more. Do not reintroduce either — the name would render twice. `#splashArt` is a flex item with `object-fit:contain`, **never** `object-fit:cover`: cover is what amputated the old square artwork. `#splash`'s field is pure `#000` to match the image's own black background, so the thin bands above and below read as margin rather than letterboxing.
  - `#splashEnter` sits **below** the art as a normal flex item, not absolutely positioned, so it can never land on top of the painted wordmark on a short screen. It is a real `<button>` for keyboard users. The old `#splashFooter` / `#splashOpen` (green slab that existed to hide a baked-in banner) are **gone** — don't reintroduce them.
  - Both full-screen overlays (`#infoPanel`, `#slotPanel`) scroll and route through `openModal()`/`closeModal()`, which hold one history entry per open panel so browser back and Escape close them.
  - Info panel accessible via “i” button.

## Deferred Backlog (agreed with Tim 2026-10-01, not yet built)
None of these are urgent; batch them into a future build. Re-read this list before proposing "new" work — some of it is already queued.

- **Android hardware Back should close an open overlay.** Capacitor 8's core Android library has *no* back-button handling at all (verified in `mobile/node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java` and `BridgeActivity.java`); that lives in `@capacitor/app`, which is not a dependency. The web `openModal()` history entry is therefore inert on the phone and back exits the app. Fix = an `OnBackPressedDispatcher` callback in `MainActivity` that calls `getBridge().getWebView().goBack()` when `canGoBack()`, else falls through to the default exit. Changes app-exit behavior; verify on device.
- **`.toolbar.primary` horizontal scroll is dead to touch.** Same root cause as the overlay fix: the document-level non-passive `touchmove` `preventDefault()` cancels it. Exempt `.toolbar` in that handler if the overflow ever matters.
- **Cards eat their own horizontal padding.** There is no `box-sizing` anywhere; `#infoCard`/`#slotCard` are `content-box` with `width:100%`, so 40px of padding pushes them past the panel's content box. Cosmetic so far; fix per card, not with a global `box-sizing` reset.
- **`versionCode`/`versionName` never change** (1 / 1.0), so builds are indistinguishable on the device. Bump per release once APKs start being handed out.
- **No install link exists.** `gh release list` is empty; the APK is a local gitignored file installed with `adb install -r`. If Tim wants a shareable URL for workers, cut a GitHub Release with the APK attached — it is debug-signed, so Android warns on every install.

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
- Spoken 32nds/64ths are rewritten to ordinal form **before** `wordsToDigits`, which adds consecutive number words together ("three thirty" → 33, "five sixty" → 65) and would otherwise destroy the numerator. Eight rule families, applied in this order: `RE_SLASH_64`/`RE_SLASH_32` (the recognizer's own slash rendering), then `RE_OVER_64`/`RE_OVER_32` ("three over thirty-two", "over 64"), then `RE_64THS`/`RE_32NDS` (explicit unit: "five sixty-fourths", "64 seconds"), then `RE_BARE_64`/`RE_BARE_32` (numerator + denominator, no unit: "three thirty two"). Each rewrites to `" and <num> 32nds "`, which `ordFrac` stacks into glyphs. Both 64ths and 32nds carry a **digit arm** (`6[34]`, `3[02]`) because the recognizer often returns the ordinal as a bare cardinal — "64 seconds" used to render as `64`.
  - The bare rules **require** a numerator: `thirty two` alone is a legitimate 32" measurement, and `three hundred thirty two` still reads as `332` because the intervening word blocks the match.
  - A fifth shape: the recognizer **merges the numerator and denominator into one cardinal**. Tim's 64ths test came back verbatim as `5 and 264` and `7 and 864` ("two sixty-fourths", "eight sixty-fourths") — no unit word and no spelled denominator, so all four families above missed it and it rendered as a plain whole number. `RE_MERGED_64`/`RE_MERGED_32` (`\band\s+([1-9]\d?)\s*(?:6[34]|3[02])\b`) split that tail back out. **The mandatory `and` is load-bearing** — it is what separates a real `164"` ("one sixty-four") from `¹⁄₆₄"` — and so is the mandatory numerator, which keeps `"and 64"` ("two hundred and sixty-four") intact. Verified: `5 and 264` → `5 ²⁄₆₄`, `7 and 864` → `7 ⁸⁄₆₄`, `164` → `164`, `500 and 64` unchanged, `one hundred and sixty four` → `164`.
  - A sixth shape: on a bare merged fraction the recognizer keeps the **ordinal suffix** stuck on the end — "one thirty-second" comes back as `132nd`, "one sixty-fourth" as `164th` (device log 2026-10-02). `RE_ORD_MERGED_64`/`RE_ORD_MERGED_32` (`\b(\d{1,2})(?:6[34])(?:th|ths)\b` / `\b(\d{1,2})(?:3[02])(?:nd|nds)\b`) catch them. **That suffix is the only safe anchor here**: a real measurement never arrives as `164th`, so `132`/`164`/`264` pass through untouched, which is exactly why the fifth-shape rules can't just be loosened instead.
  - A seventh shape, same session: the numerator fuses onto the denominator's **digits** while the unit word stays spelled out — "one thirty-second" came back as `130 second` ("one thirty" collapsed to 130, "second" survived as a word). The digit arms inside `RE_32NDS`/`RE_64THS` can't see it, because `3[02]` needs a word boundary in front of it and there is none inside `130`. `RE_FUSED_32`/`RE_FUSED_64` (`\b(\d*?)3[02][\s-]+seconds?\b` / `\b(\d*?)6[34][\s-]+(?:seconds?|fourths?)\b`) capture the leading digits as the numerator; an empty prefix still means 1/32 (`30 seconds`), matching the older digit arms. This family only fires when a unit word follows, so a bare `130` is still 130". Verified: `130 second` → `¹⁄₃₂`, `530 second` → `⁵⁄₃₂`, `230 second` → `²⁄₃₂`, `564 fourths` → `⁵⁄₆₄`, `300`/`1300`/`132`/`164` untouched.
  - An eighth shape: a **bare fused cardinal with no `and`, no ordinal suffix and no unit word**. Verified on Tim's canvas 2026-10-02: "six sixty-fourths" arrives as `664` and "one sixty-four" as `164`, rendering as the whole numbers. `RE_BARE_MERGED_64` (`\b([1-9])6[34]\b`) splits it. This is the shape earlier notes said to leave alone — nothing in the text distinguishes 164" from ¹⁄₆₄" — and it is only tolerable because the **spelled route stays intact**: a real 164" spoken "one hundred sixty-four" keeps words between numerator and denominator, so `RE_BARE_64` can't match and `wordsToDigits` still returns 164. The cost Tim accepted: a genuine 164" spoken as a plain "one sixty-four" now reads as ¹⁄₆₄". Delete that one line if it bites. There is deliberately **no 32nd twin** — `132`/`130` stay whole numbers.
  - A ninth shape, Tim's canvas 2026-10-02: with a numerator in front, the recognizer uses its **own slash rendering** and then spells the unit word — "seven thirty-seconds" arrives as `7/30 seconds`, sometimes with a stray truncated denominator digit still in place (`7/3 30 seconds`). Every other family wants a word boundary before the denominator digits, and a slash supplies one, so the digit arms grabbed `30 seconds` and painted a naked `7/` on the canvas (`7/ ¹⁄₃₂`). `RE_SLASH_64`/`RE_SLASH_32` (`\b(and\s+)?(\d{1,2})\s*\/\s*(?:\d{1,2}\s+)?6[34]\s*(?:seconds?|fourths?)\b` / `...3[02]?\s*seconds?\b`) run **first**, take the numerator from before the slash, and keep the leading `and` so a whole number in front survives. The 32nd cue makes the trailing `0` optional because the truncation shows up as `3` as often as `30` — that is what finally catches the old `3/3 second`. Verified: `7/30 seconds` → `⁷⁄₃₂`, `Three and 7/30 seconds` → `3 ⁷⁄₃₂`, `3 and 7/3 30 seconds` → `3 ⁷⁄₃₂`, `3/3 second` → `³⁄₃₂`, `7/64 seconds` → `⁷⁄₆₄`, `5 and 7/6 64 seconds` → `5 ⁷⁄₆₄`. The unit-less `3/32` still goes through the trailing slash rule near the end of `formatMeasurement`.
  - Still unhandled on purpose: **4+ digit fusions** ("twenty-three sixty-fourths" as `2364`).
  - Known trade-off: the `over` rules make the word "over" a fraction trigger, so `over 32 inches` renders as `¹⁄₃₂"`. Tell Tim if he ever uses "over" as a dimension; deleting those two regexes is a one-line fix.
- The settings panel's **"Last heard"** box shows 20 entries of `raw   →   formatted` pairs (`logRawTranscript` on arrival, `logTranscriptResult` once `formatMeasurement` runs, rendered by `renderRawLog`). Read it before adding any new fraction pattern instead of guessing at what the recognizer emits — the arrow blames the recognizer or the formatter without ambiguity. Results log even when no spot was tapped, so a phrase can be tested without aiming first. `#rawLog` scrolls (`touch-action:pan-y`, 220px).
- **Overlays must opt back into touch scrolling.** `html,body{touch-action:none}` *and* the document-level non-passive `touchmove` `preventDefault()` both suppress scrolling in every descendant. Any new scrollable overlay needs `touch-action:pan-y` on its scroll container **and** an exemption in that touchmove handler (see `e.target.closest('#infoPanel,#slotPanel')`), or it scrolls under a mouse wheel and stays dead to a finger. Pair the panel with `align-items:flex-start` and the card with `margin:auto` so an over-tall card scrolls from the top instead of spilling above the viewport and clipping its close button.