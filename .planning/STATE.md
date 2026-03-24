---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Admin Tools & Library Improvements
status: Ready to execute
stopped_at: Completed 11-01-PLAN.md
last_updated: "2026-03-24T11:32:10.732Z"
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 10
  completed_plans: 9
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-23)

**Core value:** A household can browse their audiobook library, listen with full player controls, and pick up exactly where they left off — on any device, even offline.
**Current focus:** Phase 11 — mp3-player-support

## Current Position

Phase: 11 (mp3-player-support) — EXECUTING
Plan: 2 of 2

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v1.1)
- Average duration: — (v1.0 baseline: ~15 plans)
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 07-admin-user-management P01 | 2 | 1 tasks | 6 files |
| Phase 07-admin-user-management P02 | 90 | 3 tasks | 3 files |
| Phase 08-library-rescan-ui P01 | 7 | 2 tasks | 10 files |
| Phase 09-progress-sync-and-tiles P01 | 110 | 2 tasks | 4 files |
| Phase 09-progress-sync-and-tiles P02 | 480 | 3 tasks | 2 files |
| Phase 10-mp3-folder-scanner P01 | 2 | 2 tasks | 4 files |
| Phase 10-mp3-folder-scanner P02 | 7 | 3 tasks | 5 files |
| Phase 11-mp3-player-support P01 | 2 | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Carried from v1.0 — see `.planning/milestones/v1.0-ROADMAP.md` for full history.

Key decisions affecting v1.1:

- bun:sqlite (built-in) for database — better-sqlite3 incompatible with Bun runtime
- Alpine.js + Workbox PWA — no build step, CDN-loaded
- Raw IndexedDB for client-side progress storage — per-user keys include username
- Progress conflict resolution: furthest-position-wins via SQLite MAX() — not last-write-wins (clock drift risk)
- No new npm dependencies for v1.1 — all features use existing stack
- [Phase 07-01]: last_login_at uses SQLite datetime('now') for consistency with created_at column pattern
- [Phase 07-01]: ALTER TABLE migration in try/catch: idempotent for both fresh installs and database upgrades
- [Phase 07-admin-user-management]: Alpine x-if required (not x-show) for containers with deeply nested reactive state — x-show does not gate expression evaluation
- [Phase 07-admin-user-management]: Accordion create form pattern: collapsed by default under '+ New User' toggle to reduce admin page visual noise
- [Phase 07-admin-user-management]: sessionStorage view persistence: $store.app.view saved/restored on init so admin page survives page reloads
- [Phase 08-01]: Scan lock is module-level boolean set by runScan with try/finally guarantee — no DB round-trip on isScanRunning checks
- [Phase 08-01]: scanEmitter EventEmitter decouples scanner from HTTP layer — scanner emits progress/done events, SSE route subscribes
- [Phase 08-01]: Enrichment fills null fields only (D-11) — never overwrites existing non-null data, preserves manually set metadata
- [Phase 08-02]: x-show (not x-if) used for tab panels — preserves reactive DOM state when switching tabs (Pitfall 6)
- [Phase 08-02]: EventSource es.close() called inside done handler — prevents onerror reconnect loop (Pitfall 2)
- [Phase 09-01]: No server-side MAX guard on PUT progress: client handles furthest-position-wins conflict resolution per D-06
- [Phase 09-01]: Progress table in main db.exec() block (not try/catch migration): CREATE TABLE IF NOT EXISTS is idempotent per Pitfall 5
- [Phase 09-01]: GET /api/progress returns map keyed by string book_id for frontend key lookups
- [Phase 09-02]: Fire-and-forget server push in _saveProgress() per D-03; failures silently ignored via .catch()
- [Phase 09-02]: Optimistic progressMap update before server response for live tile badge updates without refetch
- [Phase 09-02]: progressRes.ok guard in loadBooks() prevents setting progressMap to error object on 401
- [Phase 10-01]: sortTracks uses generic T extends track shape to preserve caller type; localeCompare numeric:true for natural filename sort
- [Phase 10-01]: chapters.file_path migration placed after asin migration — NULL default means no INSERT changes needed for m4b scanFile
- [Phase 10-02]: walkLibrary returns ScanItem[] union type (not string[]) — enables type-safe branching in scanLibrary on item.kind
- [Phase 10-02]: Standalone mp3 rule: < 2 direct mp3 files in a folder = not treated as book folder
- [Phase 10-02]: scanFolder cover art uses inline folder scan, not resolveCoverPath — resolveCoverPath path.dirname returns parent when given a directory path
- [Phase 10-02]: Pitfall 5: series_position matching /^\d+(?:\/\d+)?$/ nulled in mergeTrackMetadata — probe.ts maps 'track' tag to series_position, so TRCK values land there for MP3 files
- [Phase 11-01]: New /books/:id/audio/:chapterIdx route registered before /books/:id/audio so Hono matches the more-specific path first
- [Phase 11-01]: format field derived from chapters[0].file_path at query time — no new books table column needed
- [Phase 11-01]: file_path stripped from chapter response objects via destructuring to avoid exposing server paths (D-05)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 10 (MP3 scanning): real-world collection structures inconsistent — plan for robust fallbacks
- Phase 11 (MP3 player): track-boundary seeking in `<audio>` has limited documentation — prototype early

## Session Continuity

Last session: 2026-03-24T11:32:10.730Z
Stopped at: Completed 11-01-PLAN.md
Resume file: None
