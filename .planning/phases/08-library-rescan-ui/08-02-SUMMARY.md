---
phase: 08-library-rescan-ui
plan: 02
subsystem: frontend
tags: [alpine, sse, progress-bar, tab-ui, sw-precache]
status: checkpoint-pending

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
    - es.close() called inside done handler before onerror can fire
    - SW precache revision bump on every static file change (MEMORY.md rule)

key-files:
  modified:
    - public/index.html
    - public/style.css
    - public/sw.js

key-decisions:
  - "x-show (not x-if) used for both tab panels — x-if would destroy reactive state when switching tabs"
  - "startScan() calls es.close() inside done handler before onerror fires — prevents reconnect loop (Pitfall 2)"
  - "Tab state (activeTab) is local to admin x-data — not in $store — admin state doesn't need to survive view switches since outer x-if destroys it"

# Metrics
duration: partial (checkpoint pending)
completed: pending-human-verify
---

# Phase 08 Plan 02: Admin Library Rescan UI Summary

**Admin Library tab with rescan trigger, live SSE progress bar, tab navigation, and auto-refresh of library grid on scan completion**

## Status: CHECKPOINT PENDING

Awaiting human verification of the admin rescan flow end-to-end.

## Performance

- **Started:** 2026-03-24
- **Tasks:** 1 of 2 completed (Task 2 is human-verify checkpoint)
- **Files modified:** 3

## Accomplishments

- Admin page now has Users and Library tabs with active indicator (underline accent color)
- Library tab shows "Rescan Library" button that triggers POST /api/scan
- Button changes to "Scan in progress" and is disabled during active scan
- Live progress bar fills as SSE file events arrive from /api/scan/progress
- Progress text shows "Scanning... X / Y files" with current filename
- On scan completion, summary shows new/updated/missing/not-enriched counts
- Library grid auto-refreshes via $store.library.loadBooks() on done event
- Service worker precache revisions bumped to '5' for index.html and style.css

## Task Commits

1. **Task 1: Admin tab UI, Library tab with SSE scan progress, and CSS styles** - `4cc5228` (feat)

## Files Created/Modified

- `public/index.html` — Added activeTab state, startScan() method, tab bar, Users/Library tab panels with SSE progress and scan summary
- `public/style.css` — Added .admin-tabs, .admin-tab-btn, .admin-tab-active, .admin-scan-progress-*, .admin-scan-summary styles
- `public/sw.js` — Bumped precache revisions: index.html and style.css from '4' to '5'

## Decisions Made

- `x-show` (not `x-if`) used for both tab panels — preserves DOM state when switching tabs, consistent with Phase 7 lesson on Pitfall 6
- `startScan()` calls `es.close()` inside the `done` handler before `onerror` can fire — prevents reconnect loop (Pitfall 2)
- Tab state (`activeTab`) is local to admin `x-data`, not in `$store` — outer `x-if` already destroys admin state on view change

## Deviations from Plan

None - Task 1 executed exactly as written.

## Known Stubs

None - all data flows are wired to the live backend API.

## Pending: Human Verification

Task 2 requires admin to:
1. Start server: `cd /home/coke/gits/spine && /home/coke/.bun/bin/bun run src/server.ts`
2. Open http://localhost:3000, log in as admin
3. Click Admin nav link, verify two tabs: "Users" and "Library"
4. Click Library tab, click "Rescan Library"
5. Verify button becomes "Scan in progress" (disabled), progress bar fills
6. Verify scan summary appears on completion
7. Verify library grid auto-refreshes
