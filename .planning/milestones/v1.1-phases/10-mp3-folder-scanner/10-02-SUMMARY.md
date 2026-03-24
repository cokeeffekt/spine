---
phase: 10-mp3-folder-scanner
plan: 02
subsystem: scanner
tags: [mp3, scanner, walk, chapters, file_path, multi-disc, fallback, incremental, tdd]

# Dependency graph
requires:
  - phase: 10-mp3-folder-scanner/10-01
    provides: "parseTrackNumber, sortTracks, parseDiscNumber, DISC_FOLDER_RE from mp3-sort.ts; chapters.file_path column"
provides:
  - ScanItem discriminated union type exported from walk.ts
  - walkLibrary returning ScanItem[] with mp3folder and file items
  - scanFolder function: probes MP3 tracks in parallel, sorts disc+track, builds cumulative chapters
  - scanLibrary updated to handle ScanItem[] (branches on kind='file' vs 'mp3folder')
  - applyFallbackMetadata with isFolder mode (title=folder name, author=grandparent folder D-05)
  - Comprehensive test suite (220 tests total, 25 new)
affects: [10-03, future MP3 player plans, streaming routes that read file_path from chapters]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ScanItem discriminated union: walkLibrary returns typed items, consumers branch on item.kind"
    - "Standalone MP3 rule: require >= 2 direct mp3 files in a folder for mp3folder detection"
    - "Disc subfolder parent detection: traverse mp3ByDir to find parents whose children are ALL disc folders"
    - "Cumulative chapter timestamps: each track's start_sec = sum of all prior track durations"
    - "mergeTrackMetadata: first-track-wins for non-null fields, OR for has_cover_stream, sum for duration_sec"
    - "Pitfall 5 cleanup: series_position matching /^\\d+(?:\\/\\d+)?$/ is nulled out (it's a TRCK tag, not series info)"
    - "Cover art for mp3 folders: inline folder scan (not resolveCoverPath, which uses path.dirname)"
    - "sizeSum incremental check: sum of all track file sizes replaces single-file size for folder-level caching"

key-files:
  created: []
  modified:
    - src/scanner/walk.ts
    - src/scanner/fallback.ts
    - src/scanner/index.ts
    - src/scanner/index.test.ts
    - src/scanner/cover.test.ts

key-decisions:
  - "walkLibrary returns ScanItem[] union (not string[]) — enables type-safe branching in scanLibrary"
  - "Standalone mp3 rule: < 2 direct mp3 files in a folder = not a book (preserves existing 'ignores non-.m4b' test behavior)"
  - "applyFallbackMetadata isFolder flag: avoids breaking change while enabling MP3 folder mode"
  - "scanFolder cover art uses inline folder scan, not resolveCoverPath — resolveCoverPath uses path.dirname which returns parent when given a directory path"
  - "sizeSum = sum of all track file sizes: provides stable incremental key for the whole folder"
  - "mergeTrackMetadata Pitfall 5: series_position matching TRCK pattern is nulled — probe.ts maps 'track' tag to series_position, so MP3 track numbers land there"

patterns-established:
  - "makeFakeProbeFnMap(Map<string, NormalizedMetadata>): per-track metadata control in tests"
  - "scanFolder accepts same probeFn injection pattern as scanFile for consistent test DI"

requirements-completed: [LIBM-04, LIBM-05, LIBM-06, LIBM-07]

# Metrics
duration: 7min
completed: 2026-03-24
---

# Phase 10 Plan 02: MP3 Folder Scanner Implementation Summary

**MP3 audiobook folders fully recognized, scanned, and cataloged via ScanItem union type, scanFolder with disc-aware multi-track sorting, cumulative chapter timestamps, and grandparent-author fallback**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-24T10:04:22Z
- **Completed:** 2026-03-24T10:11:22Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- `walkLibrary` refactored from `string[]` to `ScanItem[]` with disc subfolder detection, standalone mp3 rule (< 2 files), and multi-disc parent detection
- `scanFolder` probes MP3 tracks in parallel (semaphore MAX_CONCURRENT=4), sorts by disc+TRCK, builds cumulative timestamps, upserts to books/chapters with `file_path` on every chapter row
- `applyFallbackMetadata` extended with `isFolder` mode: title falls back to folder name, author falls back to grandparent folder name (D-05)
- 25 new tests covering all behaviors: basic scanning, TRCK sort, fallback metadata, Pitfall 5 cleanup, incremental skip, multi-disc, D-14 loose file exclusion, walkLibrary type detection, D-03 m4b wins, missing-book tracking — all 220 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor walkLibrary and extend applyFallbackMetadata** - `0b3b565` (feat)
2. **Task 2: Implement scanFolder and integrate into scanLibrary** - `ccf6493` (feat)
3. **Task 3: Comprehensive tests for MP3 folder scanning** - `f75544a` (test)

**Plan metadata:** (docs commit — follows)

## Files Created/Modified
- `src/scanner/walk.ts` - ScanItem union type, walkLibrary returning ScanItem[] with mp3folder detection
- `src/scanner/fallback.ts` - isFolder parameter, title=folder name, author=grandparent folder
- `src/scanner/index.ts` - resolveMp3Files, mergeTrackMetadata, scanFolder, scanLibrary ScanItem[] integration
- `src/scanner/index.test.ts` - 25 new comprehensive tests (was 206 tests, now 220)
- `src/scanner/cover.test.ts` - Updated walkLibrary tests for ScanItem[] API

## Decisions Made
- `walkLibrary` returns `ScanItem[]` union type instead of `string[]` — scanLibrary branches on `item.kind` to dispatch to scanFile or scanFolder. Breaking change handled by updating cover.test.ts.
- Standalone mp3 rule (< 2 direct mp3 files → not a book folder): preserves existing test behavior where a single mp3 file in a directory is ignored.
- `applyFallbackMetadata` isFolder flag (not a new function): backward-compatible extension, all existing callers unaffected.
- `scanFolder` cover art handled inline (not via `resolveCoverPath`): `resolveCoverPath` calls `path.dirname(m4bPath)` which returns the parent directory when the input IS a directory — wrong behavior for mp3 folders.
- `sizeSum` (sum of all track file sizes) as the "file_size" for a folder book: provides stable incremental cache key for multi-file audiobooks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing walkLibrary tests in cover.test.ts for new ScanItem[] API**
- **Found during:** Task 1 (after implementing ScanItem[] return type)
- **Issue:** cover.test.ts had tests asserting `result.every(p => p.endsWith('.m4b'))` — string-level checks that broke when walkLibrary returned ScanItem[] objects instead of strings
- **Fix:** Updated tests to filter `result.filter(i => i.kind === 'file').map(i => i.path)` before asserting on paths
- **Files modified:** src/scanner/cover.test.ts
- **Verification:** All existing walkLibrary tests pass with the new API
- **Committed in:** 0b3b565 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in existing tests caused by interface change)
**Impact on plan:** Fix was necessary for correctness. No scope creep.

## Issues Encountered

None — all tasks executed cleanly.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- All MP3 folder scanning infrastructure is complete
- `file_path` populated on chapter rows for every MP3 track — MP3 player (Phase 11) can use chapter `file_path` to swap audio source at track boundaries
- `scanFolder` and `walkLibrary` exported and tested — ready for Phase 11 integration
- Known: streaming routes need to handle MP3 track file_path per-chapter for playback; that is Phase 11 scope

## Self-Check: PASSED

- FOUND: src/scanner/walk.ts
- FOUND: src/scanner/fallback.ts
- FOUND: src/scanner/index.ts
- FOUND: src/scanner/index.test.ts
- FOUND: src/scanner/cover.test.ts
- FOUND commit: 0b3b565 (feat(10-02): refactor walkLibrary to ScanItem[] and extend applyFallbackMetadata)
- FOUND commit: ccf6493 (feat(10-02): implement scanFolder and update scanLibrary for ScanItem[])
- FOUND commit: f75544a (test(10-02): comprehensive MP3 folder scanning tests)

---
*Phase: 10-mp3-folder-scanner*
*Completed: 2026-03-24*
