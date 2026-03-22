---
phase: 06-offline-download
plan: "01"
subsystem: frontend-utils
tags: [tdd, download, indexeddb, offline, player-utils]
dependency_graph:
  requires: []
  provides: [formatBytes, downloadDB, reconcileDownloads]
  affects: [public/player-utils.js]
tech_stack:
  added: []
  patterns: [IIFE-IndexedDB, injected-callbacks-for-testability, module.exports-guard]
key_files:
  created:
    - tests/downloads.test.ts
  modified:
    - public/player-utils.js
key_decisions:
  - "downloadDB uses raw IndexedDB (no library) following progressDB IIFE pattern — single-store schema is simple without a wrapper"
  - "reconcileDownloads accepts injected cacheLookupFn/deleteFn callbacks — makes it testable without browser Cache Storage API"
  - "downloadDB not tested in bun:test — IndexedDB is browser-only; IIFE verified by code review only"
metrics:
  duration: 2 minutes
  completed_date: "2026-03-22"
  tasks_completed: 2
  files_modified: 2
---

# Phase 06 Plan 01: Download Utility Pure Functions Summary

TDD implementation of formatBytes, downloadDB IIFE, and reconcileDownloads in player-utils.js — pure utility functions for the offline download system, tested with bun:test before integration.

## What Was Built

Three utility functions added to `public/player-utils.js` following the established player-utils pattern from Phase 4/5:

- **`formatBytes(bytes)`** — converts raw byte counts to human-readable KB/MB/GB strings; handles null/undefined gracefully
- **`downloadDB` IIFE** — IndexedDB wrapper for offline download metadata (`spine-downloads` store), following the exact `progressDB` IIFE pattern; methods: `open`, `get`, `getAll`, `getAllKeys`, `save`, `delete`; stores `{ bookId, sizeBytes, downloadedAt }` with bookId as key
- **`reconcileDownloads(bookIds, cacheLookupFn, deleteFn)`** — pure async function that filters a list of tracked download IDs against what actually exists in Cache Storage; uses injected callback pattern for testability

## TDD Execution

**RED phase** (`2793c15`): Created `tests/downloads.test.ts` with 11 failing tests — 8 for `formatBytes` (covering 0, KB, MB, GB, null, undefined) and 3 for `reconcileDownloads` (filter valid, empty input, all stale).

**GREEN phase** (`7123b99`): Implemented all three functions in `player-utils.js`, updated `module.exports` guard. All 11 new tests pass. Full suite: 144 pass, 0 fail.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — `downloadDB` is a complete IIFE implementation ready for browser use. Note: `downloadDB` is not tested via bun:test (IndexedDB is browser-only), which is expected and documented in the plan.

## Self-Check: PASSED

Files verified:
- `tests/downloads.test.ts` — exists, 49 lines, 11 test cases
- `public/player-utils.js` — contains `function formatBytes`, `const downloadDB`, `async function reconcileDownloads`, all three in module.exports

Commits verified:
- `2793c15` — test(06-01): add failing tests
- `7123b99` — feat(06-01): implement functions
