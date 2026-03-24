---
phase: 08-library-rescan-ui
plan: 02
subsystem: frontend
tags: [alpine, sse, eventsource, progress-bar, tab-ui, sw-precache, bun]

# Dependency graph
requires:
  - phase: 08-library-rescan-ui
    plan: 01
    provides: POST /api/scan, GET /api/scan/progress SSE, scanEmitter
  - phase: 07-admin-user-management
    provides: admin x-data pattern, .admin-container CSS, adminOnly middleware
provides:
  - Admin Library tab with rescan trigger button
  - Live SSE progress bar for scan (file count, current file)
  - Scan summary display (new/updated/missing/not-enriched)
  - Auto-refresh of library grid on scan completion
  - Tab navigation between Users and Library on admin page
affects: [public/index.html, public/style.css, public/sw.js]

# Tech tracking
tech-stack:
  added: [EventSource (browser SSE client)]
  patterns:
    - Alpine x-data tab state (activeTab local to component)
    - EventSource wired to /api/scan/progress SSE endpoint
    - x-show for tab panels (not x-if — per Pitfall 6)
    - "SSE on Bun: use raw ReadableStream + initial comment flush, not Hono streamSSE"
    - "Connect EventSource BEFORE POST to avoid race condition with fire-and-forget scan"
    - SW precache revision bump on every static file change (MEMORY.md rule)

key-files:
  modified:
    - public/index.html
    - public/style.css
    - public/sw.js
    - src/routes/scan.ts
    - src/server.ts
    - src/scanner/index.ts

key-decisions:
  - "Used raw ReadableStream instead of Hono streamSSE for Bun SSE compatibility"
  - "Connect EventSource before POST to eliminate race condition with fire-and-forget scan start"
  - "Send SSE comment on connect to trigger browser onopen event on Bun"
  - "Set Bun.serve idleTimeout to 255 for long-lived SSE connections"
  - "x-show (not x-if) used for both tab panels — x-if would destroy reactive state when switching tabs"
  - "Tab state (activeTab) is local to admin x-data — not in $store"

patterns-established:
  - "SSE on Bun: use raw ReadableStream + initial comment flush, not Hono streamSSE"
  - "Admin tabs: x-show (not x-if) for tab panels, activeTab state in x-data"

requirements-completed: [LIBM-01, LIBM-02, LIBM-03, LIBM-08, LIBM-09]

# Metrics
duration: 25min
completed: 2026-03-24
---

# Phase 08 Plan 02: Admin Library Rescan UI Summary

**Admin Library tab with rescan trigger, live SSE progress bar, tab navigation, and Bun SSE compatibility fixes (raw ReadableStream + onopen flush)**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-03-24
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 6

## Accomplishments

- Admin page has Users and Library tabs with active indicator (underline accent color)
- Library tab shows "Rescan Library" button that triggers POST /api/scan
- Button changes to "Scan in progress" and is disabled during active scan
- Live progress bar fills as SSE file events arrive from /api/scan/progress
- Progress text shows "Scanning... X / Y files" with current filename
- On scan completion, summary shows new/updated/missing/not-enriched counts
- Library grid auto-refreshes via $store.library.loadBooks() on done event
- Fixed Bun SSE: raw ReadableStream replaces Hono streamSSE, initial comment flushes onopen
- Fixed race condition: EventSource connects before POST fires scan
- Service worker precache revisions bumped to '6'

## Task Commits

1. **Task 1: Admin tab UI, Library tab with SSE scan progress, and CSS styles** - `4cc5228` (feat)
2. **Task 2: Human verification + SSE fixes** - `1284ec5` (docs) + `9f1cf9b` (fix)

## Files Created/Modified

- `public/index.html` — Added activeTab state, startScan() method, tab bar, Users/Library tab panels with SSE progress and scan summary
- `public/style.css` — Added .admin-tabs, .admin-tab-btn, .admin-tab-active, .admin-scan-progress-*, .admin-scan-summary styles
- `public/sw.js` — Bumped precache revisions to '6'
- `src/routes/scan.ts` — Replaced Hono streamSSE with raw ReadableStream, added SSE comment flush
- `src/server.ts` — Added idleTimeout: 255 for Bun.serve, startup scan logging
- `src/scanner/index.ts` — Added verbose scan/enrichment logging

## Decisions Made

- `x-show` (not `x-if`) for tab panels — preserves DOM state when switching tabs
- Hono's `streamSSE` doesn't work on Bun — replaced with raw `ReadableStream`
- Bun doesn't trigger EventSource `onopen` until data flows — send `: connected` SSE comment
- Frontend connects EventSource BEFORE POST to guarantee listener ready for events
- `idleTimeout: 255` (Bun max) prevents SSE connection drops during long scans

## Deviations from Plan

### Auto-fixed Issues

**1. SSE connection dropping on Bun (idleTimeout)**
- **Found during:** Human verification (Task 2)
- **Issue:** Bun's default 10s idleTimeout killed SSE connections before scan finished
- **Fix:** Set `idleTimeout: 255` on Bun.serve
- **Files modified:** src/server.ts
- **Committed in:** 9f1cf9b

**2. Hono streamSSE incompatible with Bun**
- **Found during:** Human verification (Task 2)
- **Issue:** Hono's streamSSE helper didn't deliver events to browser on Bun
- **Fix:** Replaced with raw ReadableStream response
- **Files modified:** src/routes/scan.ts
- **Committed in:** 9f1cf9b

**3. SSE race condition — events lost before listener attached**
- **Found during:** Human verification (Task 2)
- **Issue:** POST fired scan before EventSource connected; start/file events lost
- **Fix:** Frontend connects EventSource first, waits for onopen, then POSTs
- **Files modified:** public/index.html
- **Committed in:** 9f1cf9b

**4. EventSource onopen never fires on Bun without initial data**
- **Found during:** Human verification (Task 2)
- **Issue:** Bun doesn't trigger onopen on ReadableStream SSE until data is sent
- **Fix:** Send `: connected\n\n` SSE comment immediately on stream start
- **Files modified:** src/routes/scan.ts
- **Committed in:** 9f1cf9b

---

**Total deviations:** 4 auto-fixed (all Bun SSE compatibility)
**Impact on plan:** Essential fixes for Bun runtime. No scope creep.

## Issues Encountered
None beyond the SSE/Bun deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 8 feature complete: admin can trigger rescans with live progress
- All 169 tests pass
- Ready for phase verification

---
*Phase: 08-library-rescan-ui*
*Completed: 2026-03-24*
