# Phase 9: Progress Sync and Tiles - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Playback progress syncs to the server so users resume at the right position on any device, and each grid tile shows a reading percentage. This phase delivers: a `progress` table in SQLite, two REST endpoints (push position per book, fetch all progress for tile badges), client-side sync logic piggybacking on the existing 15s auto-save, offline queue with flush-on-reconnect, furthest-position-wins merge on book open, and a bottom progress bar on each library grid tile.

</domain>

<decisions>
## Implementation Decisions

### Sync timing & triggers
- **D-01:** Progress pushes to the server on every 15s auto-save tick (piggybacks on existing `_saveProgress()` interval) AND on every pause event. Same triggers as IndexedDB writes — no separate sync timer.
- **D-02:** Offline saves queue locally in IndexedDB as usual. On `online` event, flush the latest position for each book that changed while offline. Only the most recent position per book needs to sync — no intermediate save queue.
- **D-03:** Sync failures are silent. Failed pushes retry on the next 15s tick or reconnect. No user-visible error indicator — local progress in IndexedDB is always safe.
- **D-04:** On book open, fetch server progress for that book (`GET /api/progress/:bookId` or included in bulk). Compare with local IndexedDB. Use furthest-position-wins (MAX) to determine resume point.

### Conflict resolution UX
- **D-05:** When server position is ahead of local (user listened further on another device), playback silently starts at the furthest position. No toast, no notification — the user expects to resume where they left off.
- **D-06:** Server trusts the client — push always stores whatever position the client sends. No server-side MAX guard. If a user deliberately scrubs back or re-listens a chapter, that lower position is honored.
- **D-07:** Furthest-position-wins applies only on the *pull* side (when opening a book, compare local vs server and use MAX). The push side is unconditional.
- **D-08:** Tile badge percentage can go backwards if user re-listens from an earlier point. This is acceptable — badge shows current actual position, not a high-water mark.

### Progress badge on tiles
- **D-09:** Bottom progress bar along the bottom edge of the cover image on each book card. Thin horizontal bar filled proportionally — similar to YouTube's watched-progress bar style.
- **D-10:** Bar color uses the existing `--color-accent` (#e94560). Good contrast on cover art with the dark theme.
- **D-11:** A finished book (100%) shows a fully filled progress bar. No checkmark or special treatment — same visual language throughout.
- **D-12:** Books with no progress (never opened) show no bar at all — clean cover with no indicator.
- **D-13:** Tile badge data comes from a bulk server fetch on app load (`GET /api/progress`). Populates all tiles with server-side percentages. Works across devices and survives cache clears.

### API shape
- **D-14:** Two endpoints: `PUT /api/progress/:bookId` to push position for one book, `GET /api/progress` to fetch all progress for the authenticated user (for tile badges on app load).
- **D-15:** User identity from session cookie (same auth pattern as all existing `/api/*` routes). No separate auth mechanism.
- **D-16:** Server stores: timestamp (seconds), chapter index, and a pre-computed percentage (position / book duration_sec). Percentage is ready for tile badges without re-computing on read.

### Claude's Discretion
- Database migration approach for the new `progress` table (ALTER TABLE pattern vs CREATE TABLE IF NOT EXISTS, matching existing schema.ts patterns)
- Exact progress bar CSS (height, opacity, z-index within cover-container)
- Whether `GET /api/progress` returns an array or a map keyed by book ID
- How `_saveProgress()` is extended to also push to server (inline fetch or extracted helper)
- Error handling for the PUT endpoint (validation, response codes)
- Whether to add an index on the progress table

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Progress persistence (Phase 4)
- `public/index.html` lines 886-934 — `progressDB` IndexedDB wrapper: `open()`, `get(username, bookId)`, `save(username, bookId, data)`. Data shape: `{ timestamp, chapterIdx, speed, updatedAt }`
- `public/index.html` lines 1165-1190 — `_saveProgress()` method and `_startSaveInterval()` (15s). Saves to IndexedDB + localStorage last-book.

### Library grid tiles (Phase 3)
- `public/index.html` lines 238-265 — Book card template with `cover-container`, cover image, download overlay. Progress bar should be added inside `cover-container`.
- `public/style.css` lines 255-300 — `.library-grid` and `.book-card` styles. Progress bar CSS goes here.

### Database schema
- `src/db/schema.ts` — Current schema with books, chapters, users, sessions tables. New `progress` table migration goes here.

### API routes pattern
- `src/server.ts` — Route mounting pattern: `app.route("/api", progressRoutes)` after auth middleware.
- `src/routes/books.ts` — Example of authenticated API route returning JSON.

### Auth middleware
- `src/server.ts` lines 25-33 — Auth middleware applied before all `/api/*` routes. Progress routes inherit this automatically.

### Project constraints
- `CLAUDE.md` &sect;Technology Stack — bun:sqlite (not better-sqlite3), Alpine.js CDN, no build step.
- `.planning/STATE.md` — "No new npm dependencies for v1.1"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `progressDB` (IndexedDB wrapper) — already handles get/save per user+book. Sync logic extends `_saveProgress()` to also `fetch()` the PUT endpoint.
- `$store.auth.username` — available for user identification in API calls (session cookie handles actual auth).
- `cover-container` div on each book card — progress bar can be absolutely positioned inside this existing container.
- `--color-accent` CSS custom property (#e94560) — ready to use for progress bar fill.
- Download overlay pattern (`.download-overlay` in cover-container) — shows how to overlay elements on cover art.

### Established Patterns
- Alpine.js stores for cross-component state — tile progress data likely lives in `$store.library` (augmenting existing book data with progress percentages).
- Schema migrations use try/catch ALTER TABLE pattern (see `last_login_at` and `asin` migrations in schema.ts).
- API routes follow Hono pattern: separate route file, mounted via `app.route("/api", routes)` in server.ts.
- All API calls return 401 if not authenticated — progress routes get this for free.

### Integration Points
- `_saveProgress()` in player store — extend to also push to server via `fetch('PUT /api/progress/' + bookId)`.
- `$store.library.loadBooks()` or app init — add a `fetch('GET /api/progress')` call to populate tile percentages.
- Book card template — add progress bar element inside `cover-container` with `x-show` conditional on having progress data.
- Book open/resume flow — add server progress fetch before seeking to saved position.

</code_context>

<specifics>
## Specific Ideas

- YouTube-style thin progress bar at the bottom of cover art — proportionally filled, accent color
- Silent behavior throughout: no toasts on cross-device sync, no error indicators on failed syncs
- Trust the client fully — server stores whatever position is pushed, no server-side MAX guard
- Tile badges can regress if user re-listens — honest representation of current position

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-progress-sync-and-tiles*
*Context gathered: 2026-03-24*
