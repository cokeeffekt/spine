---
phase: 11-mp3-player-support
plan: 02
subsystem: ui
tags: [alpine, workbox, service-worker, mp3, audio-player, pwa, offline]

# Dependency graph
requires:
  - phase: 11-01
    provides: "per-track audio endpoint (GET /api/books/:id/audio/:chapterIdx) and format field in book API"
  - phase: 09-progress-sync-and-tiles
    provides: "progressDB, _saveProgress(), server sync pattern"
  - phase: 06-offline-download
    provides: "downloads store, downloadDB, Cache Storage patterns, sw.js CacheFirst setup"
provides:
  - "MP3 book playback with automatic track transitions on ended event"
  - "trackUrl() helper function for building per-track audio URLs"
  - "format-aware player store: play(), jumpToChapter(), timeupdate, ended, _saveProgress all branch on book.format"
  - "Cumulative timestamp tracking via _trackCumulativeTime for correct progress save/resume"
  - "MP3 offline download: all tracks cached individually, progress shown as track count"
  - "SW CacheFirst route for /api/books/:id/audio/:chapterIdx"
  - "Format-aware _cleanup and init reconciliation for downloads store"
affects:
  - "public/index.html"
  - "public/sw.js"
  - "public/player-utils.js"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "book.format === 'mp3' branching pattern in player store for all audio operations"
    - "_trackCumulativeTime accumulates chapter.start_sec + el.currentTime for MP3 position"
    - "SW route specificity: more-specific /audio/:chapterIdx registered before /audio$"

key-files:
  created: []
  modified:
    - public/index.html
    - public/player-utils.js
    - public/sw.js
    - tests/player.test.ts

key-decisions:
  - "trackUrl(bookId, chapterIdx) added to player-utils.js as a named helper (exported and unit-tested)"
  - "_trackCumulativeTime on player store: computed as chapter.start_sec + el.currentTime in timeupdate handler; used for all progress saves and Media Session position state for MP3 books"
  - "play() restructured to determine resume position BEFORE el.src assignment so correct per-track URL can be set before el.load()"
  - "jumpToChapter for MP3: src swap + load + canplay { once: true } instead of seek; always starts from track beginning"
  - "ended handler: checks book.format before deciding track-advance vs book-complete"
  - "Sleep timer end-of-chapter: uses chapter.duration_sec for MP3 (not end_sec - start_sec comparison against within-track currentTime)"
  - "MP3 download: per-track fetch + cache.put loop, saves format+trackCount to downloadDB for cleanup"
  - "_cleanup: reads downloadDB meta to delete per-track MP3 cache entries"
  - "init reconciliation: checks /audio/0 for MP3 books, /audio for m4b"

patterns-established:
  - "Pattern: All canplay event listeners use { once: true } to prevent repeat-fire on re-load"
  - "Pattern: Cumulative time tracking for multi-file audio — maintain separate _trackCumulativeTime, do NOT use getCurrentChapterIdx on within-track currentTime"

requirements-completed:
  - PLAY-09
  - PLAY-10

# Metrics
duration: 25min
completed: 2026-03-24
---

# Phase 11 Plan 02: MP3 Player Support (Frontend) Summary

**Format-aware MP3 player with track transitions, chapter jumping, cumulative progress tracking, per-track offline download, and CacheFirst service worker routing**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-24
- **Completed:** 2026-03-24
- **Tasks:** 3 of 3 (Tasks 1-2 auto, Task 3 human-verify — approved 2026-03-25)
- **Files modified:** 4

## Accomplishments

- Added `trackUrl(bookId, chapterIdx)` helper with 3 unit tests (TDD RED/GREEN)
- Player store branches on `book.format === 'mp3'` in all audio operations: play, jumpToChapter, timeupdate, ended, _saveProgress, _updatePositionState, seekto Media Session handler
- MP3 track transitions: `ended` handler swaps src to next track URL and plays; last track = book complete
- Cumulative position tracking via `_trackCumulativeTime` (chapter.start_sec + el.currentTime) for correct progress save/resume
- Downloads store updated for MP3: per-track download loop, format-aware cleanup and init reconciliation
- Service worker CacheFirst route added for `/api/books/:id/audio/:chapterIdx` before existing m4b route
- SW precache revisions bumped: index.html `'6'` -> `'7'`, player-utils.js `'3'` -> `'4'`

## Task Commits

Each task was committed atomically:

1. **Task 1: Player store MP3 branching and trackUrl helper** - `6f3bc17` (feat, TDD)
2. **Task 2: MP3 offline download and service worker routing** - `33de568` (feat)

## Files Created/Modified

- `public/player-utils.js` - Added `trackUrl(bookId, chapterIdx)` helper function
- `public/index.html` - Format-aware player store and downloads store
- `public/sw.js` - CacheFirst route for per-track MP3 audio, bumped precache revisions
- `tests/player.test.ts` - trackUrl unit tests (3 cases)

## Decisions Made

- `trackUrl` exported from player-utils.js as a named function (browser global + module.exports)
- `_trackCumulativeTime` maintained in `timeupdate` handler (not derived from elapsed chapter time) to avoid drift
- `play()` restructured to determine resume position before setting `el.src` — required for MP3 to set the correct track URL before `el.load()`
- `jumpToChapter` for MP3 uses src-swap + canplay `{ once: true }` pattern (same as ended handler)
- Sleep timer chapter-end check uses `chapter.duration_sec` for MP3 (not `end_sec`, which is cumulative)
- Downloads store saves `format: 'mp3', trackCount` to `downloadDB` so `_cleanup` and `init` can handle per-track cache entries without needing the book object

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MP3 playback verified end-to-end by user (Task 3 human-verify approved 2026-03-25)
- All automated tests pass (233/233): `bun test` exits 0
- Phase 11 complete — MP3 folder scanning (Phase 10) and MP3 player support (Phase 11) together deliver full MP3 audiobook support

## Known Stubs

None.

## Self-Check: PASSED

All files found and commits verified.

---
*Phase: 11-mp3-player-support*
*Completed: 2026-03-24*
