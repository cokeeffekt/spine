---
phase: 06-offline-download
plan: "03"
subsystem: frontend-pwa
tags: [alpine-store, offline, download, filter, storage-management, offline-dimming]
dependency_graph:
  requires:
    - phase: 06-02
      provides: downloads-store, download-ui, offline-indicators
  provides:
    - filter-downloaded-toggle
    - storage-summary-display
    - offline-book-dimming
    - showDownloadedOnly-flag
  affects: [public/index.html, public/style.css]
tech_stack:
  added: []
  patterns: [Alpine-store-computed-filter, Alpine-downloads-aggregate-methods]
key_files:
  created: []
  modified:
    - public/index.html
    - public/style.css
key_decisions:
  - "showDownloadedOnly flag stored directly on $store.downloads — consistent with existing store patterns, filter state is part of download management concern"
  - "getDownloadedCount/getTotalSizeBytes as methods not getters — Alpine stores work better with explicit methods for aggregate operations over reactive maps"
  - "filteredBooks getter composes search filter first then downloaded filter — allows combined search + downloaded filtering"
  - "Storage summary shown only when showDownloadedOnly is active — avoids cluttering the default view per D-08"
  - "offline-dim uses pointer-events: auto per D-12 — grayed books still tappable to show detail/offline notice"

requirements-completed:
  - OFFL-03

metrics:
  duration: 5 minutes
  completed_date: "2026-03-23"
  tasks_completed: 2
  files_modified: 2
---

# Phase 06 Plan 03: Storage Management UI Summary

**Downloaded filter toggle, storage summary, and offline book dimming using Alpine $store.downloads aggregate methods and CSS offline-dim class**

## Status

**COMPLETE** — Task 1 implemented, Task 2 human-verified (approved). Three browser bugs found and fixed during testing.

## Performance

- **Duration:** ~5 min (Task 1 only)
- **Started:** 2026-03-23
- **Completed:** 2026-03-23
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- Added `showDownloadedOnly: false` property, `getDownloadedCount()`, `getTotalSizeBytes()`, and `toggleDownloadedFilter()` to `$store.downloads`
- Updated `filteredBooks` getter to apply search filter then downloaded-only filter (D-07)
- Added "Downloaded" filter toggle button in search bar (visible only when at least one download exists)
- Added storage summary span shown when filter is active (D-08): "N book(s) -- X MB"
- Added `offline-dim` class binding on book cards for undownloaded books when offline (D-11)
- Added full CSS for `.filter-downloaded`, `.filter-downloaded.active`, `.offline-dim`, `.storage-summary`

## Task Commits

1. **Task 1: Downloaded filter toggle, storage summary, and offline dimming** - `ecf6102` (feat)
2. **Task 2: Human verification** - `eb073c9` (fix — three browser bugs found and fixed during e2e testing)

## Files Created/Modified

- `public/index.html` — Added showDownloadedOnly flag, aggregate methods, filteredBooks filter composition, filter button, storage summary, offline-dim class binding on book-card
- `public/style.css` — Added .filter-downloaded, .filter-downloaded.active, .storage-summary, .offline-dim, .search-bar flex-wrap styles

## Decisions Made

- `getDownloadedCount()` and `getTotalSizeBytes()` are methods (not getters) because Alpine stores handle methods over dynamic aggregate operations more reliably
- `filteredBooks` composes both filters: search first, then downloaded-only, enabling combined filtering
- `offline-dim` keeps `pointer-events: auto` so grayed-out books remain tappable per D-12

## Deviations from Plan

Three browser bugs found during human verification:
1. `const downloadDB` in player-utils.js doesn't create a browser global — changed to `var`
2. `<body x-cloak>` without `x-data` — Alpine never removed x-cloak, causing white screen
3. `filteredBooks` getter called `Alpine.store('downloads')` before it was defined — added null check
All fixed in commit `eb073c9`.

## Known Stubs

None — all filter and dimming logic is fully wired to real `$store.downloads.states` data.

## Self-Check: PASSED

Files verified:
- `public/index.html` — contains `showDownloadedOnly`, `getDownloadedCount`, `getTotalSizeBytes`, `toggleDownloadedFilter`, `Alpine.store('downloads').showDownloadedOnly` in filteredBooks, `class="filter-downloaded"`, `class="storage-summary"`, `'offline-dim': $store.app.isOffline`
- `public/style.css` — contains `.filter-downloaded`, `.filter-downloaded.active`, `.offline-dim` with `opacity: 0.4`, `.storage-summary`

Commit verified: `ecf6102`

## Next Phase Readiness

- Complete offline download system ready for end-to-end human verification (Task 2)
- After human verification, Phase 06 (offline-download) will be fully validated

---
*Phase: 06-offline-download*
*Completed: 2026-03-23*
