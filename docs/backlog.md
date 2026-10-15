# Deferred backlog (Cut Once): agreed with Tim 2026-10-01, not yet built

Moved out of AI_RULES.md on 2026-10-15 so it is not loaded on every turn. Nothing was removed or reworded.

None of these are urgent; batch them into a future build. Re-read this list before proposing "new" work — some of it is already queued.

- **Android hardware Back should close an open overlay.** Capacitor 8's core Android library has *no* back-button handling at all (verified in `mobile/node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java` and `BridgeActivity.java`); that lives in `@capacitor/app`, which is not a dependency. The web `openModal()` history entry is therefore inert on the phone and back exits the app. Fix = an `OnBackPressedDispatcher` callback in `MainActivity` that calls `getBridge().getWebView().goBack()` when `canGoBack()`, else falls through to the default exit. Changes app-exit behavior; verify on device.
- **`.toolbar.primary` horizontal scroll is dead to touch.** Same root cause as the overlay fix: the document-level non-passive `touchmove` `preventDefault()` cancels it. Exempt `.toolbar` in that handler if the overflow ever matters.
- **Cards eat their own horizontal padding.** There is no `box-sizing` anywhere; `#infoCard`/`#slotCard` are `content-box` with `width:100%`, so 40px of padding pushes them past the panel's content box. Cosmetic so far; fix per card, not with a global `box-sizing` reset.
- **`versionCode`/`versionName` never change** (1 / 1.0), so builds are indistinguishable on the device. Bump per release once APKs start being handed out.
- **No install link exists.** `gh release list` is empty; the APK is a local gitignored file installed with `adb install -r`. If Tim wants a shareable URL for workers, cut a GitHub Release with the APK attached — it is debug-signed, so Android warns on every install.
