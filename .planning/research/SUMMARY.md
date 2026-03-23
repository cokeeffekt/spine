# Project Research Summary

**Project:** Spine — self-hosted audiobook platform
**Domain:** v1.1 milestone — Admin Tools, Progress Sync, MP3 Folder Support, Progress Tiles
**Researched:** 2026-03-23
**Confidence:** HIGH (stack and architecture), MEDIUM (MP3 scanning edge cases)

## Executive Summary

Spine v1.1 adds four capability clusters to an already-shipped v1.0 product: an admin browser UI for user management and library rescanning, server-side progress sync to enable cross-device resume, progress percentage indicators on library grid tiles, and MP3 folder scanning to expand beyond .m4b-only libraries. The research finding that anchors the entire milestone is that **no new npm dependencies are required** — all four features can be built using the existing Hono + bun:sqlite + Alpine.js + ffprobe stack. The most significant architectural work is MP3 folder support, which requires a new scanner path, a `tracks` table, a `source_type` column on `books`, and player-side track-boundary seeking.

The recommended build order flows from dependency and risk: Admin UI first (backend already exists, UI is the only gap), progress sync and tiles together (one schema migration unlocks both), and MP3 folder support last (largest scope, touches the most files, independent of the other three features). Progress sync requires one critical design decision before implementation begins: conflict resolution must use "furthest position wins" via SQLite `MAX()` in the upsert, not last-write-wins by client clock, because device clock drift will corrupt listening positions.

The primary risks are all preventable with explicit guards: the last-admin deletion lockout must be checked server-side before any DELETE executes; concurrent scans must be blocked with a module-level flag; and MP3 file ordering must use natural sort (localeCompare with `{numeric: true}`) rather than default lexicographic sort, or multi-track books will play out of order from the first listen.

## Key Findings

### Recommended Stack

No new dependencies are needed for v1.1. Hono's built-in `streamSSE()` covers rescan progress feedback without WebSockets. bun:sqlite's `INSERT ... ON CONFLICT DO UPDATE` handles progress upserts and already exists in the codebase. ffprobe (already in the Docker image) reads MP3 ID3 tags with the same JSON output structure as .m4b files. `music-metadata` npm is explicitly excluded — Bun compatibility issues (issue #16402) remain open and ffprobe makes it redundant.

**Core technologies (unchanged from v1.0):**
- **Hono 4.12.x**: HTTP framework; `streamSSE()` built into `hono/streaming` handles SSE for rescan progress
- **bun:sqlite**: Synchronous SQLite; `ON CONFLICT DO UPDATE` already used in production; one new `progress` table and one `tracks` table needed
- **Alpine.js 3.15.x CDN**: No build step; `$store.library.progressMap` keyed by bookId handles progress tiles reactively
- **ffprobe (system binary)**: Handles both .m4b chapters and MP3 ID3 tags identically via the same `format.tags` JSON structure; no library wrapper needed
- **Workbox 7.4.0 CDN**: Service worker precache revision strings must be bumped manually on any asset change

### Expected Features

**Must have (table stakes for v1.1):**
- Admin UI: list / create / delete / reset-password for users — APIs exist, browser UI does not
- GET /api/users endpoint — missing from users.ts; required before admin UI can display a user roster
- Admin-triggered library rescan with progress feedback — users should not need SSH access to refresh their library
- Progress sync to backend — "pick up where you left off on any device" is the stated core value; without server sync it only works per-device
- Progress % indicator on library grid tiles — every audiobook app (Audible, Libby, Audiobookshelf) shows this; absence is jarring

**Should have (differentiators):**
- MP3 folder support — expands the library to ripped CD collections and downloaded MP3 audiobooks; common format in existing household libraries
- "Furthest position wins" conflict resolution — protects against multi-device listening progress loss
- Scan status polling endpoint — prevents double-trigger when admin is unsure if rescan started

**Defer to v2+:**
- Real-time progress push (WebSockets/SSE for sync) — household scale (2-3 users) doesn't justify the engineering cost; periodic push on play events is sufficient
- Automatic library rescans (cron/filesystem watcher) — `watcher.ts` exists but admin-triggered covers the v1.1 use case
- Guest accounts (read-only, no password change) — not in v1.1 scope; adds a third role case to all auth middleware
- Per-chapter download granularity — whole-book download already works; out of scope per PROJECT.md

### Architecture Approach

v1.1 adds two new route files (`src/routes/admin.ts`, `src/routes/progress.ts`), one new scanner module (`src/scanner/mp3folder.ts`), and three schema additions (`progress` table, `tracks` table, `source_type` column on `books`). All other changes are surgical modifications to existing files. The local-first philosophy is preserved: IndexedDB remains the source of truth for offline playback; the server progress table is a sync target, not the primary store. The audio route gains a `source_type` branch — m4b books stream the single file as before; mp3folder books serve individual tracks by index via a `tracks` table.

**Major components:**
1. **src/routes/admin.ts** — `POST /api/admin/rescan` (background start + module-level `scanInProgress` flag), `GET /api/admin/scan-status`, guarded by `adminOnly` middleware
2. **src/routes/progress.ts** — `PUT /api/progress/:bookId` (upsert with `MAX(excluded.position_sec, position_sec)`), `GET /api/progress/:bookId`, `GET /api/progress/all`
3. **src/scanner/mp3folder.ts** — `walkMp3Folders()` returning `{ type: 'mp3folder'; folderPath: string; files: string[] }[]`, `scanMp3Folder()` calling ffprobe per-file, deriving chapters from track order
4. **src/routes/audio.ts (modified)** — branches on `source_type`; mp3folder path serves `tracks[trackIdx].file_path` with HTTP range support
5. **public/index.html (modified)** — admin view (role-gated nav link), `$store.library.progressMap` keyed by bookId, progress sync in `_saveProgress()` (fire-and-forget fetch), pull-on-book-open conflict resolution

### Critical Pitfalls

1. **Last-admin deletion lockout** — `DELETE /api/users/:id` must query `SELECT COUNT(*) FROM users WHERE role = 'admin'` before executing; if count is 1 and target is an admin, return 400. Same guard applies to role-demotion. Permanent lockout otherwise, recoverable only via `docker exec` + sqlite3.

2. **Progress sync clock drift** — "last write wins by client timestamp" fails when device A has clock drift or syncs after device B; user loses position. Use `MAX(excluded.position_sec, position_sec)` in the SQLite upsert. Server sets `updated_at = datetime('now')`. Never trust client-supplied timestamps for conflict resolution.

3. **MP3 track ordering breaks on alphabetic sort** — `['track1.mp3', 'track10.mp3', 'track2.mp3']` plays as 1, 10, 2 with default JavaScript sort. Use `localeCompare(b, undefined, { numeric: true })`. Primary sort key: ID3 disc/track tags; fallback: natural filename sort.

4. **Concurrent scan race** — `POST /api/admin/rescan` while a startup or previous manual scan is mid-run causes concurrent `scanLibrary()` calls racing on DB writes. Add module-level `scanInProgress: boolean` flag; return 409 if true. Reset in `try/finally`.

5. **MP3 book identity ambiguity** — multi-disc layouts (`Disc 1/`, `Disc 2/`) cause one book to appear as multiple. Define the canonical rule before schema work: the folder directly containing MP3 files is the book. Disc subfolders are not supported in v1.1 — document this. `file_path = folderPath` (directory, not a member file).

## Implications for Roadmap

Based on the combined research, four phases are recommended for v1.1, ordered by dependency and risk.

### Phase 1: Admin UI and Library Rescan

**Rationale:** All backend user management endpoints already exist. The only missing piece is `GET /api/users` and the Alpine view. Rescan depends on having an admin view to host the button. This phase has the lowest risk (pure UI addition over existing APIs) and the highest unblocking value — admin can manage accounts in the browser instead of via raw HTTP.

**Delivers:** Browser-accessible user management (create/delete/reset-password), admin-triggered library rescan with status feedback, and an admin-only nav section that gates all admin operations.

**Addresses:** Admin UI (table stakes), rescan trigger (table stakes), `GET /api/users` missing endpoint.

**Avoids:** Last-admin deletion lockout (P1 — must implement count guard), concurrent scan race (P5 — must implement `scanInProgress` flag before rescan endpoint ships), frontend role guard bypass (P14 — `adminOnly` middleware on all new routes), rescan double-trigger (P11 — status polling endpoint).

**Research flag:** Standard patterns (CRUD UI over existing REST, SSE for progress). No deeper research needed.

### Phase 2: Progress Sync and Progress Tiles

**Rationale:** Progress tiles depend on having a per-user progress store to read from. Server-side sync and tile display share the same data model, so building them together avoids two separate schema migrations and two separate Alpine store refactors. Tiles can ship reading from IndexedDB first (Option A), then upgrade to `GET /api/progress/all` when sync is live within the same phase.

**Delivers:** Per-user progress stored server-side with last-furthest-wins conflict resolution; progress percentage overlay on every book tile in the library grid; cross-device resume that works as soon as two devices come online.

**Addresses:** Progress sync (table stakes), progress tiles (table stakes), cross-device resume (core value proposition).

**Schema changes:** Add `progress` table with `(user_id, book_id)` unique constraint. No other schema changes needed.

**Avoids:** Clock-drift conflict resolution (P2 — `MAX(excluded.position_sec, position_sec)` in upsert), stale tile data on tab resume (P7 — refresh `progressMap` on `visibilitychange`), Alpine re-render at scale (P8 — keyed `$store.progress` map, debounce writes), blocking playback on sync fetch (fire-and-forget fetch in `_saveProgress()`).

**Research flag:** Standard patterns. LWW/furthest-wins conflict resolution is well-documented. No deeper research needed.

### Phase 3: MP3 Folder Support

**Rationale:** This is the largest scope item in v1.1 and is fully independent of Phases 1 and 2. It touches the scanner, audio route, database schema, and player. Building it last means the simpler phases are shipped and stable before the most complex change lands. The scanner architecture change (single-file books → discriminated union of `m4b` and `mp3folder`) is irreversible once committed.

**Delivers:** MP3 folder collections are scanned, cataloged, and playable. Each folder becomes one book; each MP3 file becomes one chapter. Audio is served per-track with HTTP range support. Cover art is resolved from `folder.jpg`/`cover.jpg` or the first track's `APIC` tag.

**Addresses:** MP3 folder support (differentiator).

**Schema changes:** Add `tracks` table; add `source_type` column to `books` (ALTER TABLE with try/catch for idempotency).

**Avoids:** Book identity ambiguity (P3 — folder path = book identity; document supported layout; no disc subfolder support in v1.1), lexicographic track ordering (P4 — natural sort via localeCompare + ID3 disc/track tags), schema incompatibility (P10 — `file_path` = folder path; `source_type` column gates audio route branching), cover art loss on re-extraction failure (P12 — preserve previous `cover_path` if ffprobe fails).

**Research flag:** Needs attention during planning. MP3 folder naming patterns are inconsistent across real-world collections (MEDIUM confidence). Player src-swap behavior for track-boundary seeking has less documentation than standard HTML audio. Recommend testing with a representative sample of real MP3 collections before finalizing the scanner logic.

### Phase 4: Service Worker and Cache Hygiene

**Rationale:** Every phase that adds or modifies frontend assets must update Workbox precache revision strings in `public/sw.js`. This is a maintenance phase that consolidates all revision bumps, ensures the admin view and new Alpine stores are precached correctly, and verifies the `/api/progress/*` routes are covered by NetworkFirst.

**Delivers:** Service worker updated to cache admin.html and any new JS/CSS; precache revisions current; no stale-cache incidents after deployment.

**Avoids:** Service worker stale cache (P13 — revision strings bumped for all modified assets).

**Research flag:** Standard pattern. No deeper research needed.

### Phase Ordering Rationale

- Phase 1 before Phase 2: Admin UI is lower complexity and unblocks the rescan flow. Progress sync schema is independent but conceptually follows admin stability.
- Phase 2 together (not split): Sync and tiles share the same `progress` table; implementing them together avoids two separate Alpine store migrations.
- Phase 3 last: Largest scope, most files touched, most novel patterns (track-boundary seeking, discriminated union scanner). Independent of Phases 1 and 2 at the backend.
- Phase 4 as cleanup: SW revision bumps are required after every frontend change; consolidating them avoids partial cache invalidation across phases.

### Research Flags

Needs deeper research during planning:
- **Phase 3 (MP3 scanning):** Real-world collection structures are inconsistent (MEDIUM confidence). Edge cases with disc subfolders, mixed ID3/no-ID3 files, and `<audio>` track-boundary seeking across file sources should be prototyped early.

Standard patterns (no deeper research needed):
- **Phase 1 (Admin UI):** Standard CRUD UI over existing REST endpoints. Hono SSE is documented.
- **Phase 2 (Progress sync):** REST upsert with furthest-wins conflict resolution is a well-documented pattern. Local-first IndexedDB merge is already implemented in v1.0.
- **Phase 4 (SW cache hygiene):** Workbox precache revision management is a manual but well-understood process.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies; all tools already in use and validated in production. `music-metadata` exclusion confirmed via open Bun issue. |
| Features | HIGH | Admin UI patterns from Audiobookshelf source; progress sync from industry-standard LWW research; tiles from v1.0 IndexedDB already in place. |
| Architecture | HIGH | Based on direct codebase analysis of `src/` and `public/`. Integration points identified by reading existing code, not inference. |
| Pitfalls | HIGH (admin/sync), MEDIUM (MP3) | Admin and progress pitfalls confirmed via code review. MP3 edge cases (disc folders, mixed tags) are community-reported; real-world testing required. |

**Overall confidence:** HIGH for Phases 1, 2, and 4. MEDIUM for Phase 3 (MP3 folder support) due to inconsistent real-world collection structures.

### Gaps to Address

- **MP3 disc subfolder handling:** Research explicitly defers disc subfolders to v2+. Document this decision in the scanner and README. Flag for users with multi-disc ripped collections.
- **Track-boundary seeking in `<audio>`:** Swapping `audio.src` on chapter/track boundary in the player is the recommended approach (Option C), but browser behavior when seeking across file boundaries has less documentation than standard single-file HTML audio. Plan for browser testing early in Phase 3.
- **MP3 cover art via ffprobe `attached_pic` stream:** Confirmed ffprobe can extract it, but the extraction code path differs slightly from .m4b cover art. Needs implementation testing before finalizing `scanMp3Folder()`.
- **`GET /api/progress/all` vs N IndexedDB reads:** Phase 2 can ship with either approach. The batch API endpoint is preferred once progress sync is live; document the upgrade path in the phase plan.

## Sources

### Primary (HIGH confidence)
- `https://hono.dev/docs/helpers/streaming` — Hono `streamSSE()` confirmed built-in to 4.x
- `https://bun.com/docs/runtime/sqlite` — bun:sqlite feature set; `ON CONFLICT DO UPDATE` confirmed
- `https://github.com/oven-sh/bun/issues/16402` — music-metadata Bun compatibility issue, open March 2026
- Codebase direct analysis: `src/routes/users.ts`, `src/scanner/index.ts`, `src/scanner/probe.ts`, `src/scanner/walk.ts`, `src/db/schema.ts`, `src/middleware/auth.ts`, `public/index.html`, `public/sw.js`

### Secondary (MEDIUM confidence)
- `https://www.audiobookshelf.org/guides/book-scanner/` — MP3 folder structure, metadata priority patterns
- `https://deepwiki.com/audiobookshelf/audiobookshelf-api-docs/3.6-playback-and-progress-tracking` — Progress data model, LWW conflict resolution
- `https://emby.media/support/articles/Audio-Book-Naming.html` — MP3 folder naming conventions
- `https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-architecture-trade%E2%80%91offs-practical-guide-feb-19-2026/` — Offline sync conflict resolution patterns

### Tertiary (LOW confidence — validate during implementation)
- `https://github.com/advplyr/audiobookshelf/issues/3829` — MP3 chapter creation from audio meta tags (community bug report)
- `https://github.com/advplyr/audiobookshelf/issues/2762` — Metadata precedence on rescan (community bug report)
- `https://rxdb.info/downsides-of-offline-first.html` — IndexedDB eviction, clock drift risks

---
*Research completed: 2026-03-23*
*Ready for roadmap: yes*
