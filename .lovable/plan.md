## Goal

Replace the unreliable one-finger swipe with **tap zones** — narrow, invisible, but real `<button>` elements pinned to the left and right edges of the screen. Keeps Alt+Arrow keyboard shortcuts. Works perfectly on iOS, Android, and with VoiceOver/TalkBack.

## Why this is better than swipe

- iOS Safari never blocks tap/click events; we stop fighting iOS gesture hijacking.
- Real `<button>` elements work with VoiceOver: single-tap to select, double-tap to activate. Coordinate-based "detect X position" would break this.
- No interference with vertical scrolling, no edge-swipe conflict with Safari's back gesture.
- Same code path on every platform — no more iOS-vs-Android divergence.

## Files to change

### 1. New: `src/voice/EdgeTapZones.tsx`

Two fixed-position `<button>` elements:
- **Left zone**: 56px wide, full height, pinned to left edge. `aria-label="Previous page"`. Click → navigate to previous route in the ring.
- **Right zone**: 56px wide, full height, pinned to right edge. `aria-label="Next page"`. Click → navigate to next route.

Visual: nearly transparent by default. On hover/focus a subtle gold-tinted gradient fades in (uses existing `--accent` token) so sighted users discover them. A small chevron icon (`ChevronLeft`/`ChevronRight` from lucide-react, already in deps) sits centered, fading in on hover. `aria-hidden="false"` — these ARE the navigation, they should be announced.

Hidden until `hasStarted` (welcome dismissed). Hidden on sub-pages outside the main 4-page ring.

Each tap also calls `speakNow("Next page")` / `speakNow("Going back")` for instant audio feedback before the new page narration starts. Requires exposing `speakNow` from `VoiceHostProvider` (currently private).

### 2. Edit: `src/voice/VoiceHostProvider.tsx`

Expose `speakNow` on the context so `EdgeTapZones` can announce the tap before navigation completes.

### 3. Edit: `src/routes/__root.tsx`

- Replace `<SwipeNavigator />` with `<EdgeTapZones />`.
- Remove `style={{ touchAction: "pan-y" }}` from `<main>` (no longer needed).
- Add `touch-action: manipulation` globally in `src/styles.css` to kill the iOS tap delay.

### 4. Edit: `src/voice/scripts.ts`

Update the welcome script:

> "Welcome to Mithara. You're on the home page — page 1 of 4 — a premium dessert house crafting kunafa, baklava, and artisan gelato. To move between pages, tap the right edge of the screen for the next page, or the left edge to go back. On a keyboard, press Alt and the left or right arrow key. Press M at any time to mute the voice guide."

### 5. Delete: `src/voice/SwipeNavigator.tsx` and `src/voice/SwipeHint.tsx`

No longer needed. Remove their imports from `__root.tsx`.

### 6. Edit: `src/styles.css`

Add:
```css
* { touch-action: manipulation; }
```
Removes the 300ms iOS tap delay.

## What stays the same

- All four-page ring logic (`MAIN_ROUTES`, `nextRoute`).
- Alt+Arrow keyboard shortcuts (move into `EdgeTapZones`).
- Welcome overlay, mute pill, M shortcut, page narration.
- All visual design and content.

## VoiceOver/TalkBack behavior (confirmed correct)

- Screen reader on: user swipes to focus the "Next page" button → double-taps → navigates. The button's `aria-label` is announced.
- Screen reader off: single tap on the edge zone → instant navigation.
- No gesture conflicts either way.

## Out of scope

- No swipe gestures at all (removes the source of every iOS bug we've hit).
- No new pages or content changes.
