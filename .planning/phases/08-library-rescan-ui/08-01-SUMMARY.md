---
phase: 08-library-rescan-ui
plan: 01
subsystem: api
tags: [hono, sse, audnexus, sqlite, scanner, enrichment, progress-streaming]

# Dependency graph
requires:
  - phase: 07-admin-user-management
    provides: adminOnly middleware, AuthVariables, admin route pattern
  - phase: 01-foundation
    provides: scanner/index.ts scanLibrary, probe.ts, db/schema.ts migration pattern
provides:
  - POST /api/scan — admin-triggered library rescan with 409 lock guard
  - GET /api/scan/progress — SSE stream of scan progress events (start/file/done)
  - scanEmitter EventEmitter bridge for SSE consumers
  - runScan wrapper with try/finally scan lock guarantee
  - isScanRunning() scan lock predicate
  - fetchAudnexusBook / applyEnrichment — Audnexus metadata enrichment client
  - ASIN extraction from m4b tags via normalizeMetadata
  - asin column in books table (migration)
affects: [08-02-frontend-library-rescan-ui, future-enrichment-phases]

# Tech tracking
tech-stack:
  added: [EventEmitter (Node built-in), SSE via hono/streaming streamSSE, AbortController for fetch timeout]
  patterns:
    - fire-and-forget async scan with .catch() error logging
    - module-level scan lock (_scanInProgress boolean) with try/finally guarantee
    - EventEmitter bridge (scanEmitter) decouples scanner from HTTP layer
    - idempotent ALTER TABLE migration in try/catch (same pattern as last_login_at)
    - enrichment fills null fields only — never overwrites existing non-null data (D-11)
    - AbortController with 5s timeout for external API calls

key-files:
  created:
    - src/scanner/enrichment.ts
    - src/scanner/enrichment.test.ts
    - src/routes/scan.ts
    - src/routes/scan.test.ts
  modified:
    - src/types.ts (added asin to NormalizedMetadata)
    - src/db/schema.ts (added asin migration)
    - src/scanner/probe.ts (extract asin from m4b tags)
    - src/scanner/index.ts (progress callback, scan lock, runScan, enrichment pass)
    - src/scanner/watcher.ts (guard against concurrent manual scans)
    - src/server.ts (mount scanRoutes)

key-decisions:
  - "Scan lock is module-level boolean (_scanInProgress) set by runScan, not a DB flag — avoids DB I/O on every check"
  - "scanEmitter EventEmitter decouples scanner from SSE route — scanner knows nothing about HTTP"
  - "onProgress is optional 4th param to scanLibrary — existing callers (server.ts, watcher.ts) unchanged"
  - "Enrichment never overwrites non-null fields (D-11) — 'fill gaps only' approach preserves manual/higher-quality data"
  - "fetchAudnexusBook silently returns null on any failure — network errors never break scans (LIBM-09)"
  - "Watcher skips interval ticks when manual scan is running — prevents concurrent scans from two paths"
  - "X-Accel-Buffering: no header set on SSE route — prevents nginx/Caddy from buffering the stream"

patterns-established:
  - "SSE pattern: streamSSE + scanEmitter.on('progress') + onAbort cleanup + done event resolve"
  - "409 lock check: isScanRunning() before fire-and-forget runScan"
  - "TDD enrichment tests: mock globalThis.fetch per-test with origFetch saved/restored"

requirements-completed: [LIBM-01, LIBM-02, LIBM-03, LIBM-08, LIBM-09]

# Metrics
duration: 7min
completed: 2026-03-23
---

# Phase 08 Plan 01: Library Rescan Backend Summary

**Admin-triggered library rescan API with SSE progress streaming, scan lock singleton, and Audnexus metadata enrichment via ASIN lookup**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-23T14:33:25Z
- **Completed:** 2026-03-23T14:41:02Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- POST /api/scan triggers async library rescan for admins; returns 409 when scan is already running
- GET /api/scan/progress streams SSE events (start, file, done) via Hono streamSSE with X-Accel-Buffering: no header
- Scan lock with try/finally guarantee means isScanRunning() is always false after runScan, even on error
- Watcher skips interval ticks when manual scan is running — no concurrent scans
- Audnexus enrichment fills null description/narrator/series_title/cover_path from ASIN lookup, never overwrites existing data
- ASIN extracted from m4b tags (asin/ASIN/audible_asin) and stored in new books.asin column

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing enrichment tests** - `6ab5e53` (test)
2. **Task 1 GREEN: Scanner progress, scan lock, enrichment, ASIN support** - `2f3d475` (feat)
3. **Task 2 RED: Failing scan route tests** - `53233d2` (test)
4. **Task 2 GREEN: Scan API routes and server mount** - `38fa8bd` (feat)

_Note: TDD tasks have RED (failing test) and GREEN (implementation) commits_

## Files Created/Modified

- `src/scanner/enrichment.ts` — Audnexus fetch client and applyEnrichment (null-safe gap filler)
- `src/scanner/enrichment.test.ts` — 12 tests covering fetch success/failure/timeout and apply behavior
- `src/routes/scan.ts` — POST /api/scan and GET /api/scan/progress endpoints
- `src/routes/scan.test.ts` — 6 tests for scan route auth, lock guard, and SSE headers
- `src/scanner/index.ts` — Added ScanProgressEvent, ProgressCallback, scanEmitter, isScanRunning, runScan, onProgress param, enrichment pass
- `src/scanner/watcher.ts` — Guard: skip tick if isScanRunning()
- `src/types.ts` — Added asin: string | null to NormalizedMetadata
- `src/db/schema.ts` — Added asin column migration (idempotent try/catch pattern)
- `src/scanner/probe.ts` — Added asin: normalizeTag(tags, "asin", "ASIN", "audible_asin", "AUDIBLE_ASIN")
- `src/server.ts` — Mounted scanRoutes

## Decisions Made

- Scan lock is a module-level boolean (`_scanInProgress`) set exclusively by `runScan()` — no DB round-trip required on every isScanRunning() check
- `scanEmitter` EventEmitter decouples the scanner from the HTTP layer — scanner emits `progress` and `done` events; the route subscribes and streams them as SSE
- `onProgress` is an optional 4th parameter to `scanLibrary()` — all existing callers (server.ts startup scan, watcher.ts) are backward-compatible with zero changes to call sites
- Enrichment fills null fields only (never overwrites) per D-11 — preserves manually set or higher-quality metadata
- `fetchAudnexusBook` returns null on any failure (network, 404, timeout) — enrichment failures never propagate to the scan caller (LIBM-09)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all acceptance criteria met on first implementation pass.

## User Setup Required

None - no external service configuration required. Audnexus is a free public API with no auth key needed.

## Next Phase Readiness

- Backend scan API is complete and tested; ready for Phase 08 Plan 02 (frontend Library tab rescan UI)
- scanEmitter and isScanRunning are exported and ready for the SSE consumer in the frontend
- POST /api/scan returns { ok: true } immediately; SSE stream carries real-time progress
- No blockers

## Self-Check: PASSED

All files verified present. All 4 task commits confirmed in git log.

---
*Phase: 08-library-rescan-ui*
*Completed: 2026-03-23*
