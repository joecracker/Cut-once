# Established conventions (Cut Once)

Moved out of AI_RULES.md on 2026-10-15 so it is not loaded on every turn. Nothing was removed or reworded.

- **UI Layout**:
  - Fixed `<canvas id="pad">` for drawing, overlays `<img id="photoLayer">` for photos.
  - Toolbars: `.toolbar.primary` (bottom) and `.toolbar.secondary` (top‑right).
  - Voice markers (`#voiceMarks`, child `.cursor-indicator` dots) show tapped measurement spots; only the current one carries `.active` (pulsing), the rest are steady rings.
- **Drawing Modes**:
  - Tool cycles on each tap of `#toolDraw`: pencil → straight line → arrow → eraser (`TOOL_ORDER`).
  - Undo is a **vector op stack**, not ImageData snapshots. `ops` holds one record per mark — `kind:'stroke'` (with an `erase` flag), the tool name (`'line'`/`'arrow'`), or `kind:'text'` for a spoken label — and `replayOp`/`render` redraw everything from it. The cap is **400 ops** (`if (ops.length > 400) ops.shift()`), never 12. There is **no `undoStack` and no `ImageData`** in the file; don't reintroduce them.
  - Undo is **voice-aware**: `undo()` pops the last op and `revivePoint()` un-completes that measurement's marker and re-aims the mic at its spot, so a measurement is never left orphaned.
  - Spoken **"back"** routes through `undoLastLabel()`, which removes the most recent `text` op wherever it sits in the stack rather than only the top one.
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
  - Splash art is **one finished portrait raster: `splash-bg.jpg`** (768×1376, project root, listed in `WEB_FILES` in `mobile/scripts/sync-www.mjs`). The blade *and* the "CUT · ONCE" wordmark are both painted into that single frame, so there is **no live `#splashWord` and no `buildSplashBlade()`** any more. Do not reintroduce either — the name would render twice. `#splashArt` is a flex item with `object-fit:contain`, **never** `object-fit:cover`: cover is what amputated the old square artwork. `#splash`'s field is **not** flat black any more: it is a `linear-gradient(#0d0d0d, #111111)` that tracks the art's own edge drift (top row ~`#0e0e0e`, bottom ~`#111111`), so the thin contain bands above and below read as margin rather than letterboxing. A single flat colour leaves a faint seam at the bottom only — don't "simplify" it back to `#000`.
  - `#splashEnter` sits **below** the art as a normal flex item, not absolutely positioned, so it can never land on top of the painted wordmark on a short screen. It is a real `<button>` for keyboard users. The old `#splashFooter` / `#splashOpen` (green slab that existed to hide a baked-in banner) are **gone** — don't reintroduce them.
  - Both full-screen overlays (`#infoPanel`, `#slotPanel`) scroll and route through `openModal()`/`closeModal()`, which hold one history entry per open panel so browser back and Escape close them.
  - Info panel accessible via “i” button.
