---
phase: 10-mp3-folder-scanner
plan: 01
subsystem: scanner
tags: [mp3, sort, track-number, disc-detection, sqlite, schema-migration, tdd]

# Dependency graph
requires: []
provides:
  - parseTrackNumber function for TRCK ID3 tag parsing (simple and track/total format)
  - sortTracks function with numeric TRCK sort, null-last fallback, filename natural sort tiebreaking
  - parseDiscNumber function for disc subfolder name detection (Disc/CD/Part/Disk patterns)
  - DISC_FOLDER_RE exported regex constant for disc folder detection
  - chapters.file_path nullable column via idempotent ALTER TABLE migration
  - NormalizedChapter type extended with optional file_path field
  - Chapter interface extended with file_path: string | null DB row field
affects: [10-02, future MP3 scanner plans]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD Red/Green pattern: test file with failing imports first, then implementation"
    - "Idempotent schema migration: ALTER TABLE in try/catch block"
    - "Generic sortTracks<T extends {...}>: preserves type while sorting"

key-files:
  created:
    - src/scanner/mp3-sort.ts
    - src/scanner/mp3-sort.test.ts
  modified:
    - src/db/schema.ts
    - src/types.ts

key-decisions:
  - "sortTracks uses localeCompare with numeric:true, sensitivity:base for natural filename sort"
  - "sortTracks accepts generic T extends track shape for type-safe callers"
  - "parseTrackNumber splits on '/' before parseInt to handle TRCK '3/12' format"
  - "chapters.file_path column defaults to NULL for existing m4b rows — no INSERT changes needed"

patterns-established:
  - "mp3-sort.ts: pure utility module, no DB or filesystem dependencies, easily testable"

requirements-completed: [LIBM-05, LIBM-07]

# Metrics
duration: 2min
completed: 2026-03-24
---

# Phase 10 Plan 01: mp3-sort.ts Utilities and Schema Migration Summary

**Track sort utilities (parseTrackNumber, sortTracks, parseDiscNumber, DISC_FOLDER_RE) and chapters.file_path schema migration providing the ordering and typing foundation for the MP3 folder scanner**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-24T10:00:04Z
- **Completed:** 2026-03-24T10:02:04Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `src/scanner/mp3-sort.ts` with four exports: parseTrackNumber, sortTracks, parseDiscNumber, DISC_FOLDER_RE
- 27 unit tests covering all TRCK parsing edge cases, numeric sort ordering, null-last behavior, filename natural sort tiebreaking, and all disc folder name patterns
- Added idempotent `ALTER TABLE chapters ADD COLUMN file_path TEXT` migration to schema.ts
- Extended NormalizedChapter with optional `file_path?` and Chapter with `file_path: string | null`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create mp3-sort.ts utilities with TDD** - `4499b44` (feat)
2. **Task 2: Schema migration + type extension for chapters.file_path** - `6af082c` (feat)

**Plan metadata:** (docs commit — follows)

_Note: Task 1 used TDD Red/Green pattern — test file created first, then implementation_

## Files Created/Modified
- `src/scanner/mp3-sort.ts` - parseTrackNumber, sortTracks, parseDiscNumber, DISC_FOLDER_RE utilities
- `src/scanner/mp3-sort.test.ts` - 27 unit tests covering all sort and disc detection behaviors
- `src/db/schema.ts` - idempotent chapters.file_path migration appended after asin migration
- `src/types.ts` - NormalizedChapter.file_path (optional) and Chapter.file_path (nullable) added

## Decisions Made
- `sortTracks` accepts a generic `T extends { filePath: string; trackNumber: number | null }` to preserve the caller's full type through the sort — avoids type loss without requiring casting
- `localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })` used for natural filename sort — handles "10-end" after "02-middle" correctly
- `parseTrackNumber` splits on `"/"` before parseInt to cleanly handle the ID3 "track/total" TRCK format (e.g. "3/12" → 3)
- `chapters.file_path` migration placed after the `asin` migration — consistent ordering, no INSERT changes needed since SQLite defaults new column to NULL

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- All Plan 02 dependencies are available: parseTrackNumber, sortTracks, parseDiscNumber, DISC_FOLDER_RE from mp3-sort.ts
- chapters.file_path column exists in schema for MP3 track file references
- NormalizedChapter and Chapter types updated — Plan 02 scanFolder can populate file_path without further type changes
- Full test suite green (206 tests, 0 failures)

## Self-Check: PASSED

- FOUND: src/scanner/mp3-sort.ts
- FOUND: src/scanner/mp3-sort.test.ts
- FOUND: src/db/schema.ts
- FOUND: src/types.ts
- FOUND commit: 4499b44 (feat: mp3-sort.ts utilities with TDD)
- FOUND commit: 6af082c (feat: chapters.file_path migration + type extension)

---
*Phase: 10-mp3-folder-scanner*
*Completed: 2026-03-24*
