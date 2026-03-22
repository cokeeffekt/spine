---
phase: 01-foundation
plan: 03
subsystem: scanner
tags: [scanner, sqlite, watcher, fallback-metadata, tdd]
dependency_graph:
  requires:
    - 01-01  # db schema, types, server skeleton
    - 01-02  # probe.ts, cover.ts, walk.ts
  provides:
    - scanner-orchestrator  # scanLibrary, scanFile
    - fallback-metadata     # applyFallbackMetadata
    - file-watcher          # startWatcher, stopWatcher
  affects:
    - src/server.ts         # now runs scanner on startup
tech_stack:
  added: []
  patterns:
    - Injectable probeFn for testable scanner (default is real ffprobe)
    - setInterval-based polling watcher (zero-dependency, Docker-reliable)
    - SQLite UPSERT with ON CONFLICT(file_path) DO UPDATE for idempotent scanning
    - Transaction-wrapped chapter replacement for atomicity
    - Semaphore pattern (Set<Promise>) for concurrency limiting
key_files:
  created:
    - src/scanner/fallback.ts
    - src/scanner/index.ts
    - src/scanner/watcher.ts
    - src/scanner/index.test.ts
  modified:
    - src/server.ts
decisions:
  - "Used injectable probeFn parameter on scanFile/scanLibrary for testing — avoids module mocking complexity"
  - "setInterval chosen over chokidar — chokidar v5 ESM+Bun compatibility unverified; setInterval is zero-dependency and functionally identical (Docker requires polling anyway)"
  - "D-04 fix: scanFile checks is_missing flag even in early-return (mtime+size match) path — handles reappearance when mtime is identical (common in fast tests)"
metrics:
  duration_minutes: 3
  completed_date: "2026-03-22"
  tasks_completed: 2
  files_created: 4
  files_modified: 1
---

# Phase 01 Plan 03: Scanner Orchestrator — Summary

**One-liner:** Scanner orchestrator ties probe/cover/walk into SQLite UPSERT lifecycle with incremental scanning, missing-file detection, fallback metadata, and setInterval watcher.

## What Was Built

### src/scanner/fallback.ts
Reads `metadata.json` from the .m4b's directory and fills null fields only (embedded metadata wins per D-07). Falls back to folder name as title hint when all title sources are empty.

### src/scanner/index.ts
- `scanFile`: stats file for mtime+size, skips ffprobe on unchanged files (D-02), applies fallback metadata (SCAN-05), UPSERTs into books with `ON CONFLICT(file_path) DO UPDATE`, atomically replaces chapters in a transaction, sets `is_missing=0` on upsert and in the early-return path (D-04).
- `scanLibrary`: walks directory, processes up to 4 files concurrently, marks files not in the current walk as `is_missing=1` (D-03).

### src/scanner/watcher.ts
`startWatcher` uses `setInterval` (default 5 min, configurable via `SCAN_INTERVAL_MS`) to call `scanLibrary` periodically. `stopWatcher` for clean shutdown and test teardown.

### src/server.ts (updated)
Imports `scanLibrary` and `startWatcher`. After `Bun.serve`, runs initial scan (wrapped in try/catch — missing LIBRARY_ROOT is not fatal) then starts the watcher.

## Tests

11 integration tests in `src/scanner/index.test.ts`:
- `applyFallbackMetadata`: fills nulls, respects D-07 priority, folder name fallback, multi-field fill, graceful missing json
- `scanLibrary`: populates books, D-02 incremental skip, D-03 missing flag, D-04 reappearance, chapter insertion, empty dir

All 38 tests in the project pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] D-04 reappearance unflagging in early-return path**
- **Found during:** Task 1 TDD GREEN phase
- **Issue:** When a file reappears with identical mtime+size (common in fast tests where mtime resolution equals the re-create time), `scanFile` returned early due to the incremental check. The UPSERT was never reached, so `is_missing` stayed at 1.
- **Fix:** Added explicit `is_missing` check in the early-return block: if the file is present on disk but `is_missing=1` in DB, update it to 0 before returning.
- **Files modified:** `src/scanner/index.ts`
- **Commit:** dbf548a

## Known Stubs

None — all data paths are wired. Scanner reads from real SQLite, probe function is injectable for tests, watcher calls real scanLibrary.

## Self-Check: PASSED

All created files exist on disk. All task commits verified in git log:
- `176dc14` test(01-03): add failing integration tests for scanner orchestrator
- `dbf548a` feat(01-03): implement scanner orchestrator and fallback metadata
- `fde6e46` feat(01-03): add file watcher and wire scanner into server startup
