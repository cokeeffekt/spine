---
phase: 11-mp3-player-support
plan: 01
subsystem: api
tags: [audio-streaming, http-range, mp3, m4b, hono, bun, sqlite]

# Dependency graph
requires:
  - phase: 10-mp3-folder-scanner
    provides: chapters.file_path column populated for MP3 tracks (Phase 10 migration)

provides:
  - GET /api/books/:id/audio/:chapterIdx — per-track MP3 streaming endpoint with HTTP 206 range support
  - format field in GET /api/books/:id response ('mp3' or 'm4b')

affects:
  - 11-02 (frontend player — needs format field and trackUrl to branch mp3 vs m4b playback)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "More-specific Hono route registered before less-specific to win matching (/audio/:chapterIdx before /audio)"
    - "chapters.file_path IS NOT NULL filter — dual-purpose: guards m4b chapters and serves as format signal"
    - "Destructuring { file_path: _fp, ...rest } to strip server-path from chapter response objects"

key-files:
  created: []
  modified:
    - src/routes/audio.ts
    - src/routes/audio.test.ts
    - src/routes/books.ts
    - src/routes/books.test.ts

key-decisions:
  - "New /books/:id/audio/:chapterIdx route registered before /books/:id/audio so Hono matches the more-specific path first"
  - "file_path IS NOT NULL in SQL query doubles as both 404 guard for m4b chapters and MP3-only filter"
  - "format field derived from chapters[0].file_path at query time — no new books table column needed"
  - "file_path stripped from chapter response via destructuring to avoid exposing server filesystem paths (D-05)"

patterns-established:
  - "MP3 route pattern: DB query with file_path IS NOT NULL, Bun.file() range handler, audio/mpeg content-type"

requirements-completed:
  - PLAY-09

# Metrics
duration: 2min
completed: 2026-03-24
---

# Phase 11 Plan 01: MP3 Backend Audio API Summary

**Per-track MP3 streaming endpoint (/audio/:chapterIdx) with HTTP 206 range support and format field in book detail API**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-24T11:29:17Z
- **Completed:** 2026-03-24T11:31:13Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `GET /api/books/:id/audio/:chapterIdx` route that queries `chapters.file_path`, returns 404 for m4b chapters (NULL file_path), and streams MP3 files with full HTTP 206 range support and `audio/mpeg` content-type
- Added `format` field to `GET /api/books/:id` response — derived from `chapters[0].file_path` presence, returns `'mp3'` or `'m4b'`; `file_path` is stripped from chapter objects before response to avoid exposing server paths
- 6 new tests for the MP3 audio route (200, 206, 404x2, 401, regression) + 4 tests for format field (m4b, mp3, no-chapters default, file_path not exposed) — all 37 test suite tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Per-track MP3 audio route with tests** - `edf56b8` (feat)
2. **Task 2: Format field in book detail API with tests** - `8108a93` (feat)

_Note: TDD tasks — tests committed with implementation in single atomic commits per task_

## Files Created/Modified

- `src/routes/audio.ts` - Added GET /books/:id/audio/:chapterIdx route before existing m4b route
- `src/routes/audio.test.ts` - Added describe block with 6 tests for MP3 per-track endpoint
- `src/routes/books.ts` - Added file_path to chapters SELECT, format derivation, file_path strip before response
- `src/routes/books.test.ts` - Added describe block with 4 tests for format field behavior

## Decisions Made

- New `/books/:id/audio/:chapterIdx` route registered before `/books/:id/audio` so Hono's router matches the more specific path first — no prefix conflicts
- `file_path IS NOT NULL` in the SQL query serves dual purpose: excludes m4b chapters (returns 404) and only matches MP3 tracks
- `format` field derived from `chapters[0].file_path` at query time — no schema change needed (leverages Phase 10 migration column)
- `file_path` stripped from chapter objects before returning response using destructuring — server filesystem paths are never exposed to the client (D-05)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend API is ready: frontend can call `GET /api/books/:id` to detect format, then use `/audio` (m4b) or `/audio/:chapterIdx` (mp3) for playback
- Phase 11 Plan 02 can now implement the Alpine.js frontend player branching logic

---
*Phase: 11-mp3-player-support*
*Completed: 2026-03-24*
