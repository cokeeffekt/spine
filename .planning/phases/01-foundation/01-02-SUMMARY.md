---
phase: 01-foundation
plan: 02
subsystem: scanner
tags: [ffprobe, ffmpeg, child_process, spawn, m4b, metadata, chapters, cover-art, tdd]

# Dependency graph
requires:
  - phase: 01-foundation
    plan: 01
    provides: "src/types.ts with FfprobeOutput, NormalizedMetadata, NormalizedChapter interfaces"
provides:
  - "probeFile: spawn ffprobe, parse JSON output"
  - "normalizeTag: case-insensitive tag lookup with multi-key fallback"
  - "normalizeChapters: real chapters or single implicit chapter for chapter-less files"
  - "normalizeMetadata: full NormalizedMetadata from FfprobeOutput"
  - "extractCoverArt: spawn ffmpeg with -y -map 0:v flags, graceful null on failure"
  - "resolveCoverPath: D-09 (embedded wins) and D-10 (folder fallback) logic"
  - "walkLibrary: recursive .m4b discovery, sorted absolute paths"
affects: [01-03, scanner-orchestrator, library-api]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct child_process.spawn for ffprobe/ffmpeg — no wrapper libraries"
    - "Case-insensitive tag normalization checking exact, UPPER, and lower variants"
    - "Implicit chapter synthesis: chapter-less .m4b gets single chapter spanning full duration"
    - "Graceful null returns from ffmpeg cover extraction (missing cover is not fatal)"
    - "D-09: embedded cover art wins, overwrites existing cover.jpg (-y flag)"
    - "D-10: folder cover.jpg as fallback when no embedded stream"
    - "TDD: test fixtures as JSON, test → implement → verify cycle"

key-files:
  created:
    - src/scanner/probe.ts
    - src/scanner/probe.test.ts
    - src/scanner/cover.ts
    - src/scanner/cover.test.ts
    - src/scanner/walk.ts
    - tests/fixtures/sample-ffprobe-output.json
    - tests/fixtures/sample-no-chapters.json
    - tests/fixtures/sample-no-metadata.json
  modified: []

key-decisions:
  - "normalizeTag checks three casing variants (exact, UPPER, lower) per key — handles real-world ffprobe tag inconsistency"
  - "extractCoverArt resolves null on ffmpeg failure — missing cover should never fail a scan"
  - "walkLibrary uses fs.readdirSync recursive option (Node 20+ / Bun native) — no recursive walk implementation needed"

patterns-established:
  - "Pattern: spawn ffprobe/ffmpeg directly from child_process — no fluent-ffmpeg or wrappers"
  - "Pattern: normalizeTag(...keys) multi-key fallback — title → TITLE → title, artist → album_artist"
  - "Pattern: implicit chapter synthesis — chapter-less files always produce one chapter"

requirements-completed: [SCAN-01, SCAN-02, SCAN-04]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 01 Plan 02: Scanner Modules Summary

**ffprobe metadata extraction, case-insensitive tag normalization, implicit chapter synthesis, ffmpeg cover art extraction with D-09/D-10 fallback logic, and recursive .m4b directory walker**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T03:01:54Z
- **Completed:** 2026-03-22T03:04:55Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 8 created, 0 modified

## Accomplishments

- ffprobe spawn module with case-insensitive tag normalization across 10 metadata fields and implicit single-chapter synthesis for chapter-less .m4b files
- ffmpeg cover art extraction with -y overwrite flag (D-09) and graceful null return on failure, plus resolveCoverPath with D-10 folder fallback
- Recursive .m4b directory walker using native fs.readdirSync recursive option, sorted output for deterministic ordering
- 23 tests pass across probe.test.ts (16) and cover.test.ts (7)

## Task Commits

Each task was committed atomically:

1. **Task 1: ffprobe spawn, tag normalization, and chapter normalization** - `87792bf` (feat)
2. **Task 2: Cover art extraction and directory walker** - `721815f` (feat)

_Note: TDD tasks; both followed test-first RED then GREEN cycle_

## Files Created/Modified

- `src/scanner/probe.ts` - normalizeTag, normalizeChapters, normalizeMetadata, probeFile exports
- `src/scanner/probe.test.ts` - 16 tests covering tag normalization, chapter normalization, metadata mapping, probeFile error handling
- `src/scanner/cover.ts` - extractCoverArt (ffmpeg spawn, D-09), resolveCoverPath (D-10 fallback)
- `src/scanner/cover.test.ts` - 7 tests covering null return, fallback path resolution, walkLibrary recursive discovery
- `src/scanner/walk.ts` - walkLibrary recursive .m4b discovery, sorted absolute paths
- `tests/fixtures/sample-ffprobe-output.json` - Full ffprobe output with chapters, cover stream, and all metadata tags
- `tests/fixtures/sample-no-chapters.json` - Same structure but chapters array is empty
- `tests/fixtures/sample-no-metadata.json` - Empty tags, audio-only stream, no chapters

## Decisions Made

- normalizeTag checks exact, UPPER, and lower casing per key — real ffprobe output uses inconsistent casing across tools/versions
- extractCoverArt resolves null (not throws) on ffmpeg non-zero exit — cover extraction failure should never block a scan
- Used fs.readdirSync with recursive option (native in Node 20+ and Bun) rather than implementing recursive walk manually

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All three scanner modules are independently testable and ready for composition in Plan 03 (scanner orchestrator)
- probeFile, normalizeMetadata, extractCoverArt, resolveCoverPath, and walkLibrary are all exported and typed
- No blockers

---
*Phase: 01-foundation*
*Completed: 2026-03-22*

## Self-Check: PASSED

- src/scanner/probe.ts: FOUND
- src/scanner/cover.ts: FOUND
- src/scanner/walk.ts: FOUND
- tests/fixtures/sample-ffprobe-output.json: FOUND
- tests/fixtures/sample-no-chapters.json: FOUND
- tests/fixtures/sample-no-metadata.json: FOUND
- Commit 87792bf: FOUND
- Commit 721815f: FOUND
