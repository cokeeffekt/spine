# Phase 9: Progress Sync and Tiles - Research

**Researched:** 2026-03-24
**Domain:** SQLite progress persistence, REST API sync, offline-first IndexedDB queue, Alpine.js tile badges
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sync timing & triggers**
- D-01: Progress pushes to the server on every 15s auto-save tick (piggybacks on existing `_saveProgress()` interval) AND on every pause event. Same triggers as IndexedDB writes — no separate sync timer.
- D-02: Offline saves queue locally in IndexedDB as usual. On `online` event, flush the latest position for each book that changed while offline. Only the most recent position per book needs to sync — no intermediate save queue.
- D-03: Sync failures are silent. Failed pushes retry on the next 15s tick or reconnect. No user-visible error indicator — local progress in IndexedDB is always safe.
- D-04: On book open, fetch server progress for that book (`GET /api/progress/:bookId` or included in bulk). Compare with local IndexedDB. Use furthest-position-wins (MAX) to determine resume point.

**Conflict resolution UX**
- D-05: When server position is ahead of local, playback silently starts at the furthest position. No toast, no notification.
- D-06: Server trusts the client — push always stores whatever position the client sends. No server-side MAX guard.
- D-07: Furthest-position-wins applies only on the *pull* side (when opening a book, compare local vs server and use MAX). The push side is unconditional.
- D-08: Tile badge percentage can go backwards if user re-listens from an earlier point. Badge shows current actual position, not a high-water mark.

**Progress badge on tiles**
- D-09: Bottom progress bar along the bottom edge of the cover image on each book card. Thin horizontal bar filled proportionally — similar to YouTube's watched-progress bar style.
- D-10: Bar color uses the existing `--color-accent` (#e94560).
- D-11: A finished book (100%) shows a fully filled progress bar. No checkmark.
- D-12: Books with no progress (never opened) show no bar at all.
- D-13: Tile badge data comes from a bulk server fetch on app load (`GET /api/progress`). Populates all tiles with server-side percentages.

**API shape**
- D-14: Two endpoints: `PUT /api/progress/:bookId` to push position for one book, `GET /api/progress` to fetch all progress for the authenticated user.
- D-15: User identity from session cookie (same auth pattern as all existing `/api/*` routes).
- D-16: Server stores: timestamp (seconds), chapter index, and a pre-computed percentage (position / book duration_sec). Percentage is ready for tile badges without re-computing on read.

### Claude's Discretion

- Database migration approach for the new `progress` table (ALTER TABLE pattern vs CREATE TABLE IF NOT EXISTS, matching existing schema.ts patterns)
- Exact progress bar CSS (height, opacity, z-index within cover-container)
- Whether `GET /api/progress` returns an array or a map keyed by book ID
- How `_saveProgress()` is extended to also push to server (inline fetch or extracted helper)
- Error handling for the PUT endpoint (validation, response codes)
- Whether to add an index on the progress table

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROG-05 | User's playback progress is synced to the backend when online | PUT /api/progress/:bookId endpoint; extend _saveProgress() to fetch; online event handler flush |
| PROG-06 | On book open, app pulls server progress and uses furthest position (no data loss) | GET /api/progress response map; MAX(local.timestamp, server.timestamp) comparison in play() |
| PROG-07 | Progress sync works seamlessly with existing offline-first IndexedDB storage | Offline queue pattern: track dirty book IDs in a Set; flush on `online` event |
| PROG-08 | Library grid tiles show reading progress percentage on book covers | GET /api/progress bulk fetch on loadBooks(); progress bar element in cover-container template; CSS bar |
</phase_requirements>

---

## Summary

Phase 9 adds cross-device progress sync by introducing a `progress` table in SQLite, two REST endpoints, client-side server push logic piggybacking on the existing 15s/pause save cycle, and a visual progress bar on each book tile.

The backend work is a thin new route file following the exact pattern of `src/routes/books.ts`. The progress table migration follows the established `try/catch ALTER TABLE` idiom already used twice in `schema.ts` — but since this is a brand-new table (not a column addition), `CREATE TABLE IF NOT EXISTS` is the right pattern. The authentication story is already solved: `app.use('/api/*', authMiddleware)` in `server.ts` covers the new progress routes at no cost.

The frontend work has two independent parts. First, `_saveProgress()` in the player store gains a `fetch()` call after every IndexedDB write. Second, `$store.library.loadBooks()` gains a parallel `GET /api/progress` call on app init to populate badge percentages across all tiles. The progress bar is a single `<div>` absolutely positioned inside the existing `.cover-container`, shown/hidden with `x-show` and styled with an inline `width` binding. The `online` event listener at line 936 of `index.html` already updates `$store.app.isOffline`; the offline flush logic hooks into the same `window.addEventListener('online', ...)` block.

**Primary recommendation:** Implement the backend route file first (it is self-contained and testable in isolation), then wire the two frontend integration points separately so each can be verified independently.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bun:sqlite` (built-in) | Bun 1.2.x | Progress table storage | Project decision — better-sqlite3 incompatible with Bun. Already used for all tables in schema.ts. |
| Hono | 4.12.x | HTTP route handler for progress endpoints | Already the project framework. New route file mounts via `app.route("/api", progressRoutes)`. |
| Alpine.js | 3.15.x CDN | Reactive tile badges and online/offline flush | Already CDN-loaded. `$store.library` and `$store.player` already wired. No new scripts. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| IndexedDB (browser built-in) | — | Offline queue of dirty book IDs | Already used via `progressDB` wrapper at line 888. Extend to track which books changed offline. |
| `navigator.onLine` / `online` event | — | Detect reconnect for offline flush | Already handled at line 936 of index.html. Hook into the same listener. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `CREATE TABLE IF NOT EXISTS` for progress | `ALTER TABLE` additions only | New table cannot be added with ALTER TABLE. IF NOT EXISTS is correct for a wholly new table. |
| Map keyed by book ID for GET /api/progress | Array of `{book_id, percentage}` | Map (object) means O(1) lookup by book ID in Alpine template; array requires `.find()`. Map is better for tile rendering. |
| Inline `fetch()` in `_saveProgress()` | Extracted `_pushProgress()` helper | Either works. Inline is simpler given the fire-and-forget nature; extracted helper aids testability. |

**Installation:** No new npm dependencies. Project constraint: "No new npm dependencies for v1.1."

---

## Architecture Patterns

### Recommended Project Structure

New file:
```
src/
└── routes/
    └── progress.ts   # PUT /api/progress/:bookId, GET /api/progress
```

Schema change in:
```
src/
└── db/
    └── schema.ts     # Add progress table via CREATE TABLE IF NOT EXISTS
```

Frontend changes in:
```
public/
├── index.html        # _saveProgress() push, loadBooks() bulk fetch, play() MAX merge, tile template, online flush
└── style.css         # .progress-bar CSS inside .cover-container
```

### Pattern 1: Progress Route File (matches books.ts exactly)

**What:** New Hono route file with two handlers, imported into server.ts.
**When to use:** Always — all API routes follow this pattern.

```typescript
// src/routes/progress.ts
import { Hono } from 'hono'
import { getDatabase } from '../db/index.js'
import type { AuthVariables } from '../middleware/auth.js'

const progress = new Hono<{ Variables: AuthVariables }>()

// PUT /api/progress/:bookId — push current position (D-14, D-16)
progress.put('/progress/:bookId', (c) => {
  const bookId = Number(c.req.param('bookId'))
  const userId = c.get('userId')
  const db = getDatabase()
  // body: { timestamp, chapterIdx, percentage }
  // ...upsert into progress table
})

// GET /api/progress — bulk fetch all progress for tile badges (D-13, D-14)
progress.get('/progress', (c) => {
  const userId = c.get('userId')
  const db = getDatabase()
  // ...returns map keyed by book_id
})

export default progress
```

Mount in server.ts (after existing routes, before static middleware):
```typescript
import progressRoutes from "./routes/progress.js";
// ...
app.route("/api", progressRoutes);
```

### Pattern 2: Schema Migration for New Table

**What:** `CREATE TABLE IF NOT EXISTS` in the main `db.exec()` block — not an ALTER TABLE migration, because this is a wholly new table.
**When to use:** New tables. Use `try/catch ALTER TABLE` only for adding columns to existing tables.

```typescript
// In schema.ts, inside the main db.exec(`...`) block:
CREATE TABLE IF NOT EXISTS progress (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  timestamp   REAL    NOT NULL,
  chapter_idx INTEGER NOT NULL,
  percentage  REAL    NOT NULL,
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, book_id)
);
```

The `PRIMARY KEY (user_id, book_id)` composite key enables upsert with `INSERT OR REPLACE` or `INSERT ... ON CONFLICT(user_id, book_id) DO UPDATE`.

An index on `(user_id)` is worth adding: the `GET /api/progress` query filters by user_id across potentially thousands of books. One additional `CREATE INDEX IF NOT EXISTS idx_progress_user_id ON progress(user_id)` belongs in the same `db.exec()` block.

### Pattern 3: SQLite Upsert (bun:sqlite)

**What:** Single-statement upsert using `ON CONFLICT DO UPDATE` — atomic, no race condition between SELECT + INSERT.
**When to use:** Any progress write where a row may or may not already exist.

```typescript
// Source: bun:sqlite docs — standard SQLite upsert syntax
db.query(`
  INSERT INTO progress (user_id, book_id, timestamp, chapter_idx, percentage, updated_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(user_id, book_id) DO UPDATE SET
    timestamp   = excluded.timestamp,
    chapter_idx = excluded.chapter_idx,
    percentage  = excluded.percentage,
    updated_at  = datetime('now')
`).run(userId, bookId, timestamp, chapterIdx, percentage)
```

### Pattern 4: Fire-and-Forget Server Push in `_saveProgress()`

**What:** Extend the existing async `_saveProgress()` to call `fetch()` after the IndexedDB write. Do not `await` the fetch — treat it as fire-and-forget with catch-suppressed errors.
**When to use:** Every 15s tick and every pause event (already the triggers for IndexedDB save).

```javascript
// In public/index.html — extend existing _saveProgress()
async _saveProgress() {
  if (!this.book) return
  const data = {
    timestamp: this.currentTime,
    chapterIdx: this.currentChapterIdx,
    speed: this.speed,
    updatedAt: Date.now()
  }
  await progressDB.save(Alpine.store('auth').username, this.book.id, data)
  // ... existing localStorage write ...

  // Push to server (D-01). Fire-and-forget: failures retry on next tick (D-03).
  if (navigator.onLine) {
    const percentage = this.book.duration_sec > 0
      ? this.currentTime / this.book.duration_sec
      : 0
    fetch('/api/progress/' + this.book.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: this.currentTime,
        chapterIdx: this.currentChapterIdx,
        percentage
      })
    }).catch(() => { /* silent — D-03 */ })
  } else {
    // Track dirty books for offline flush (D-02)
    Alpine.store('player')._offlineDirty.add(this.book.id)
  }
},
```

### Pattern 5: Offline Flush on Reconnect

**What:** On `online` event, flush the most recent position for each book that had saves while offline. Uses the existing `progressDB.get()` to read current position.
**When to use:** Extend the existing `online` handler at line 936.

```javascript
// Extend the existing handler in index.html (line 936 area)
window.addEventListener('online', async () => {
  if (window.Alpine) Alpine.store('app').isOffline = false
  // Flush offline-queued progress (D-02)
  const player = Alpine.store('player')
  const auth = Alpine.store('auth')
  if (!player || !auth.loggedIn) return
  for (const bookId of player._offlineDirty) {
    const saved = await progressDB.get(auth.username, bookId)
    if (!saved) continue
    // Need book duration for percentage — look up from library store
    const book = Alpine.store('library').books.find(b => b.id === bookId)
    const percentage = (book && book.duration_sec > 0)
      ? saved.timestamp / book.duration_sec : 0
    fetch('/api/progress/' + bookId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: saved.timestamp, chapterIdx: saved.chapterIdx, percentage })
    }).catch(() => {})
  }
  player._offlineDirty.clear()
})
```

The `_offlineDirty` Set must be initialized on the player store:
```javascript
Alpine.store('player', {
  // ... existing fields ...
  _offlineDirty: new Set(),
  // ...
})
```

### Pattern 6: Furthest-Position-Wins on Book Open

**What:** In `play()`, after reading IndexedDB, also query `GET /api/progress` (already fetched on app load into `$store.library`) and take `Math.max(local.timestamp, server.timestamp)`.
**When to use:** Every time `play(book)` is called.

The bulk progress data loaded by `loadBooks()` gives O(1) lookup by book ID. No extra network call needed in `play()`:

```javascript
// In play(book) — extend the existing canplay handler
const saved = await progressDB.get(Alpine.store('auth').username, book.id)
// Server progress from bulk load (D-04, D-13)
const serverProgress = Alpine.store('library').progressMap[book.id]
// Furthest-position-wins (D-04, D-07): MAX of local and server
let resumeTimestamp = 0
let resumeChapterIdx = 0
if (saved && serverProgress) {
  if (saved.timestamp >= serverProgress.timestamp) {
    resumeTimestamp = saved.timestamp
    resumeChapterIdx = saved.chapterIdx
  } else {
    resumeTimestamp = serverProgress.timestamp
    resumeChapterIdx = serverProgress.chapterIdx
  }
} else if (saved) {
  resumeTimestamp = saved.timestamp
  resumeChapterIdx = saved.chapterIdx
} else if (serverProgress) {
  resumeTimestamp = serverProgress.timestamp
  resumeChapterIdx = serverProgress.chapterIdx
}
```

### Pattern 7: Bulk Progress Fetch on App Load

**What:** In `$store.library.loadBooks()`, after fetching books, fire a parallel `GET /api/progress` to populate `$store.library.progressMap`.
**When to use:** App init (same trigger as cover cache — see line 983).

```javascript
// Extend loadBooks() in Alpine.store('library')
// Add to store definition:
progressMap: {},  // keyed by book_id → { timestamp, chapterIdx, percentage }

async loadBooks() {
  this.loading = true
  try {
    const [booksRes, progressRes] = await Promise.all([
      fetch('/api/books'),
      fetch('/api/progress')
    ])
    if (booksRes.status === 401) { /* ... existing 401 handler ... */ return }
    this.books = await booksRes.json()
    if (progressRes.ok) {
      this.progressMap = await progressRes.json() // map keyed by book_id
    }
    Alpine.store('downloads').cacheAllCovers(this.books)
  } catch (e) {
    console.error('Failed to load books:', e)
  } finally {
    this.loading = false
  }
},
```

### Pattern 8: Progress Bar on Book Tile

**What:** A thin `<div>` absolutely positioned at the bottom of `.cover-container`. Shown only when progress exists (D-12). Width bound to percentage.
**When to use:** Inside `cover-container` in the book card template.

```html
<!-- Inside .cover-container, after .downloaded-badge -->
<!-- Reading progress bar (D-09, D-10, D-12) -->
<div
  class="reading-progress-bar"
  x-show="$store.library.progressMap[book.id]"
  :style="'width:' + Math.round(($store.library.progressMap[book.id]?.percentage ?? 0) * 100) + '%'"
></div>
```

```css
/* style.css — inside .cover-container context */
.reading-progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background-color: var(--color-accent);
  z-index: 3;               /* above cover image (z-index: auto), below download overlay */
  pointer-events: none;
  border-radius: 0 0 0 0;   /* flush with card bottom edge */
}
```

### Anti-Patterns to Avoid

- **Awaiting the server push in `_saveProgress()`:** This blocks the 15s interval and pause response. The push is fire-and-forget.
- **Re-computing percentage on every tile render:** Percentage should be pre-computed server-side (D-16) and stored in `progressMap` as-is, not derived from `timestamp / duration_sec` in the template expression.
- **Using `INSERT OR REPLACE` for upsert:** This deletes the old row and inserts a new one, resetting `created_at` and potentially causing autoincrement gaps. Use `ON CONFLICT DO UPDATE` instead.
- **Fetching `GET /api/progress/:bookId` individually on each book open:** D-13 says use the bulk fetch loaded at app init. One `GET /api/progress` on load is sufficient — the `progressMap` in `$store.library` provides O(1) lookup.
- **Server-side MAX guard:** D-06 explicitly locks this out. The server stores whatever the client sends, unconditionally.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upsert semantics | Manual SELECT + INSERT/UPDATE | SQLite `ON CONFLICT DO UPDATE` | Atomic, no TOCTOU race between check and write |
| Offline queue persistence | Custom IndexedDB queue table | Simple `Set` of dirty book IDs in player store, flush on reconnect | Only latest position per book matters (D-02); a Set is sufficient |
| Authentication in progress routes | Custom token parsing | `authMiddleware` already applied to `/api/*` in server.ts | `c.get('userId')` is available in every progress handler for free |
| Progress percentage computation | Client-side `timestamp / duration_sec` on every render | Pre-compute on write, store in `progress.percentage`, return from `GET /api/progress` | D-16 locks this; avoids needing `duration_sec` in every Alpine template expression |

**Key insight:** The entire sync architecture fits within existing patterns. The only genuinely new code is `src/routes/progress.ts` (a single file) and the `progress` table definition. All other changes are extensions of existing functions.

---

## Common Pitfalls

### Pitfall 1: `_offlineDirty` Set Initialized After Alpine Store Access
**What goes wrong:** If `_offlineDirty` is not declared in the `Alpine.store('player', { ... })` definition and is instead added later, Alpine's reactivity proxy won't see it. The `online` flush handler accesses `Alpine.store('player')._offlineDirty` — if the store is not yet initialized when the `online` event fires, this throws.
**Why it happens:** Alpine stores are initialized inside `document.addEventListener('alpine:init', ...)`. The `online` event listener is registered outside this block (line 936) and fires immediately on reconnect regardless of Alpine state.
**How to avoid:** Declare `_offlineDirty: new Set()` as a property in the `Alpine.store('player', { ... })` object literal. In the `online` handler, guard with `if (!player) return`.
**Warning signs:** `TypeError: Cannot read properties of undefined (reading '_offlineDirty')` in console on reconnect.

### Pitfall 2: `progressMap` Not Updated After Tile Progress Changes
**What goes wrong:** After `_saveProgress()` pushes new progress to the server, the `progressMap` in `$store.library` is stale. The tile badge shows the old percentage until the next page reload.
**Why it happens:** `loadBooks()` fetches progress once on init. Subsequent pushes update the server but not the in-memory map.
**How to avoid:** After a successful `PUT /api/progress/:bookId` in `_saveProgress()`, also update `Alpine.store('library').progressMap[this.book.id]` with the new percentage. Since the push is fire-and-forget (errors suppressed), update the map *before* the fetch (optimistic update) using the locally computed percentage.
**Warning signs:** Tile shows 0% or stale % while player is actively tracking current position.

### Pitfall 3: `GET /api/progress` Returns 401 Before User Is Logged In
**What goes wrong:** `loadBooks()` fires the parallel `GET /api/progress` call. If the session is invalid or expired, it returns 401. If the code does `this.progressMap = await progressRes.json()`, it sets `progressMap` to `{ error: 'Unauthorized' }` instead of `{}`.
**Why it happens:** `loadBooks()` already handles `booksRes.status === 401` but the parallel `progressRes` needs the same check.
**How to avoid:** Guard: `if (progressRes.ok) { this.progressMap = await progressRes.json() }`. An auth failure on the progress fetch is not fatal — tiles just show no bars, which is the correct behavior for an unauthenticated state.
**Warning signs:** `progressMap` becomes `{ error: 'Unauthorized' }` causing `progressMap[book.id]` to return `undefined` (correct behavior) but also a confusing object shape.

### Pitfall 4: x-show with Optional Chaining on `progressMap`
**What goes wrong:** `x-show="$store.library.progressMap[book.id]"` evaluates to `undefined` for books with no progress — which is falsy. This is correct. However `progressMap[book.id]?.percentage` in the style binding evaluates to `undefined`, which coerces to `NaN` in numeric context, producing `width: NaN%` (invalid CSS, bar doesn't render).
**Why it happens:** Optional chaining returns `undefined`, not `0`.
**How to avoid:** Use the nullish coalescing default in the style binding: `($store.library.progressMap[book.id]?.percentage ?? 0) * 100`.
**Warning signs:** Progress bar is absent on books that should show one; DevTools shows `width: NaN%` on `.reading-progress-bar`.

### Pitfall 5: `progress` Table Created in Migration Block vs Main Schema Block
**What goes wrong:** If the `CREATE TABLE IF NOT EXISTS progress` is placed inside a `try/catch` migration block (as was done for column additions), it still works — but it's semantically wrong. New tables belong in the main `db.exec(...)` block.
**Why it happens:** Developers see the migration pattern in schema.ts and assume all schema changes go in try/catch blocks.
**How to avoid:** The `try/catch` pattern is only for `ALTER TABLE` column additions (which throw "duplicate column" on existing DBs). `CREATE TABLE IF NOT EXISTS` is idempotent by design — it belongs in the main block.
**Warning signs:** None at runtime, but it's dead code that could confuse future maintainers.

### Pitfall 6: Percentage Stored as 0–1 Float vs 0–100 Integer
**What goes wrong:** If `percentage` is stored as `0.75` (float 0–1) but the CSS template multiplies by 100, you get `75%` — correct. But if stored as `75` (integer 0–100), the template `percentage * 100` gives `7500%` — a 100x wide bar.
**Why it happens:** Inconsistent convention between server storage and client display math.
**How to avoid:** Store as 0–1 float (matches natural computation: `timestamp / duration_sec`). Template binding: `Math.round((progressMap[id]?.percentage ?? 0) * 100) + '%'`.
**Warning signs:** Progress bar fills entire card or overflows it.

---

## Code Examples

Verified patterns from codebase inspection:

### bun:sqlite Upsert Pattern (from existing schema.ts conventions)
```typescript
// Source: bun:sqlite standard SQLite syntax, consistent with existing db.query() pattern in routes/books.ts
db.query(`
  INSERT INTO progress (user_id, book_id, timestamp, chapter_idx, percentage, updated_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(user_id, book_id) DO UPDATE SET
    timestamp   = excluded.timestamp,
    chapter_idx = excluded.chapter_idx,
    percentage  = excluded.percentage,
    updated_at  = datetime('now')
`).run(userId, bookId, timestamp, chapterIdx, percentage)
```

### GET /api/progress Response Shape (map keyed by book_id)
```typescript
// Returns: { "42": { timestamp: 1234.5, chapterIdx: 2, percentage: 0.34 }, ... }
const rows = db.query<
  { book_id: number; timestamp: number; chapter_idx: number; percentage: number },
  [number]
>(`SELECT book_id, timestamp, chapter_idx, percentage FROM progress WHERE user_id = ?`)
  .all(userId)

const map: Record<string, { timestamp: number; chapterIdx: number; percentage: number }> = {}
for (const row of rows) {
  map[row.book_id] = {
    timestamp: row.timestamp,
    chapterIdx: row.chapter_idx,
    percentage: row.percentage
  }
}
return c.json(map)
```

### Existing Route Mount Pattern (from server.ts lines 29-33)
```typescript
// Source: src/server.ts
app.route("/api", userRoutes);
app.route("/api", bookRoutes);
app.route("/api", audioRoutes);
app.route("/api", coverRoutes);
app.route("/api", scanRoutes);
// Add:
app.route("/api", progressRoutes);  // NEW — before static middleware
```

### Existing Schema Migration Pattern (from schema.ts lines 63-74)
```typescript
// Source: src/db/schema.ts — ALTER TABLE migration for columns
try {
  db.exec(`ALTER TABLE users ADD COLUMN last_login_at TEXT`)
} catch {
  // Column already exists — safe to ignore
}
// progress table uses CREATE TABLE IF NOT EXISTS in main block instead (new table, not column)
```

### Existing `_saveProgress()` (from index.html lines 1165-1184)
```javascript
// Source: public/index.html
async _saveProgress() {
  if (!this.book) return
  await progressDB.save(
    Alpine.store('auth').username,
    this.book.id,
    { timestamp: this.currentTime, chapterIdx: this.currentChapterIdx, speed: this.speed, updatedAt: Date.now() }
  )
  try {
    localStorage.setItem('spine-last-book', JSON.stringify({ id: this.book.id, position: this.currentTime }))
  } catch { /* ignore */ }
  // ADD: server push here
},
```

### Online/Offline Handler Location (index.html line 936)
```javascript
// Source: public/index.html line 936 — existing handlers to extend
window.addEventListener('online', () => { if (window.Alpine) Alpine.store('app').isOffline = false })
window.addEventListener('offline', () => { if (window.Alpine) Alpine.store('app').isOffline = true })
// Extend the 'online' handler with offline flush logic (D-02)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Last-write-wins progress sync | Furthest-position-wins (MAX) | Project decision (STATE.md) | Prevents losing progress due to clock drift between devices |
| `better-sqlite3` for SQLite | `bun:sqlite` (built-in) | Project decision (STATE.md: v1.0) | No npm package needed; synchronous API identical to better-sqlite3 |
| `INSERT OR REPLACE` upsert | `ON CONFLICT DO UPDATE` | SQLite 3.24+ (2018) | Preserves row identity, avoids `created_at` reset |

---

## Open Questions

1. **`GET /api/progress` response for tile rendering: book_id as number or string key?**
   - What we know: SQLite returns `book_id` as `INTEGER`. JSON serialization of `Record<string, ...>` keys them as strings. Alpine template `progressMap[book.id]` — `book.id` is a number from the books array. JavaScript object property access coerces numeric keys to strings, so `obj[42]` and `obj["42"]` access the same key.
   - What's unclear: Whether to explicitly convert to string keys on the server or rely on JS coercion.
   - Recommendation: Convert explicitly on the server (`map[String(row.book_id)]`) for explicitness. Template can use `progressMap[book.id]` naturally — JS coercion handles it.

2. **Should `progressMap` be refreshed after a successful server push?**
   - What we know: D-13 says tile badge data comes from a bulk server fetch on app load. The push happens every 15s.
   - What's unclear: Whether re-fetching `GET /api/progress` after every push is expected (it is not — that would be expensive) or whether optimistic local update is sufficient.
   - Recommendation: Optimistic local update in `_saveProgress()`: after computing percentage for the PUT body, also update `Alpine.store('library').progressMap[this.book.id]` with the same value. This keeps the tile badge current without extra network calls.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in, no install needed) |
| Config file | none — `bun test` auto-discovers `*.test.ts` files |
| Quick run command | `bun test src/routes/progress.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROG-05 | PUT /api/progress/:bookId stores position for authenticated user | unit | `bun test src/routes/progress.test.ts` | ❌ Wave 0 |
| PROG-05 | PUT /api/progress/:bookId returns 401 without session | unit | `bun test src/routes/progress.test.ts` | ❌ Wave 0 |
| PROG-05 | PUT /api/progress/:bookId upserts on second call | unit | `bun test src/routes/progress.test.ts` | ❌ Wave 0 |
| PROG-06 | GET /api/progress returns map of all user's progress | unit | `bun test src/routes/progress.test.ts` | ❌ Wave 0 |
| PROG-06 | GET /api/progress returns empty map for user with no progress | unit | `bun test src/routes/progress.test.ts` | ❌ Wave 0 |
| PROG-07 | GET /api/progress does not return other users' progress | unit | `bun test src/routes/progress.test.ts` | ❌ Wave 0 |
| PROG-08 | progress table persists percentage pre-computed (0–1 range) | unit | `bun test src/routes/progress.test.ts` | ❌ Wave 0 |

Note: PROG-07 (offline-first IndexedDB behavior) and PROG-08 (tile bar rendering) are browser-side concerns. They cannot be exercised by bun:test server-side tests. The server-side tests validate the API contract that the frontend depends on. Browser behavior is manually verified.

### Sampling Rate
- **Per task commit:** `bun test src/routes/progress.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** `bun test` full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/routes/progress.test.ts` — covers PROG-05, PROG-06, PROG-07 (server-side)

The test file follows the exact structure of `src/routes/books.test.ts` (tmpDbPath, _resetForTests, seeded users/sessions, `makeProgressApp()` helper). No new framework configuration needed.

---

## Sources

### Primary (HIGH confidence)
- `src/db/schema.ts` — Existing table schema and migration pattern (try/catch ALTER TABLE)
- `src/server.ts` — Route mount pattern, auth middleware application
- `src/routes/books.ts` — Authenticated route file pattern to replicate
- `src/routes/users.ts` — Upsert patterns, `c.get('userId')` usage
- `src/middleware/auth.ts` — `AuthVariables` type, userId extraction
- `src/db/index.ts` — `getDatabase()`, `_resetForTests()`, `openDatabase()` — test pattern
- `public/index.html` lines 886–934 — `progressDB` IndexedDB wrapper
- `public/index.html` lines 1085–1113 — `play()` function (where furthest-position-wins goes)
- `public/index.html` lines 1165–1184 — `_saveProgress()` (extension point)
- `public/index.html` lines 936–937 — online/offline handlers (extension point)
- `public/index.html` lines 238–278 — Book card template (progress bar insertion point)
- `public/style.css` lines 301–306 — `.cover-container` CSS (position: relative confirmed)
- `src/routes/books.test.ts` — Test file structure to replicate for progress.test.ts
- `.planning/STATE.md` — "No new npm dependencies for v1.1"; bun:sqlite decision; furthest-position-wins

### Secondary (MEDIUM confidence)
- CLAUDE.md Technology Stack — confirmed bun:sqlite, Alpine.js CDN, no build step
- `.planning/phases/09-progress-sync-and-tiles/09-CONTEXT.md` — All locked decisions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — codebase is fully inspected, no new dependencies
- Architecture: HIGH — route file pattern, schema migration pattern, and store extension points all directly observed in existing code
- Pitfalls: HIGH — derived from actual code inspection (Alpine x-if/x-show history in STATE.md, bun:sqlite upsert syntax, optional chaining behavior)
- Test patterns: HIGH — `books.test.ts` is the direct template; same bun:test setup applies

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable stack; bun:sqlite and Alpine CDN versions are pinned)
