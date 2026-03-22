---
phase: 05-lock-screen-controls
verified: 2026-03-22T13:10:00Z
status: human_needed
score: 10/10 must-haves verified
re_verification: false
human_verification:
  - test: "Open a book on an Android device. Lock the screen while audio is playing."
    expected: "Lock screen shows book title, author name, and cover art (or default headphones SVG if no cover). Formatted title matches '{Book Title} -- Ch. N: {Chapter Name}' pattern."
    why_human: "Media Session lock screen does not appear in desktop Chrome DevTools. Requires physical Android device."
  - test: "On Android lock screen, tap play/pause, skip-forward, and skip-back controls."
    expected: "Each control responds correctly — audio pauses/resumes, chapters advance/retreat."
    why_human: "Lock-screen hardware/notification controls require actual device interaction."
  - test: "On Android lock screen, drag the scrubber while a chapter is playing."
    expected: "Scrubber reflects chapter-relative position (0 to chapter duration). Dragging seeks correctly. Scrubber resets to 0 at chapter boundary."
    why_human: "Position state scrubber behavior requires physical device observation."
  - test: "Seek to the last few seconds of a chapter and let it transition to the next."
    expected: "Lock screen metadata updates to show new chapter title. No crash, no stuck scrubber."
    why_human: "Chapter-boundary setPositionState race condition (Pitfall 1) can only be confirmed silently absorbed on device."
  - test: "Log out while audio is paused. Then return to lock screen notification shade (if one persists)."
    expected: "Media Session notification is cleared — no stale book info shown."
    why_human: "Media Session clear behavior on logout must be observed on device."
---

# Phase 5: Lock-Screen Controls Verification Report

**Phase Goal:** Lock-screen / notification controls — Media Session API with chapter-aware metadata, play/pause/skip, and position tracking
**Verified:** 2026-03-22T13:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Plan 01 — Pure Functions)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `buildMediaMetadata` returns correct title format '{Book Title} -- Ch. N: {Chapter Name}' with artist and artwork | VERIFIED | Function present at `public/player-utils.js:73`. Tests 1-2 pass. `bun test tests/lock-screen.test.ts` — 11 pass, 0 fail. |
| 2 | `chapterPositionState` returns chapter-relative duration, position, and playbackRate | VERIFIED | Function present at `public/player-utils.js:102`. Test 6 confirms exact shape `{ duration, playbackRate, position }`. |
| 3 | `chapterPositionState` clamps position to never exceed duration | VERIFIED | Test 7 (below start) and Test 8 (above end) both pass. `Math.max(0, Math.min(rawPosition, chDuration))` on line 106. |
| 4 | `seektoAbsolute` converts chapter-relative seekTime to absolute audio time | VERIFIED | Function at `public/player-utils.js:121`. Test 10 confirms `start_sec + seekTime`. Test 11 confirms null return. |
| 5 | `buildMediaMetadata` uses default-cover.svg with image/svg+xml type when cover_url is null | VERIFIED | Lines 81-82 of player-utils.js. Test 3 confirms fallback src and type. |

### Observable Truths (Plan 02 — Media Session Integration)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | Lock screen shows book title, author, and cover art when audio plays | VERIFIED (automated) / ? HUMAN | `_setMediaMetadata()` at index.html:636 calls `buildMediaMetadata()` and assigns `new MediaMetadata(meta)` to `navigator.mediaSession.metadata`. Called in `canplay` handler (line 551). Needs device test. |
| 7 | Lock-screen play/pause and skip controls work via Media Session | VERIFIED (automated) / ? HUMAN | `setActionHandler` calls for `play`, `pause`, `nexttrack`, `previoustrack` wired to Alpine store methods. Needs device test. |
| 8 | Lock-screen scrubber shows chapter-scoped position and responds to seek | VERIFIED (automated) / ? HUMAN | `_startPositionInterval()` at index.html:654 runs every 1s calling `_updatePositionState()`. `setActionHandler('seekto')` at line 769 calls `seektoAbsolute`. Needs device test. |
| 9 | Metadata updates on chapter change without updating every timeupdate | VERIFIED | `_prevChapterIdx` gate at lines 497-499 — metadata only set when `currentChapterIdx !== _prevChapterIdx`. |
| 10 | Metadata clears on logout and player close | VERIFIED | Logout handler at line 90 calls `$store.player._clearMediaMetadata()`. `_clearMediaMetadata()` at line 668 sets `navigator.mediaSession.metadata = null` and stops position interval. |

**Score:** 10/10 truths verified (automated). 5 truths additionally require device confirmation (human_verification items above).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `public/player-utils.js` | Three new pure functions: buildMediaMetadata, chapterPositionState, seektoAbsolute | VERIFIED | All three functions present and exported. 130 lines total. module.exports on line 128 exports all 8 functions. |
| `public/images/default-cover.svg` | Placeholder cover art for lock screen | VERIFIED | File exists. viewBox="0 0 512 512", fill="#1e293b" background, fill="#94a3b8" icon. Valid SVG with xmlns attribute. No `<script` tags. |
| `tests/lock-screen.test.ts` | Unit tests for all three pure functions | VERIFIED | 93 lines. 11 tests covering all specified cases. `require('../public/player-utils.js')` on line 2. All 11 pass. |
| `public/index.html` | Media Session metadata, position state interval, seekto handler | VERIFIED | Contains MediaMetadata (line 640), setPositionState (line 648), setActionHandler seekto (line 769), buildMediaMetadata call (line 638), chapterPositionState call (line 645), seektoAbsolute call (line 772), _prevChapterIdx (lines 482, 497-499), _clearMediaMetadata (line 668), positionInterval (line 481), try guard around setPositionState (line 647). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tests/lock-screen.test.ts` | `public/player-utils.js` | `require('../public/player-utils.js')` | WIRED | Line 2 of test file: `const { buildMediaMetadata, chapterPositionState, seektoAbsolute } = require('../public/player-utils.js')` |
| `public/index.html` | `public/player-utils.js` | `buildMediaMetadata(` function call | WIRED | Line 638: `const meta = buildMediaMetadata(this.book, this.currentChapterIdx)` |
| `public/index.html` | `navigator.mediaSession` | `.metadata` assignment and `setPositionState` calls | WIRED | Line 640: `navigator.mediaSession.metadata = new MediaMetadata(meta)`. Line 648: `navigator.mediaSession.setPositionState(state)`. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LOCK-01 | 05-01-PLAN.md, 05-02-PLAN.md | Android lock screen shows book title, author, and cover art | SATISFIED | `buildMediaMetadata` formats title as `'{Book Title} -- Ch. N: {Chapter Name}'`, includes artist and artwork. `new MediaMetadata(meta)` assigned to `navigator.mediaSession.metadata` on play and chapter change. |
| LOCK-02 | 05-01-PLAN.md, 05-02-PLAN.md | Lock-screen play/pause, skip forward/back controls work via Media Session API | SATISFIED | `setActionHandler` wired for `play`, `pause`, `nexttrack`, `previoustrack`. `seekto` handler added at line 769 using `seektoAbsolute`. |
| LOCK-03 | 05-01-PLAN.md, 05-02-PLAN.md | Lock-screen scrubber reflects current position and responds to seek | SATISFIED | `_startPositionInterval` runs `_updatePositionState` every 1s using `chapterPositionState` (chapter-scoped). `seekto` handler maps chapter-relative `details.seekTime` to absolute via `seektoAbsolute` then calls `player.seek(absoluteTime)`. |

No orphaned requirements — LOCK-01, LOCK-02, LOCK-03 are the only Phase 5 requirements in REQUIREMENTS.md and all are claimed in both plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No stubs, placeholders, empty returns, or unimplemented handlers found in phase-modified files. HTML `placeholder` attributes on `<input>` elements are form field hint text — not stub patterns.

### Human Verification Required

#### 1. Lock Screen Metadata Display

**Test:** Open any audiobook on an Android device. Start playback and lock the screen.
**Expected:** Lock screen and notification shade show the book title formatted as `{Book Title} -- Ch. N: {Chapter Name}`, the author name, and either the book cover art or the default headphones SVG.
**Why human:** The Media Session lock screen UI does not appear in desktop Chrome DevTools device simulation. Only confirmed on a physical Android device.

#### 2. Lock-Screen Play/Pause and Skip Controls

**Test:** From the Android lock screen, tap the play/pause button, the skip-forward button, and the skip-back button.
**Expected:** Play/pause toggles audio correctly. Skip-forward advances to next chapter. Skip-back retreats to previous chapter.
**Why human:** Lock-screen hardware button and notification action responses require physical device interaction.

#### 3. Chapter-Scoped Scrubber Position and Seek

**Test:** While a chapter is playing (not chapter 1), observe the lock-screen scrubber. Then drag it to a different position.
**Expected:** Scrubber shows position relative to the current chapter (starts at 0, ends at chapter duration). Dragging the scrubber seeks within the chapter correctly.
**Why human:** Position state scrubber rendering and seekto response require physical device observation.

#### 4. Chapter Boundary — Metadata Transition

**Test:** Seek to 5 seconds before the end of a chapter and let playback continue through the chapter change.
**Expected:** Lock screen metadata silently updates to the next chapter title. No crash, no stuck or out-of-range scrubber.
**Why human:** The `try/catch` around `setPositionState` absorbs DOMExceptions at chapter boundaries — whether this works silently can only be confirmed on device.

#### 5. Metadata Cleared on Logout

**Test:** Start playing a book, pause it, then tap Log out in the app. Check the Android notification shade.
**Expected:** The Media Session notification/card for the audiobook is dismissed or cleared.
**Why human:** Whether `navigator.mediaSession.metadata = null` causes the notification to disappear depends on the Android version and browser; must be observed on device.

### Test Suite

All automated tests pass:

- `bun test tests/lock-screen.test.ts` — **11 pass, 0 fail**
- `bun test tests/player.test.ts` — **19 pass, 0 fail** (no regressions)
- `bun test` (full suite) — **133 pass, 0 fail**

---

_Verified: 2026-03-22T13:10:00Z_
_Verifier: Claude (gsd-verifier)_
