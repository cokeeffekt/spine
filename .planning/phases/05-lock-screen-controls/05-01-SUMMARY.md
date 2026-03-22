---
phase: 05-lock-screen-controls
plan: 01
subsystem: ui
tags: [media-session, lock-screen, tdd, svg, player-utils]

# Dependency graph
requires:
  - phase: 04-player-and-progress
    provides: player-utils.js with module.exports guard, getCurrentChapterIdx, and established TDD patterns
provides:
  - Three pure lock-screen utility functions in public/player-utils.js (buildMediaMetadata, chapterPositionState, seektoAbsolute)
  - Default cover SVG placeholder at public/images/default-cover.svg
  - 11 unit tests covering all calculation logic for LOCK-01/02/03
affects: [05-lock-screen-controls plan 02 (integration into index.html Alpine stores)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD with bun:test for browser-independent pure function extraction (established Phase 04, continued here)"
    - "module.exports guard enables player-utils.js to work as browser script and Bun require() without build step"
    - "Plain objects returned instead of browser API constructors (MediaMetadata) so functions are unit-testable"

key-files:
  created:
    - public/images/default-cover.svg
    - tests/lock-screen.test.ts
  modified:
    - public/player-utils.js

key-decisions:
  - "Return plain object from buildMediaMetadata (not MediaMetadata constructor) so it can be unit-tested outside browser"
  - "chapterPositionState clamps position to [0, chDuration] — prevents out-of-range position state on chapter boundaries"
  - "seektoAbsolute returns null when chapter is null — no-chapter books bypass chapter-scoped seek logic"
  - "Default cover SVG uses headphones motif at 512x512 — readable at both 96px and 512px Media Session sizes (D-02)"

patterns-established:
  - "Pattern: Pure function extraction to player-utils.js enables browser-free unit testing of Media Session math"
  - "Pattern: null chapter returns null from lock-screen functions — callers check null before using result"

requirements-completed: [LOCK-01, LOCK-02, LOCK-03]

# Metrics
duration: 2min
completed: 2026-03-22
---

# Phase 5 Plan 01: Lock-Screen Controls Pure Functions Summary

**Three TDD-tested pure functions (buildMediaMetadata, chapterPositionState, seektoAbsolute) extracted to player-utils.js with default cover SVG for Media Session API integration**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T12:49:04Z
- **Completed:** 2026-03-22T12:51:25Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `public/images/default-cover.svg` — headphones icon placeholder for lock screen when book has no cover art (D-03)
- Implemented `buildMediaMetadata(book, chapterIdx)` — formats title as "{Book Title} -- Ch. N: {Chapter Name}", returns plain object with artwork array (not MediaMetadata instance — browser-free testable)
- Implemented `chapterPositionState(chapter, currentTime, playbackRate)` — chapter-scoped position state with position clamped to [0, chDuration] (D-04)
- Implemented `seektoAbsolute(chapter, seekTime)` — converts chapter-relative seekTime to absolute audio time (D-06)
- 11 new unit tests cover all calculation logic; 133 total tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create default cover SVG placeholder** - `142cc4b` (feat)
2. **Task 2 RED: Failing tests for lock-screen functions** - `07af767` (test)
3. **Task 2 GREEN: Implement three lock-screen functions** - `d6bad92` (feat)

**Plan metadata:** (docs commit — see below)

_Note: TDD tasks have multiple commits (test RED → feat GREEN)_

## Files Created/Modified

- `public/images/default-cover.svg` — Headphones SVG placeholder, #1e293b background / #94a3b8 icon, viewBox 512x512. Referenced by Media Session artwork when cover_url is null.
- `tests/lock-screen.test.ts` — 11 unit tests for all three new pure functions (buildMediaMetadata tests 1-5, chapterPositionState tests 6-9, seektoAbsolute tests 10-11)
- `public/player-utils.js` — Added buildMediaMetadata, chapterPositionState, seektoAbsolute; updated module.exports to export all 8 functions

## Decisions Made

- Return plain object from `buildMediaMetadata` (not a `MediaMetadata` constructor instance) — `MediaMetadata` is a browser-only constructor that throws in Bun's test environment. Caller in index.html will use the plain object fields to call `new MediaMetadata(...)`.
- `chapterPositionState` clamps position to never exceed chapter duration — prevents `setPositionState` from receiving a position > duration, which throws a DOMException.
- Both `chapterPositionState` and `seektoAbsolute` return null when chapter is null — consistent null-guard pattern; callers check before using result.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all 11 RED tests failed as expected, all 11 GREEN tests passed on first implementation, no regressions in existing 19 player tests or 103 backend tests.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All three pure functions are tested and exported from player-utils.js
- Plan 02 can import and wire these functions directly into the Alpine store in index.html
- `buildMediaMetadata` result fields map directly to `new MediaMetadata({ title, artist, album, artwork })` constructor call
- `chapterPositionState` result maps directly to `navigator.mediaSession.setPositionState({ ... })`
- `seektoAbsolute` return value is the absolute audio time to pass to `audio.currentTime`

---
*Phase: 05-lock-screen-controls*
*Completed: 2026-03-22*

## Self-Check: PASSED

- public/images/default-cover.svg: FOUND
- tests/lock-screen.test.ts: FOUND
- buildMediaMetadata in public/player-utils.js: FOUND
- 05-01-SUMMARY.md: FOUND
- Commit 142cc4b (feat: default cover SVG): FOUND
- Commit 07af767 (test: failing lock-screen tests): FOUND
- Commit d6bad92 (feat: implement lock-screen functions): FOUND
