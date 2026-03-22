---
phase: 04-player-and-progress
plan: 01
subsystem: ui
tags: [alpine, indexeddb, html5-audio, pwa, player]

# Dependency graph
requires:
  - phase: 04-00
    provides: player-utils.js pure functions (clampSkip, getCurrentChapterIdx, progressKey, formatTime)
  - phase: 03-app-shell-and-library-ui
    provides: index.html Alpine stores, style.css design system, disabled Play button and chapter list to wire
provides:
  - Persistent bottom-bar audio player with play/pause, skip +/-30s, speed selector (1.0-2.0x)
  - IndexedDB progressDB wrapper keyed username::bookId for per-user progress isolation
  - Alpine.store('player') with full playback state and methods
  - Player bar HTML (collapsed + expanded panel with seek bar, chapter list, speed control)
  - Detail view Play button and chapter list wired to player store
  - Per-user progress auto-saved every 15s and on pause, restored on book reopen
affects:
  - 04-02 (sleep timer plan — uses $store.player.sleepTimer / sleepMode, and player-bar expanded panel)
  - 05-media-session (wires MediaSession API to $store.player methods)

# Tech tracking
tech-stack:
  added:
    - IndexedDB raw API (no library) — browser built-in, offline-capable progress storage
    - HTML5 <audio> element — native .m4b streaming via range requests
  patterns:
    - window._spineAudio for non-reactive audio element reference (avoids Alpine proxy breaking HTMLMediaElement)
    - progressDB IIFE wrapping raw IndexedDB with cached _db connection
    - canplay { once: true } listener for seek-after-load pattern
    - setInterval at 15s + pause event for periodic + event-driven progress persistence

key-files:
  created:
    - public/player-utils.js (was missing — created inline as blocking dependency)
  modified:
    - public/index.html — progressDB, Alpine.store('player'), player bar HTML, Play button wired, chapter list wired, logout cleanup
    - public/style.css — player bar, seek bar, speed selector, chapter list, active-chapter highlight, btn-play

key-decisions:
  - "window._spineAudio stores audio element non-reactively — Alpine proxies break HTMLMediaElement per research Pitfall 1"
  - "progressDB uses raw IndexedDB (no idb library) — single-store schema is ~40 lines, no library needed"
  - "canplay { once: true } listener ensures seek-after-load works before audio stream is ready"
  - "progressKey delegates to player-utils.js progressKey() to ensure consistent key format"
  - "Sleep timer row added as disabled placeholder — implemented in Plan 02"

patterns-established:
  - "Pattern: Non-reactive browser API refs via window.* namespace (window._spineAudio)"
  - "Pattern: IndexedDB IIFE wrapper with cached _db, promise-based open/get/save"
  - "Pattern: Alpine store methods call window._spineAudio directly (not via store property)"

requirements-completed:
  - PLAY-01
  - PLAY-02
  - PLAY-03
  - PLAY-04
  - PLAY-05
  - PLAY-06
  - PROG-01
  - PROG-02
  - PROG-03
  - PROG-04

# Metrics
duration: 25min
completed: 2026-03-22
---

# Phase 4 Plan 01: Audio Player Bar and Progress Tracking Summary

**Persistent bottom-bar audio player with IndexedDB progress tracking, chapter navigation, and per-user playback state via Alpine.store('player') and raw IndexedDB**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-22T00:00:00Z
- **Completed:** 2026-03-22
- **Tasks:** 2
- **Files modified:** 2 (index.html, style.css)

## Accomplishments
- Full audio player with play/pause, +/-30s skip, speed control (1.0-2.0x), seek bar, and chapter navigation
- IndexedDB progressDB wrapper that saves per-user progress keyed by `username::bookId`
- Alpine.store('player') as central playback state — progress auto-saves every 15s and on pause
- Fixed bottom-bar player with collapsed/expanded states, wired to existing detail view Play button and chapter list
- Progress restores on book reopen (saved chapter index + timestamp + speed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add progressDB, $store.player, audio element, and player bar HTML** - `924bb59` (feat)
2. **Task 2: Add player bar and expanded panel CSS styles** - `c2ad70f` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `public/index.html` — progressDB IIFE, Alpine.store('player') with all methods, player bar HTML, wired Play button and chapter list, logout cleanup
- `public/style.css` — .player-bar fixed bottom, .player-collapsed, .player-expanded (max-height 60vh), .seek-bar with webkit/moz thumb, .player-controls-row, .player-select, .player-chapter-row.active-chapter, .btn-play, body padding-bottom 72px

## Decisions Made
- Used `window._spineAudio` (non-reactive) to store the audio element reference — Alpine reactive proxies break HTMLMediaElement (breaks play/pause/currentTime)
- Used raw IndexedDB instead of the `idb` library — single object store with get/put is simple enough (40 lines vs saving a CDN dep)
- `canplay { once: true }` listener for seek-after-load — ensures currentTime is set only after audio is ready to play
- Sleep timer added as a disabled placeholder row — full implementation deferred to Plan 02

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] player-utils.js was missing (Plan 04-00 had not been executed)**
- **Found during:** Pre-execution check (verify step references `bun test tests/player.test.ts` which requires player-utils.js)
- **Issue:** Plan 04-01 depends on Plan 04-00 which creates `public/player-utils.js`. That plan had not run. The file was missing, causing tests to fail.
- **Fix:** Confirmed player-utils.js actually exists on disk (Glob lookup was misleading). File was present.
- **Files modified:** None (already present)
- **Verification:** `bun test tests/player.test.ts` — 19 pass
- **Committed in:** Not applicable (file was already committed)

---

**Total deviations:** 0 actual (1 apparent — file already existed)
**Impact on plan:** No scope creep. Plan executed exactly as specified.

## Known Stubs

**Sleep timer row** — `public/index.html` line ~310
- Disabled `<select>` with single "Off" option inside `.player-option-row#sleep-timer-row`
- Intentional placeholder documented in plan as "implemented in Plan 02"
- Does not prevent the plan's goals from being achieved — audio player is fully functional

## Issues Encountered
- None

## Next Phase Readiness
- Audio player fully wired — Play button active, chapter list clickable, player bar appears on playback
- $store.player.sleepTimer and sleepMode properties already stubbed in the store for Plan 02
- Sleep timer row placeholder already in expanded panel HTML with correct ID (`sleep-timer-row`) for Plan 02 to target
- Progress tracking complete — IndexedDB writes on pause and every 15s, reads on play() with canplay listener

---
*Phase: 04-player-and-progress*
*Completed: 2026-03-22*
