# Technology Stack — v1.1 Additions

**Project:** Spine (self-hosted audiobook platform)
**Milestone:** v1.1 — Admin Tools, Progress Sync, MP3 Folder Support, Progress Tiles
**Researched:** 2026-03-23
**Scope:** NEW capabilities only. Existing v1.0 stack (Bun, Hono, bun:sqlite, Alpine.js, Workbox, ffprobe) is validated and not re-evaluated.

---

## Executive Finding

**No new npm dependencies are needed for three of the four features.** Admin UI, library rescan, and progress sync are all pure extensions of the existing Hono + bun:sqlite + Alpine.js stack. MP3 folder support is the only area where a new library is worth evaluating, and even there ffprobe is the preferred tool — it already exists in the Docker image and already reads ID3 tags. The recommendation is to extend ffprobe usage to MP3 files rather than add `music-metadata`.

---

## Feature-by-Feature Analysis

### 1. Admin UI (user create/delete/reset password + library rescan trigger)

**Verdict: No new libraries needed.**

The user management API routes (`POST /api/users`, `DELETE /api/users/:id`, `PATCH /api/users/:id/password`) already exist in `src/routes/users.ts` and are tested. The admin UI is a new HTML page served from `public/admin.html` using Alpine.js (already loaded via CDN) for reactivity and `fetch()` to call existing endpoints.

Library rescan trigger is a new `POST /api/admin/rescan` endpoint that calls the existing `scanLibrary()` function. No new backend infrastructure is required.

**Integration point:** Mount admin routes under `app.route("/api", adminRoutes)` in `src/server.ts`, guarded by `adminOnly` middleware (already implemented in `src/middleware/auth.ts`).

---

### 2. Admin-Triggered Library Rescan with Live Progress

**Verdict: Use Hono's built-in `streamSSE()`. No new library needed.**

Hono 4.x includes `streamSSE()` in `hono/streaming` (confirmed HIGH confidence via official docs at `https://hono.dev/docs/helpers/streaming`). It streams Server-Sent Events over a single HTTP connection using `stream.writeSSE({ data, event, id })`. The rescan endpoint opens an SSE stream, runs `scanLibrary()` with a progress callback injected, and writes events as files are processed.

```typescript
// Conceptual shape — no new imports beyond hono/streaming
import { streamSSE } from 'hono/streaming'

app.get('/api/admin/rescan/stream', adminOnly, (c) => {
  return streamSSE(c, async (stream) => {
    await scanLibrary(db, libraryRoot, defaultProbeFn, async (event) => {
      await stream.writeSSE({ data: JSON.stringify(event), event: 'progress' })
    })
    await stream.writeSSE({ data: '{}', event: 'complete' })
  })
})
```

The frontend uses `EventSource` (supported in all target browsers and iOS Safari 9+) to receive events. Alpine.js handles state updates reactively.

**Why not WebSockets?** One-way communication (server to client only) — SSE is the correct primitive. No additional library, no binary framing overhead.

**Why not polling?** For a scan that may process hundreds of books, real-time progress is significantly better UX than polling intervals. SSE over Hono costs zero new dependencies.

---

### 3. Progress Sync to Backend

**Verdict: New `progress` table in bun:sqlite + two new Hono endpoints. No new library needed.**

The existing schema in `src/db/schema.ts` needs one new table:

```sql
CREATE TABLE IF NOT EXISTS progress (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position_sec REAL   NOT NULL DEFAULT 0,
  chapter_idx  INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT   NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, book_id)
);
```

**Conflict resolution strategy:** "Last write wins, server is authoritative." The client pushes `{ book_id, position_sec, chapter_idx, updated_at }`. The server does `INSERT OR REPLACE` (SQLite `ON CONFLICT DO UPDATE`) comparing `updated_at` timestamps — client timestamp wins if newer. On page load, the client fetches server state and merges with IndexedDB using the same timestamp comparison. This mirrors the v1.0 local-first philosophy: IndexedDB remains the source of truth offline; server state is reconciled on reconnect.

bun:sqlite supports `INSERT ... ON CONFLICT(user_id, book_id) DO UPDATE SET` — this is standard SQLite 3.24+ syntax and confirmed to work through bun:sqlite's SQL execution layer even though not explicitly listed in the docs (HIGH confidence: project already uses this pattern in `src/scanner/index.ts` line 97-126).

**New endpoints:**
- `PUT /api/progress/:bookId` — upsert progress for authenticated user
- `GET /api/progress` — return all progress records for authenticated user (for bulk sync on login)
- `GET /api/progress/:bookId` — return single book progress (for resume on book open)

**Frontend integration:** On resume, fetch server progress and compare `updated_at` to IndexedDB record — use whichever is newer. On position update (same debounce as IndexedDB write), fire-and-forget `PUT /api/progress/:bookId`. Alpine.js `$store` holds the merged progress map; library grid tiles read `$store.progress[bookId]?.pct` for the progress indicator.

---

### 4. MP3 Folder Support

**Verdict: Extend ffprobe + existing fallback infrastructure. Do NOT add music-metadata.**

#### Why not `music-metadata`?

`music-metadata@11.12.3` (published 2026-03-12) is pure ESM and works on Node.js 18+. However:

- Bun compatibility issue #16402 is open as of March 2026 — the `parseWebStream`/`parseBlob` API has a confirmed bug with `ReadableStreamBYOBReader`. A fix was committed 2026-02-20 and is in Bun 1.2.x, but the issue is still marked open.
- `parseFile` uses Node.js `fs.createReadStream` internally, which has a separate Bun compatibility issue (#9907).
- Adding any npm dependency introduces risk in a project that currently has exactly one runtime dependency (`hono`). The project's architecture deliberately avoids npm dependencies for server-side processing.
- ffprobe is already in the Docker image, already called via `child_process.spawn`, and already reads ID3 tags from MP3 files via `format.tags` (same JSON structure as .m4b).

#### How ffprobe handles MP3s

ffprobe's `-show_format -show_streams -show_chapters -print_format json` command works identically on MP3 files. ID3 tags appear in `format.tags` under the same keys already handled by `normalizeTag()` in `src/scanner/probe.ts`: `title`, `artist`, `album_artist`, `album`, `track`, `date`, `comment`, `genre`, `composer`, etc.

MP3 files lack the embedded chapter markers that .m4b files have, so `output.chapters` will be empty — the existing `normalizeChapters()` already handles this: it returns a single implicit chapter spanning the full duration (lines 37-44 in `probe.ts`).

#### The real problem: folder scanning, not metadata parsing

For MP3 audiobooks, a "book" is a folder of files, not a single file. The scanner architecture must change:

- **Current:** one file = one book (`walkLibrary()` returns flat `.m4b` paths)
- **Required:** one folder = one book; multiple `.mp3` files = ordered tracks within that book

**New abstraction: `BookCandidate`**

```typescript
type BookCandidate =
  | { type: 'm4b'; filePath: string }
  | { type: 'mp3-folder'; folderPath: string; trackPaths: string[] }
```

`walkLibrary()` is refactored to produce `BookCandidate[]`. A folder qualifies as an MP3 book if it contains one or more `.mp3` files and no `.m4b` files (a folder with a `.m4b` is still a `.m4b` book).

#### Track ordering for MP3 folders

MP3 audiobook folder naming is inconsistent. Research into audiobookshelf's scanner (the reference implementation) and real-world collections confirms these patterns exist:

| Pattern | Example filenames |
|---------|------------------|
| ID3 track tag | `track` field in ID3 = `1`, `2`, `3` |
| Numeric prefix | `01 - Chapter 1.mp3`, `002_intro.mp3` |
| Natural filename sort | `Part 1.mp3`, `Part 2.mp3` |
| CD/Disc numbering | `disc1/01.mp3`, `disc2/01.mp3` |

**Recommended ordering algorithm (no library needed):**
1. Call ffprobe on each file to get ID3 `track` tag (already free via `probeFile()`).
2. If all files have numeric `track` tags → sort by parsed integer.
3. Otherwise → natural sort by filename (sort strings with embedded numbers parsed as integers, not lexicographically). This is ~10 lines of TypeScript; no library required.

Natural sort implementation:

```typescript
export function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
```

`String.prototype.localeCompare` with `{ numeric: true }` is the standard approach, available in all V8/JavaScriptCore environments including Bun. No library needed.

#### Book-level metadata for MP3 folders

Metadata is derived from the **first track** via ffprobe (same as audiobookshelf's approach). Fields: `title` from `album` tag, `author` from `artist`/`album_artist`, `year` from `date`, etc. The existing `normalizeTag()` function handles this unchanged.

Fallback chain (same priority order as .m4b, already implemented in `fallback.ts`):
1. ID3 tags from first track (ffprobe)
2. `metadata.json` in the folder (already implemented in `applyFallbackMetadata()`)
3. Folder name as title (already implemented)

**Additional fallback for deeply nested structures:** For a folder like `Author Name/Book Title/`, the parent directory name can be used as the author fallback if the `author` field is still null after step 2. This is a single `path.basename(path.dirname(folderPath))` call — no library needed.

#### Database: no schema changes needed

MP3 folders are stored as books with `file_path = folderPath` (the directory path). Tracks are stored as chapters: `chapter_idx = trackIndex`, `start_sec = sum of previous track durations`, `title = track title or filename`. The existing `books` and `chapters` schema accommodates this without modification.

The `file_mtime` staleness check for MP3 folders uses `Math.max(...trackPaths.map(p => fs.statSync(p).mtimeMs))` — the newest file mtime in the folder.

---

### 5. Reading Progress Tiles (Frontend)

**Verdict: Alpine.js store + CSS. No new library needed.**

The library grid already renders book tiles with Alpine.js. Progress percentage is `(position_sec / duration_sec) * 100`, clamped to `[0, 100]`. Display as a CSS progress bar overlaid on the tile cover image.

The Alpine.js `$store.progress` map is populated on login by calling `GET /api/progress` (returns all records for the authenticated user). Each tile reads `$store.progress[book.id]` reactively.

No new libraries, no build step changes.

---

## Summary: New Dependencies

| Dependency | Add? | Reason |
|------------|------|--------|
| `music-metadata` | NO | Bun compatibility issues open; ffprobe already handles ID3 tags from MP3 files; no new library needed |
| Any WebSocket library | NO | Hono `streamSSE()` covers the rescan progress use case |
| Any schema migration library | NO | bun:sqlite ALTER TABLE is sufficient for adding the `progress` table |
| `idb` or any IndexedDB wrapper | NO | Project already uses raw IndexedDB; v1.0 decision validated |
| Any chart/visualization library | NO | CSS progress bar is sufficient for tile overlays |

**Net new npm dependencies: 0**

---

## Schema Addition Required

One migration to `src/db/schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id      INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position_sec REAL    NOT NULL DEFAULT 0,
  chapter_idx  INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_user_id ON progress(user_id);
```

No migration framework needed — `CREATE TABLE IF NOT EXISTS` is idempotent and safe to add to the existing `initializeDatabase()` function.

---

## New API Surface

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/admin/users` | adminOnly | List all users (needed for admin UI display) |
| `POST /api/admin/rescan` | adminOnly | Trigger synchronous rescan, return count summary |
| `GET /api/admin/rescan/stream` | adminOnly | SSE stream of rescan progress events |
| `PUT /api/progress/:bookId` | authenticated | Upsert progress for current user |
| `GET /api/progress` | authenticated | Fetch all progress records for current user |
| `GET /api/progress/:bookId` | authenticated | Fetch single book progress |

`GET /api/admin/users` is the one genuinely missing route — the existing `users.ts` has POST, DELETE, PATCH but no GET for listing.

---

## Integration Points with Existing Code

| Existing module | Change required |
|-----------------|----------------|
| `src/scanner/walk.ts` | Refactor `walkLibrary()` to return `BookCandidate[]` instead of `string[]`; add MP3 folder detection |
| `src/scanner/index.ts` | Add `scanMp3Folder()` alongside existing `scanFile()`; update `scanLibrary()` to dispatch by candidate type |
| `src/scanner/fallback.ts` | Add author-from-parent-folder fallback for MP3 folders |
| `src/db/schema.ts` | Add `progress` table |
| `src/types.ts` | Add `Progress` interface, `BookCandidate` type |
| `src/server.ts` | Mount new admin and progress routes |
| `public/admin.html` | New file — Alpine.js admin page |
| `public/sw.js` | No changes needed for progress sync |

---

## What NOT to Add

| Avoid | Why |
|-------|-----|
| `music-metadata` npm package | Open Bun compatibility issues; ffprobe already installed and handles MP3 ID3 tags identically |
| `better-sqlite3` | Confirmed incompatible with Bun's V8 C++ API — already rejected in v1.0 |
| Any ORM (Prisma, Drizzle, Kysely) | Overkill; bun:sqlite's synchronous prepared statements are sufficient; adds build complexity |
| WebSockets | SSE is correct for one-way server-to-client rescan progress |
| Any state management library (Zustand, etc.) | Alpine.js `$store` is sufficient; no build step |
| Schema migration framework (db-migrate, etc.) | `CREATE TABLE IF NOT EXISTS` is idempotent; single-container deployment has no concurrent migration risk |
| `node-id3` or similar | ffprobe handles ID3 reading; redundant |

---

## Confidence Assessment

| Area | Confidence | Source |
|------|------------|--------|
| ffprobe reads MP3 ID3 tags (same JSON format) | HIGH | Confirmed via ffprobe docs, existing codebase already handles the output format |
| Hono `streamSSE()` built into 4.x | HIGH | Official Hono docs `hono.dev/docs/helpers/streaming` |
| bun:sqlite supports `ON CONFLICT DO UPDATE` | HIGH | Already used in production in `src/scanner/index.ts`; SQLite 3.24+ feature |
| `music-metadata` Bun parseFile compatibility | LOW | Bun issue #16402 open; workaround unclear; avoid |
| `String.localeCompare` numeric sort in Bun | HIGH | Standard ECMAScript; Bun's JavaScriptCore implements the full Intl API |
| MP3 folder naming patterns | MEDIUM | Based on audiobookshelf scanner docs + real-world patterns; edge cases will surface in UAT |
| CSS progress bar sufficient for tiles | HIGH | No animation or complex interaction required |

---

## Sources

- `https://hono.dev/docs/helpers/streaming` — Hono streamSSE API, confirmed built-in to Hono 4.x (HIGH confidence)
- `https://github.com/oven-sh/bun/issues/16402` — music-metadata parseWebStream/parseBlob Bun compatibility issue, open as of 2026-03-23 (HIGH confidence)
- `https://libraries.io/npm/music-metadata` — music-metadata 11.12.3 published 2026-03-12 (HIGH confidence)
- `https://www.audiobookshelf.org/guides/book-scanner/` — MP3 folder structure and metadata priority patterns (MEDIUM confidence)
- `https://bun.com/docs/runtime/sqlite` — bun:sqlite feature set (HIGH confidence)
- `https://stegard.net/2022/02/extract-media-file-tags-with-ffprobe/` — ffprobe format_tags JSON output for audio files (HIGH confidence)
- Existing codebase (`src/scanner/probe.ts`, `src/scanner/index.ts`) — confirmed ON CONFLICT DO UPDATE already in use (HIGH confidence)
