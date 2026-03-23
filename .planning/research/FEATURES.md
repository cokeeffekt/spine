# Feature Landscape: Spine v1.1

**Domain:** Self-hosted audiobook platform — admin tools, progress sync, MP3 folder support, UI improvements
**Researched:** 2026-03-23
**Milestone Context:** v1.1 adds administrative control, cross-device progress, MP3 scanning, and library grid progress indicators to an already-shipped v1.0 product.

---

## Existing v1.0 Baseline (do not re-implement)

These are already shipped. Documented here to clarify dependencies.

| Already Built | Notes |
|---------------|-------|
| Auth (Argon2id, session cookies, admin/user roles) | `POST /api/users`, `DELETE /api/users/:id`, `PATCH /api/users/:id/password` all exist at the API level |
| .m4b library scanning + ffprobe metadata extraction | `scanLibrary()` + incremental mtime/size check |
| Library grid, book detail, audio player | Alpine.js, no build step |
| Per-user progress in IndexedDB (local-first) | Stored under username-scoped keys |
| Offline download with Workbox CacheFirst | Whole-book downloads |
| Lock-screen controls via Media Session API | |
| Fallback metadata from `metadata.json` + folder name | `applyFallbackMetadata()` |

**Critical gap in v1.0:** The admin user management API endpoints exist but there is NO admin UI in the browser. Users must be managed via raw HTTP calls. This is the primary gap the admin UI feature closes.

---

## Table Stakes

Features users of self-hosted media software expect. Missing = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Admin UI: list all users | Every admin tool (Jellyfin, Audiobookshelf, Plex) shows a user roster | Low | Existing `GET /api/users` endpoint (needs to be added — currently only create/delete/patch exist) |
| Admin UI: create user | Core account management; APIs exist, UI does not | Low | `POST /api/users` (exists) |
| Admin UI: delete user | Core account management; APIs exist, UI does not | Low | `DELETE /api/users/:id` (exists) |
| Admin UI: reset password | Household admins need to recover locked-out users | Low | `PATCH /api/users/:id/password` (exists) |
| Admin-triggered library rescan | Users add books to the folder; need browser-level "refresh" without SSHing into the container | Low-Medium | `scanLibrary()` (exists); needs a `POST /api/admin/rescan` endpoint + button in UI |
| Reading progress % on library tiles | Audible, Libby, and every audiobook app shows this — absence is jarring | Low | Progress must come from somewhere; currently IndexedDB only (local) — reading from server after sync, or from local IndexedDB on same device |
| Progress sync to server | "Pick up where you left off on any device" is the core value promise; without server sync this only works per-device | Medium | Requires new `user_progress` table in SQLite and new API endpoints |

---

## Differentiators

Features that are valued but not universally expected in self-hosted tools at this scale.

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| MP3 folder support | Expands the library to users with existing ripped MP3 collections — a very common format for books bought on CD or ripped from libraries | Medium-High | New scanner path; virtual chapter synthesis from files; ID3 tag reading via ffprobe |
| Progress conflict resolution (last-write-wins with per-book granularity) | Users jumping between devices get the correct position without data loss | Low-Medium | Part of progress sync; handled at API level |
| Rescan shows progress/count feedback | Admin knows the scan finished and how many books were found/updated | Low | Rescan endpoint; simple JSON response with counts already exists in `scanLibrary()` console.log |
| Empty library state updated to mention rescan button | Discoverability; current empty state says "restart the scanner" — admin can now do it in the browser | Low | Admin UI rescan feature |

---

## Anti-Features

Features to explicitly NOT build in v1.1.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Audiobookshelf-style per-library permissions / tag filtering | Overkill for a household of a few people; adds significant schema and UI complexity | Keep it binary: admin vs user; no per-library access control |
| Guest accounts (read-only, no password change) | Not mentioned in v1.1 scope; adds a third role case to all auth middleware | Defer to v2 or never — household use case doesn't need it |
| Real-time progress push (WebSockets / SSE) | Engineering cost is high; household scenario has at most 2-3 concurrent users with no real-time requirements | Periodic sync on play events is sufficient |
| Automatic library rescans (cron / filesystem watcher) | `watcher.ts` exists but adds background complexity; admin-triggered is good enough for v1.1 | Admin button covers the use case; watcher is a v2 enhancement |
| Per-chapter download granularity | PROJECT.md explicitly out-of-scope; whole-book downloads already work | Keep whole-book download as the model |
| MP3 transcoding to m4b | Transcoding is out-of-scope and complex; serve MP3 files directly | Stream MP3 files like .m4b with HTTP range requests |
| External metadata lookup (Audible API, OpenLibrary, etc.) | Internet dependency breaks the self-hosted/offline-capable promise; complex API integration | Rely on embedded tags + folder name fallback + metadata.json sidecar |
| Upload via browser | PROJECT.md: library is filesystem-only | Document the volume mount workflow |

---

## Feature Deep Dives

### Admin User Management UI

**What the ecosystem does:** Audiobookshelf (the dominant self-hosted audiobook app) provides an admin UI that lists all users in a table, with inline actions to create, delete, reset passwords, and change roles. The pattern is a simple CRUD table — no complex modals or multi-step flows.

**Expected behavior:**
1. A "Users" or "Admin" section in the nav bar, visible only when `$store.auth.role === 'admin'`
2. List of users: username, role, created date — rendered as a simple table or card list
3. "Create user" form: username + password + role selector (admin/user)
4. "Delete" action per user: confirm prompt to prevent accidental deletion; cannot delete self (API already enforces this)
5. "Reset password" action per user: input for new password, submit
6. Error feedback inline (username taken, user not found, etc.)

**What's already built:** All four API endpoints exist. The UI is the gap.

**Missing API endpoint:** `GET /api/users` (list all users) does not appear to exist yet in `src/routes/users.ts`. Must be added.

**Complexity:** Low. Alpine.js `x-data` with fetch calls. No new backend complexity beyond the list endpoint.

---

### Admin-Triggered Library Rescan

**What the ecosystem does:** Jellyfin and Audiobookshelf both provide a "Scan libraries" button in their admin dashboard. The pattern is: button click → POST request → server runs scan in background (or synchronously for small libraries) → success/failure feedback.

**Expected behavior:**
1. "Rescan Library" button in admin section
2. POST to `POST /api/admin/rescan`
3. Button shows loading state during scan
4. On completion: show count of books found / new / updated / missing
5. Library grid auto-refreshes (re-fetch `/api/books`) after rescan completes

**Implementation note for Spine's scale:** For a household library of dozens to a few hundred books, a synchronous scan that holds the HTTP connection open is acceptable. The existing `scanLibrary()` already returns after completion. A background job queue is unnecessary at this scale.

**Complexity:** Low-Medium. New route + wiring existing `scanLibrary()` + Alpine UI state for loading/results.

---

### Reading Progress Tiles (% indicator on library grid)

**What the ecosystem does:** Audible, Libby, Audiobookshelf — all show a progress bar or percentage on each book tile in the library grid. The implementation is typically a thin colored bar at the bottom of the cover art, or a percentage label overlaid on the corner.

**Expected behavior:**
1. Each book tile shows a progress bar (0–100%) at the bottom of the cover image
2. 0% books show no bar (or very faint bar); 100% books show a "finished" state (distinct color or checkmark)
3. Progress data source: after sync is implemented, read from server; before sync, read from local IndexedDB

**Implementation dependency:** The progress indicator has two states:
- Pre-sync: Read from IndexedDB using the same key pattern the player uses (`spine-progress-{username}-{bookId}`)
- Post-sync: Read from server progress API (v1.1 sync feature)

Both can work. The IndexedDB approach can be shipped first (same milestone) and the server source can be layered in when sync lands.

**Complexity:** Low (UI only). No backend required if reading IndexedDB. The `$store.player` already has progress logic; this reuses it for the grid display.

---

### Progress Sync to Server

**What the ecosystem does:** Audiobookshelf uses per-user `mediaProgress` records with fields: `currentTime` (seconds), `duration` (seconds), `progress` (0–1 float), `isFinished`, `startedAt`, `lastUpdate`, `finishedAt`. Sync is triggered when a session closes or at play intervals.

**Conflict resolution:** The industry-standard approach for position-based progress is Last-Write-Wins (LWW) using `lastUpdate` timestamp. This is:
- Correct: listening position is monotonically increasing; the newer timestamp almost always represents the user's actual current position
- Simple: no CRDT needed for a scalar value
- What Audiobookshelf does: compare `lastUpdate`, accept whichever is newer

**Expected behavior:**
1. On play: fetch current server progress for the book; if server timestamp is newer than local, use server position
2. During playback: push progress to server at an interval (every 10–30 seconds, same cadence as IndexedDB saves)
3. On pause/stop/unload: push final position to server
4. Conflict: last-write-wins by `updated_at` timestamp — no user-facing conflict UI needed

**Data model (new SQLite table needed):**
```sql
CREATE TABLE user_progress (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position_sec REAL   NOT NULL DEFAULT 0,
  duration_sec REAL,
  is_finished INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, book_id)
);
```

**API endpoints needed:**
- `GET /api/progress/:bookId` — fetch current user's progress for one book
- `PUT /api/progress/:bookId` — upsert progress (body: `{ position_sec, is_finished }`)
- `GET /api/progress` — fetch all progress for current user (for library grid tiles)

**Complexity:** Medium. Schema migration, three new routes, frontend sync logic in player store, conflict handling.

**Dependency note:** IndexedDB remains the source of truth for offline playback. Server sync is additive — it supplements, not replaces, the local-first approach.

---

### MP3 Folder Support

**What MP3 audiobook collections look like in the wild:**

Real-world MP3 collections have inconsistent structure. The dominant naming patterns observed in audiobookshelf, Emby, and community forums:

| Pattern | Example | How common |
|---------|---------|------------|
| Flat: all parts in one folder, folder = title | `Harry Potter and the Sorcerer's Stone/Part01.mp3` | Very common |
| Author/Title hierarchy | `J.K. Rowling/Harry Potter/Part01.mp3` | Common |
| Author/Series/Title hierarchy | `Sanderson/Cosmere/Mistborn/01.mp3` | Less common |
| Numbered files, no ID3 tags | `01.mp3`, `02.mp3`, ... `47.mp3` | Common in ripped collections |
| ID3 tagged with track numbers | Track 1 of 24, ID3 `TIT2`=title, `TPE1`=artist | Common in store-bought rips |
| Mixed: some ID3, some filename only | — | Very common; scanners must handle gracefully |
| Disc subfolders | `Disc 1/01.mp3`, `Disc 2/01.mp3` | Common for multi-disc books |

**Expected scanner behavior:**

1. **Folder = book boundary**: Each folder containing at least one .mp3 file is treated as one audiobook. This matches how both Emby and Audiobookshelf handle it.
2. **File ordering**: Natural sort by filename is the primary ordering strategy (handles `ch01.mp3`…`ch09.mp3`…`ch10.mp3` correctly). Fall back to ID3 track number if available. Do NOT rely on filesystem FAT order.
3. **Metadata extraction priority**:
   - ID3 tags from the first file (title, artist/album artist, year, narrator from comment field)
   - Folder name as title fallback (existing `applyFallbackMetadata` pattern extended to MP3)
   - `metadata.json` sidecar (already supported pattern — extend to MP3 folders)
4. **Chapter synthesis**: MP3 folders have no embedded chapter markers like .m4b. Each file = one chapter. Chapter title = ID3 `TIT2` tag or filename (stripped of leading numbers and extension). Chapter start/end = cumulative duration of preceding files.
5. **Duration**: Sum of all per-file durations from ffprobe output.
6. **Cover art**: Check for `folder.jpg`, `cover.jpg`, `cover.png` in the folder. If absent, extract from first MP3's `APIC` tag via ffprobe's `attached_pic` stream.
7. **Disc subfolders**: Flatten subfolder contents into the parent book, ordered by subfolder name then filename.

**Key pitfall — natural sort vs alphabetical sort:**

`ch1.mp3`, `ch2.mp3`, `ch10.mp3` sorted alphabetically gives: `ch1`, `ch10`, `ch2`. Natural sort gives correct order. JavaScript's `localeCompare({ numeric: true })` handles this correctly without any extra library.

```typescript
files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
```

**ID3 fields used by ffprobe:**

ffprobe reads ID3 tags from MP3 files via `-show_format -print_format json`. The relevant `format.tags` keys:
- `title` — book title (from `TALB`/album or `TIT2`/track title — album tag is more reliable for audiobooks)
- `artist` or `album_artist` — author
- `album` — often the book title in properly tagged collections
- `track` — track number (e.g., "3/24")
- `date` — year
- `comment` — sometimes narrator

**What NOT to do with MP3:**
- Do not attempt to merge MP3 files into a single audio stream — serve each file sequentially
- Do not rely on `TIT2` for book title (it's usually the chapter title, not the book title — use `TALB`/album instead)
- Do not assume all files in a folder belong to the same book if the folder has subdirectories — recurse correctly

**Serving MP3 files:** The existing audio streaming route serves a single file with HTTP range requests. For MP3 multi-file books, the player needs to advance to the next file when the current one ends. This is a player-side concern, not a file-serving concern.

**Complexity:** Medium-High. New scanner path for MP3; virtual chapter table from file list; player changes to advance between files; cover art resolution differs from .m4b.

---

## Feature Dependencies

```
Progress Tiles (grid UI)
  └── depends on: Progress Sync (for cross-device accuracy)
        └── depends on: new user_progress table + API routes
        └── OR: can read from local IndexedDB (same-device, ship first)

Admin UI (User Management)
  └── depends on: GET /api/users endpoint (missing, must add)
  └── depends on: existing POST/DELETE/PATCH user endpoints (already exist)

Admin UI (Rescan)
  └── depends on: POST /api/admin/rescan route (new)
  └── depends on: existing scanLibrary() function (already exists)

MP3 Folder Support
  └── depends on: extending walkLibrary() to include .mp3 folders
  └── depends on: new probe path for ID3 tags vs MP4 tags
  └── depends on: player changes to sequence multiple files
  └── independent of: progress sync, admin UI
```

---

## MVP Recommendation

**Phase order based on dependencies and risk:**

1. **Admin UI (user management + rescan)** — Low complexity, high leverage. The API already exists. Add `GET /api/users`, add rescan route, build Alpine UI. No schema changes. Ships fast.

2. **Progress tiles + Progress sync** — Progress tiles can ship with IndexedDB as the data source (same-device only). Progress sync adds the server layer. Both are in the same milestone; sync first enables correct tiles.

3. **MP3 folder support** — Medium-high complexity, independent of the above. Requires new scanner code, player changes, and testing against messy real-world collections. Save for last within the milestone.

**Defer:**
- Real-time progress (WebSockets): household scale doesn't need it; periodic push on play events is sufficient
- Guest accounts: not in v1.1 scope
- Automatic rescan / filesystem watcher: `watcher.ts` exists but admin-triggered is enough for v1.1

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Admin UI patterns | HIGH | Audiobookshelf docs + source reviewed; patterns are standard CRUD |
| Progress sync data model | HIGH | Audiobookshelf API docs + general sync patterns; LWW is well-established |
| MP3 folder naming patterns | MEDIUM | Community forums + Emby docs; real-world collections are inconsistent by nature |
| MP3 chapter synthesis from files | MEDIUM | Well-understood approach but edge cases (disc folders, mixed tags) need implementation testing |
| Progress tiles (IndexedDB read) | HIGH | Codebase reviewed; IndexedDB key pattern is known |

---

## Sources

- [Audiobookshelf User Management Guide](https://www.audiobookshelf.org/guides/users/) — Admin UI patterns, role model
- [Audiobookshelf Book Scanner Guide](https://www.audiobookshelf.org/guides/book-scanner/) — Folder naming, metadata priority
- [Audiobookshelf Docs: Title/Author naming](https://www.audiobookshelf.org/docs/) — Folder structure conventions
- [Audiobookshelf API — Playback & Progress Tracking (DeepWiki)](https://deepwiki.com/audiobookshelf/audiobookshelf-api-docs/3.6-playback-and-progress-tracking) — Progress data model, LWW conflict resolution
- [Emby Audio Book Naming Documentation](https://emby.media/support/articles/Audio-Book-Naming.html) — MP3 folder structure patterns
- [Offline Sync & Conflict Resolution Patterns (Sachith, Feb 2026)](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-architecture-trade%E2%80%91offs-practical-guide-feb-19-2026/) — LWW for scalar values
- [ID3 Tag Standard (Wikipedia)](https://en.wikipedia.org/wiki/ID3) — Track number field for ordering
- [Mp3tag Community — Natural Sorting](https://community.mp3tag.de/t/use-natural-sorting/50751) — Natural sort vs alphabetical ordering problem
- [APLN — Introduction to ID3 Tags in Audiobooks](https://apln.ca/introduction-to-id3-tags-in-audiobooks/) — ID3 field conventions for audiobooks
- Spine v1.0 codebase reviewed: `src/routes/users.ts`, `src/scanner/index.ts`, `src/scanner/fallback.ts`, `src/db/schema.ts`, `public/index.html`
