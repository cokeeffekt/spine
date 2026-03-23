# Architecture Patterns: v1.1 Integration

**Domain:** Self-hosted audiobook platform — adding admin UI, progress sync, MP3 scanning, progress tiles
**Researched:** 2026-03-23
**Based on:** Direct codebase analysis (src/server.ts, src/routes/*, src/scanner/*, src/db/schema.ts, public/index.html)

---

## Existing Architecture (v1.0 Baseline)

### Component Map

```
┌─────────────────────────────────────────────────────────┐
│  Bun.serve() → Hono app                                  │
│                                                          │
│  /health           (unauthenticated)                    │
│  /auth/*           (unauthenticated) → auth.ts          │
│  /api/*  ← authMiddleware → {                           │
│    /api/books                → books.ts                 │
│    /api/books/:id            → books.ts                 │
│    /api/books/:id/audio      → audio.ts                 │
│    /api/books/:id/cover      → cover.ts                 │
│    /api/users   (adminOnly)  → users.ts                 │
│  }                                                      │
│  /*                          → serveStatic(./public)    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  bun:sqlite — spine.db                                   │
│  tables: books, chapters, users, sessions               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Scanner                                                 │
│  walkLibrary → scanFile → probeFile (ffprobe spawn)      │
│             → normalizeMetadata → extractCoverArt        │
│             → applyFallbackMetadata → upsert DB          │
│  Watcher: setInterval(scanLibrary, 5min)                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Alpine.js stores (index.html inline)                    │
│  $store.auth    { loggedIn, username, role }             │
│  $store.app     { view, isOffline }                      │
│  $store.library { books[], query, selectedBook, ... }    │
│  $store.player  { book, playing, currentTime, ... }      │
│  $store.downloads { states, ... }                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  IndexedDB (browser)                                     │
│  progressDB  — "spine-progress" store                   │
│    key: username::bookId                                 │
│    value: { timestamp, chapterIdx, speed, updatedAt }   │
│  downloadDB  — "spine-downloads" store                   │
│    key: bookId                                           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Workbox Service Worker (sw.js)                          │
│  CacheFirst: /api/books/:id/audio, /api/books/:id/cover │
│  NetworkFirst: /api/*, /auth/*                          │
│  Precache: index.html, style.css, player-utils.js, ...  │
└─────────────────────────────────────────────────────────┘
```

### Current Data Flow: Progress

```
Player plays → _saveProgress() every 15s
  → progressDB.save(username, bookId, { timestamp, chapterIdx, speed, updatedAt })
  → IndexedDB "spine-progress" (local only, device-specific)

On book open → progressDB.get(username, bookId)
  → if found: seek audio to saved timestamp
```

Progress is entirely client-side in IndexedDB, keyed by `username::bookId`.

---

## v1.1 Feature Integration Analysis

### Feature 1: Admin UI (user creation / deletion / password reset)

**Current state:** The backend API already exists. `src/routes/users.ts` provides:
- `POST /api/users` — create user (adminOnly)
- `DELETE /api/users/:id` — delete user (adminOnly)
- `PATCH /api/users/:id/password` — reset password (adminOnly)

Missing: `GET /api/users` — list all users. Required for the admin UI to populate a user table. This is a one-line addition to users.ts.

**What needs to be built:**

Backend (new endpoint):
```
GET /api/users  (adminOnly) — returns [{ id, username, role, created_at }]
```

Frontend (new view):
- New `$store.app.view === 'admin'` branch in index.html
- Nav bar gets an "Admin" button visible only when `$store.auth.role === 'admin'`
- Admin view renders user list from `GET /api/users` + inline forms for create / delete / reset password
- All CRUD calls use existing `/api/users` endpoints

**Integration points:**
- `$store.auth.role` is already set on login and session restore — no changes needed
- `adminOnly` middleware on users.ts already enforces server-side
- Add `'admin'` to `$store.app.view` union and add nav link guard: `x-show="$store.auth.role === 'admin'"`

**No schema changes needed.** Users table already has `id, username, role, created_at`.

---

### Feature 2: Admin-Triggered Library Rescan

**Current state:** `scanLibrary()` is called at startup and on a 5-minute `setInterval` in `watcher.ts`. There is no HTTP endpoint to trigger it on demand.

**What needs to be built:**

Backend (new endpoint):
```
POST /api/admin/rescan  (adminOnly)
  → calls scanLibrary(db, LIBRARY_ROOT) asynchronously
  → returns { status: 'scanning' } immediately (do not await — scan can take seconds)
```

The `LIBRARY_ROOT` value is only available inside the `if (process.env['NODE_ENV'] !== 'test')` block in server.ts. It needs to be stored at module level so routes can access it.

Refactor in server.ts:
```typescript
// Promote to module scope so rescan route can access it
const libraryRoot = process.env['LIBRARY_ROOT'] ?? '/books'
```

Optional: `GET /api/admin/scan-status` returning `{ scanning: boolean, lastScanAt: string }` — requires a simple in-memory scan-state tracker (not persisted to DB).

**Integration points:**
- `scanLibrary` signature does not change — it already accepts `db` and `libraryRoot`
- Admin UI calls `POST /api/admin/rescan`, shows a spinner while scanning
- No database schema changes needed

**Build dependency:** Depends on Admin UI feature (needs the admin view to host the rescan button).

---

### Feature 3: Progress Sync to Backend

**Current state:** Progress lives in IndexedDB only. Schema is `{ timestamp, chapterIdx, speed, updatedAt }` keyed by `username::bookId`.

**What needs to be built:**

Database migration — new table:
```sql
CREATE TABLE IF NOT EXISTS progress (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position_sec REAL   NOT NULL,
  chapter_idx  INTEGER NOT NULL DEFAULT 0,
  speed        REAL   NOT NULL DEFAULT 1.0,
  updated_at   TEXT   NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, book_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_user_id ON progress(user_id);
```

Backend (new endpoints):
```
PUT /api/progress/:bookId
  body: { position_sec, chapter_idx, speed }
  → upserts progress row for authenticated user + book
  → returns { ok: true }

GET /api/progress/:bookId
  → returns { position_sec, chapter_idx, speed, updated_at } or null
```

Frontend changes — sync strategy (local-first with push/pull):

**Push:** After `progressDB.save()`, also POST to backend in background (fire-and-forget, never block playback):
```javascript
async _saveProgress() {
  const data = { timestamp: ..., chapterIdx: ..., speed: ..., updatedAt: Date.now() }
  await progressDB.save(username, bookId, data)
  // Sync to backend — non-blocking
  fetch('/api/progress/' + bookId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ position_sec: data.timestamp, chapter_idx: data.chapterIdx, speed: data.speed })
  }).catch(() => {}) // ignore failures — local IndexedDB is source of truth
}
```

**Pull on book open:** When fetching a book to resume, check backend progress after checking local IndexedDB. Use `updated_at` to resolve conflicts (take the more recent):
```javascript
// On book open (selectBook / play):
const localProgress = await progressDB.get(username, bookId)
const remoteRes = await fetch('/api/progress/' + bookId)
const remoteProgress = remoteRes.ok ? await remoteRes.json() : null

// Conflict resolution: take more recent by updatedAt
const useRemote = remoteProgress &&
  (!localProgress || remoteProgress.updated_at > new Date(localProgress.updatedAt).toISOString())
const resolved = useRemote ? remoteProgress : localProgress
```

**Conflict handling rule:** Whichever has the more recent `updated_at` wins. Write winner back to both stores.

**Integration points:**
- `_saveProgress()` in `$store.player` gets a non-blocking `fetch` appended
- `selectBook()` in `$store.library` gets a progress-fetch-and-compare step before seeking
- `initAudio()` / session restore block at top of index.html also needs the pull logic
- No changes to IndexedDB schema — it remains the source of truth offline

---

### Feature 4: Reading Progress Tiles (% indicator on library grid)

**Current state:** Book cards in the library grid show cover, title, author. No progress indicator.

**What needs to be built:**

This feature depends on having progress data accessible in the frontend at library-load time. Two approaches:

**Option A (no backend change): Read from IndexedDB at render time.**
Each book card calls `progressDB.get(username, book.id)` to get local progress. Compute `percent = position_sec / duration_sec * 100`. This is async — requires either eager loading into a store map or lazy/reactive per-card loading.

Recommended implementation: eager load on library load. In `$store.library.loadBooks()`, after fetching books, batch-read all progress entries from IndexedDB into a `$store.library.progressMap` (`{ [bookId]: percent }`). Each card template reads `$store.library.progressMap[book.id]` reactively.

```javascript
// In loadBooks():
this.books = await res.json()
// Eagerly load progress for all books
const progressMap = {}
for (const book of this.books) {
  const p = await progressDB.get(Alpine.store('auth').username, book.id)
  if (p && book.duration_sec) {
    progressMap[book.id] = Math.min(100, Math.round((p.timestamp / book.duration_sec) * 100))
  }
}
this.progressMap = progressMap
```

Card template addition:
```html
<!-- Progress bar at bottom of card-text -->
<div class="progress-bar-wrap" x-show="$store.library.progressMap[book.id] > 0">
  <div class="progress-bar-fill"
       :style="'width:' + ($store.library.progressMap[book.id] || 0) + '%'"></div>
</div>
```

**Option B (with backend): `GET /api/progress/all` returns a map of all progress for current user.**
Simpler frontend (one fetch vs N IndexedDB reads), works across devices, requires the progress sync feature to be complete first. This is the preferred approach when progress sync is implemented.

**Recommendation:** Build Option A first (works immediately with local IndexedDB), then upgrade to Option B once progress sync is live. Both coexist — the progressMap can be sourced from either.

**Integration points:**
- `$store.library` gets a new `progressMap: {}` field
- `loadBooks()` gets an eager batch-load of progress after books are fetched
- Book card template gets a visual indicator (CSS progress bar or % text)
- When `_saveProgress()` fires, also update `$store.library.progressMap[bookId]` in memory for live updates

---

### Feature 5: MP3 Folder Support

**Current state:** `walkLibrary()` in `src/scanner/walk.ts` returns only `.m4b` files. `scanFile()` assumes a single-file book. `probeFile()` uses ffprobe and works with `.mp3` as well, but chapters are not embedded in MP3 files — they must be inferred from track order.

**Design constraint (from PROJECT.md):** "MP3 audiobook collections have inconsistent folder structures — scanner must handle multiple naming patterns."

**What needs to be built:**

**Scanner changes:**

`walkLibrary()` needs to be extended to also discover MP3 folders. An "MP3 folder" is a directory containing one or more `.mp3` files with no `.m4b` sibling in the same folder.

New function: `walkLibraryForMp3Folders(root: string): string[][]`
- Returns an array of file-path arrays, where each inner array is the ordered list of `.mp3` files for one book
- Sort order within a folder: sort by filename (track number prefix if present, otherwise alphabetical)
- Keyed by the folder path as the "book identifier"

Alternatively, unify under a new `walkAll()` that returns a discriminated union:
```typescript
type BookSource =
  | { type: 'm4b'; path: string }
  | { type: 'mp3folder'; folderPath: string; files: string[] }
```

**`scanMp3Folder(db, folderPath, files)`** — new parallel to `scanFile()`:
- Uses `ffprobe` on the first `.mp3` to extract title/author/narrator tags (fallback to folder name)
- Uses `ffprobe` on all files to get individual durations
- Derives chapters from individual files: each file = one chapter
  - chapter title = filename (strip leading `01 - `, `01_`, etc.) or embedded title tag
  - chapter start_sec = cumulative end_sec of previous chapter
- `file_path` for the book row = folder path (not an individual file) — needs a new column or convention
- `file_mtime` = max mtime of all `.mp3` files in folder (for incremental scan)
- `codec` = mp3 (from ffprobe audio stream)

**Database change:**
The `books` table `file_path` is currently a UNIQUE path to a single `.m4b` file. For MP3 folders, it becomes the folder path. This works with the existing UNIQUE constraint — no schema change needed.

New column needed for audio serving:
```sql
ALTER TABLE books ADD COLUMN source_type TEXT NOT NULL DEFAULT 'm4b';
-- values: 'm4b' | 'mp3folder'
```

Or store as part of `codec` (since mp3 already differentiates). However, the audio route needs to know how to serve the audio — either stream the single `.m4b`, or for MP3 folders, either: (a) create a playlist/concatenated stream, or (b) store individual file paths in a new `tracks` table.

**Audio serving approach for MP3 folders:**

Option A (simplest): Store a concatenation manifest in a new `tracks` table. The audio route serves files individually based on chapter/position, stitching via HTTP range logic. This is complex.

Option B (recommended): On scan, produce a single concatenated `.m4b`-like container for the MP3 folder using ffmpeg. Store the synthetic file in `/data/generated/`. Serve it like a normal `.m4b`. This is a one-time cost at scan time and keeps the audio route simple.

However, transcoding changes the "no transcoding" constraint. The project explicitly states "serve .m4b directly" and "no transcoding."

Option C (pragmatic): Add a `tracks` table with individual file paths + time offsets. The audio route serves individual MP3 files and the frontend uses the chapters (which map to tracks) to manage playback position across files. The `<audio>` element src changes when crossing a chapter/track boundary.

**Recommended approach:** Option C with tracks table, but as a distinct sub-feature. The tracks table enables future per-chapter download. The frontend player would need to handle track-boundary seeking.

**New `tracks` table:**
```sql
CREATE TABLE IF NOT EXISTS tracks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id      INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  track_idx    INTEGER NOT NULL,
  file_path    TEXT    NOT NULL,
  start_sec    REAL    NOT NULL,   -- cumulative offset (absolute book time)
  duration_sec REAL    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracks_book_id ON tracks(book_id);
```

**New audio route behavior for MP3 folders:**
```
GET /api/books/:id/audio?track=0  (default track=0)
  → for m4b: serve books.file_path directly (existing behavior)
  → for mp3folder: serve tracks[track_idx].file_path with range support
```

Or simpler: `GET /api/books/:id/audio/:trackIdx` — explicit track path.

**Frontend player changes for MP3 folders:**
- Player must detect `book.source_type === 'mp3folder'`
- Chapter list maps to tracks (chapter_idx === track_idx)
- When jumping to a chapter: set `audio.src = '/api/books/' + id + '/audio/' + chapterIdx`, then seek to 0
- `currentTime` is chapter-relative for mp3folder books

**Fallback metadata for MP3 folders:** `applyFallbackMetadata` already reads `metadata.json` from the folder — this works as-is for MP3 folders since `folderPath` is the containing directory.

**Integration points:**
- `walkLibrary` in `walk.ts` extended or a new `walkMp3Folders()` added
- `scanLibrary` calls both walkers, routes to `scanFile` or `scanMp3Folder`
- New `src/scanner/mp3folder.ts` — `scanMp3Folder()` and `walkMp3Folders()`
- New `src/routes/audio.ts` gains track-serving branch
- Frontend player gains mp3folder awareness (src-swap on chapter jump)
- `NormalizedMetadata` gets `source_type` field
- `types.ts` gets `Track` interface

---

## Component Boundary Summary: New vs Modified

### New Components

| Component | Type | Purpose |
|-----------|------|---------|
| `src/routes/admin.ts` | New route file | `POST /api/admin/rescan`, optional `GET /api/admin/scan-status` |
| `src/routes/progress.ts` | New route file | `PUT /api/progress/:bookId`, `GET /api/progress/:bookId`, `GET /api/progress/all` |
| `src/scanner/mp3folder.ts` | New scanner module | `walkMp3Folders()`, `scanMp3Folder()`, MP3-specific probe/chapter normalization |
| `$store.library.progressMap` | New store field | In-memory map of bookId → progress percent for tile display |
| Admin view in index.html | New HTML section | User management UI, rescan button |

### Modified Components

| Component | Change | Why |
|-----------|--------|-----|
| `src/db/schema.ts` | Add `progress` table, `tracks` table, `source_type` col on `books` | Progress sync and MP3 folder support |
| `src/scanner/walk.ts` | Add MP3 folder discovery or extract to shared module | MP3 folder support |
| `src/scanner/index.ts` | Route to `scanMp3Folder` for MP3 folders | MP3 folder support |
| `src/routes/users.ts` | Add `GET /api/users` list endpoint | Admin UI needs user list |
| `src/routes/audio.ts` | Add track-index serving branch for mp3folder books | MP3 folder audio serving |
| `src/server.ts` | Expose `libraryRoot` at module scope, mount admin + progress routes | Rescan endpoint + new routes |
| `public/index.html` | `$store.library.progressMap`, admin view, progress sync in player, nav link | All UI features |
| `public/sw.js` | Update precache revision, add route for `/api/progress/*` | sw cache invalidation |

---

## Data Flow: Progress Sync (v1.1 end state)

```
User plays book:
  → player._saveProgress() every 15s
    → IndexedDB.save(username, bookId, { timestamp, chapterIdx, speed, updatedAt })
    → fetch PUT /api/progress/:bookId (fire-and-forget, no await)
      → server upserts progress table

User opens book (online):
  → fetch GET /api/progress/:bookId → remoteProgress
  → IndexedDB.get(username, bookId) → localProgress
  → pick more recent by updated_at
  → write winner to both stores
  → seek audio to resolved position

Library loads:
  → $store.library.loadBooks() fetches /api/books
  → fetch GET /api/progress/all (or batch IndexedDB reads)
  → populate $store.library.progressMap { bookId: percent }
  → book tiles render progress bars
```

---

## Data Flow: Admin-Triggered Rescan

```
Admin clicks "Rescan Library":
  → fetch POST /api/admin/rescan
    → server: scanLibrary(db, libraryRoot) started (not awaited)
    → returns { status: 'scanning' }
  → UI: show "Scanning..." state
  → optional: poll GET /api/admin/scan-status until done
  → on completion: $store.library.loadBooks() to refresh UI
```

---

## Build Order (Dependencies)

1. **Admin UI + GET /api/users** — no dependencies, low risk. Backend API for user management already exists; this adds the list endpoint and the view.

2. **Admin-triggered rescan** — depends on #1 (rescan button lives in admin view). Requires promoting `libraryRoot` to module scope in server.ts. Otherwise isolated.

3. **Progress sync backend** — independent of #1 and #2. Add the `progress` table migration, the two endpoints, and the `GET /api/progress/all` endpoint. Testable standalone.

4. **Progress tiles** — depends on #3 for multi-device correctness. Can ship with IndexedDB-only reads (Option A) before #3 is done, then upgrade to `GET /api/progress/all` (Option B) when #3 ships.

5. **MP3 folder support** — largest scope. Independent of #1–#4 at the backend. Requires scanner changes, schema migration (tracks table), and audio route changes. Frontend changes are isolated to the player's chapter-jump behavior. Build last because it touches the most files and the audio route.

```
#1 Admin UI + users list
  → #2 Rescan trigger (adds button to admin view)
#3 Progress sync endpoints
  → #4 Progress tiles (upgrades from local-only to synced)
#5 MP3 folder support (independent chain)
```

---

## Anti-Patterns to Avoid

### Blocking audio playback on progress sync

**What goes wrong:** `await fetch('/api/progress/:bookId')` inside `_saveProgress()` blocks the 15s save loop.
**Prevention:** The `fetch` call to the backend must be fire-and-forget. IndexedDB remains the write-through store. Network failure must never affect playback.

### Awaiting rescan in the HTTP handler

**What goes wrong:** `await scanLibrary(...)` inside the POST handler times out for large libraries.
**Prevention:** Start scan with `scanLibrary(db, libraryRoot).catch(...)` (no await), respond immediately with `{ status: 'scanning' }`.

### Treating progress table as primary storage

**What goes wrong:** If the server is unreachable, progress is lost. Offline users can't resume.
**Prevention:** IndexedDB is always written first. Server is secondary (sync target). Pull from server only when server timestamp is newer.

### Sharing file_path for MP3 tracks across the audio route

**What goes wrong:** Audio route assumes `file_path` is a streamable file. For MP3 folders, `file_path` is a directory.
**Prevention:** `source_type` column in `books` controls routing. Audio route checks `source_type` first and falls through to track-table lookup for `mp3folder`.

### Progress percent calculation using server-side duration_sec

**What goes wrong:** `duration_sec` is null for malformed files, causing divide-by-zero or NaN in the UI.
**Prevention:** Guard: `if (book.duration_sec && book.duration_sec > 0) { percent = ... }` — treat null/zero as 0%.

### Re-scanning on rescan triggering duplicate watcher scans

**What goes wrong:** Admin triggers rescan while the 5-minute interval is also mid-scan. Two concurrent `scanLibrary` calls race on DB writes.
**Prevention:** Add a boolean `_scanInProgress` flag (module-level in scanner or server.ts). If true, `POST /api/admin/rescan` returns `{ status: 'already-scanning' }` without starting a second scan.

---

## Schema Migration Strategy

v1.1 adds columns/tables to an existing live database. bun:sqlite's `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN` are the safe approach.

In `src/db/schema.ts`, append:

```sql
-- Progress sync
CREATE TABLE IF NOT EXISTS progress (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position_sec  REAL    NOT NULL DEFAULT 0,
  chapter_idx   INTEGER NOT NULL DEFAULT 0,
  speed         REAL    NOT NULL DEFAULT 1.0,
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, book_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_user_book ON progress(user_id, book_id);

-- MP3 folder tracks
CREATE TABLE IF NOT EXISTS tracks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  track_idx     INTEGER NOT NULL,
  file_path     TEXT    NOT NULL,
  start_sec     REAL    NOT NULL,
  duration_sec  REAL    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracks_book_id ON tracks(book_id);
```

For the `source_type` column on `books`:
```sql
-- bun:sqlite: ALTER TABLE ADD COLUMN is safe (adds with DEFAULT, no rewrite)
ALTER TABLE books ADD COLUMN source_type TEXT NOT NULL DEFAULT 'm4b';
```

Use `db.exec()` wrapped in a try/catch for the ALTER — it will throw "duplicate column name" if already applied, which is harmless to swallow:
```typescript
try {
  db.exec("ALTER TABLE books ADD COLUMN source_type TEXT NOT NULL DEFAULT 'm4b'")
} catch {
  // Column already exists — idempotent
}
```

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Existing architecture | HIGH | Direct codebase analysis, no inference |
| Admin UI integration | HIGH | Backend endpoints exist; adding list + view |
| Rescan endpoint | HIGH | scanLibrary is already injectable; trivial to expose |
| Progress sync | HIGH | Standard REST CRUD + local-first conflict resolution pattern |
| Progress tiles | HIGH | IndexedDB reads already happen; adding a store map |
| MP3 folder support | MEDIUM | ffprobe works on MP3 but track-boundary seeking in HTML audio is less well-trodden; player src-swap needs browser testing |
| Schema migrations | HIGH | bun:sqlite ADD COLUMN with DEFAULT is safe and idempotent with try/catch |

## Sources

- Direct source analysis: `/home/coke/gits/spine/src/` and `/home/coke/gits/spine/public/`
- No external sources required — all integration points derived from existing code
