# Domain Pitfalls

**Domain:** Self-hosted audiobook platform — v1.1 additions
**Project:** Spine
**Researched:** 2026-03-23
**Scope:** Admin UI, library rescan, progress sync, MP3 folder scanning, reading progress tiles

---

## Critical Pitfalls

Mistakes that cause rewrites or broken data.

---

### Pitfall 1: Last-Admin Deletion Leaves System Locked

**What goes wrong:** Admin deletes the only other admin account (or their own via a different session), leaving no admin user in the database. The system becomes permanently inaccessible — no one can create users, trigger rescans, or manage the library without direct DB surgery.

**Why it happens:** `DELETE /api/users/:id` prevents self-deletion (`id === currentUserId`), but the current code in `src/routes/users.ts` has no guard against deleting *another* admin who happens to be the last one. The self-deletion guard only protects the requesting admin.

**Consequences:** Permanent admin lockout with no recovery path short of `docker exec` + sqlite3 CLI. Household is stuck.

**Codebase reference:** `src/routes/users.ts` lines 38-49. The guard checks `id === currentUserId` but does not query admin count.

**Prevention:**
- Before executing DELETE, query: `SELECT COUNT(*) FROM users WHERE role = 'admin'`
- If count is 1 and the target user is an admin, return 400 "Cannot delete the last admin account"
- Run this check server-side only — never rely on the UI to enforce it
- Apply the same guard to role-change operations: demoting the last admin to 'user' is equally dangerous

**Detection warning signs:** User reports "no admin access after deleting account" — by definition, unrecoverable without backend access.

**Phase:** Admin UI phase. Must be resolved before the delete endpoint is exposed in the browser UI.

---

### Pitfall 2: Progress Sync Race — Device A and Device B Both Finish a Chapter Offline

**What goes wrong:** User listens on phone (offline), switches to tablet (also has offline progress), both come online. Both devices push their position to the server. If the server applies a pure last-write-wins by wall-clock time, the "winning" write may be from whichever device synced first, not from wherever the user actually was furthest along.

**Why it happens:** `Date.now()` on the client is unreliable for conflict resolution — clocks drift across devices, and the device that syncs first wins regardless of actual playback position. A phone that was used 2 days ago but syncs 5 seconds before the tablet will overwrite 2 days of tablet progress.

**Consequences:** User loses reading position. Progress regresses. Trust in the app breaks. This is the most user-visible failure mode for any progress sync feature.

**Prevention:**
- Use "furthest position wins" as the conflict strategy, not timestamp-based LWW
- The server stores: `position_sec` (playback cursor), `updated_at` (server-receive timestamp)
- On sync push: `INSERT INTO progress ... ON CONFLICT(user_id, book_id) DO UPDATE SET position_sec = MAX(excluded.position_sec, position_sec), updated_at = datetime('now')`
- SQLite's `MAX()` in an upsert DO UPDATE clause makes this a single atomic operation with no race
- Never use the client-supplied timestamp as the authoritative time; use `datetime('now')` server-side
- "Furthest wins" is correct for linear audiobook listening — it is not correct for all media types, but it is correct here

**Detection warning signs:** Users reporting "it jumped back to the beginning" or "it forgot where I was."

**Phase:** Progress sync phase. The data model design must commit to furthest-wins before any API is built.

---

### Pitfall 3: MP3 Folder "Book" Identity — One Folder, Multiple Interpretations

**What goes wrong:** The scanner needs to decide what constitutes a single "book" when processing MP3 folders. Common real-world layouts include:
- `Author/Book Title/01-chapter.mp3` — one book per folder
- `Author/Book Title/Disc 1/01.mp3`, `Author/Book Title/Disc 2/01.mp3` — multi-disc book in subfolders
- `Author/Book Title/Part 1/01.mp3`, `Author/Book Title/Part 2/01.mp3` — multi-part book in subfolders
- `Author/01.mp3`, `Author/02.mp3` — files directly in author folder with no book subfolder

If the scanner treats each *directory* as a book, multi-disc books become multiple books. If it treats the parent folder as the book, flat layouts collapse multiple books into one.

**Why it happens:** There is no standardized MP3 audiobook folder structure. Ripped CD collections, downloaded MP3s, and Audible exports all use different conventions. Audiobookshelf GitHub issues #3829 and #2762 show this is a persistent community problem.

**Consequences:** Library shows duplicate phantom "books" (one per disc), or merges unrelated books into one, with scrambled chapter order. Requires manual correction per-book.

**Codebase reference:** `src/scanner/walk.ts` currently only emits `.m4b` files. MP3 support requires a parallel "folder grouping" pass — a fundamentally different data model than single-file books.

**Prevention:**
- Define a single canonical rule upfront: **the folder directly containing the MP3 files is the book**
- Walk the tree looking for directories that contain `.mp3` files
- Each such directory is one book candidate
- Use the `disc` and `track` ID3 tags from ffprobe to order files within the book: sort by `(disc_number, track_number)`, falling back to natural sort on filename
- Document the supported layout in README so users know to organize accordingly
- Do not try to handle multi-disc subfolders in v1.1 — add a note that disc subfolders should be flattened or handled with a metadata.json

**Detection warning signs:** Book count in admin UI is double what user expects, or book title shows "Disc 1" instead of the book title.

**Phase:** MP3 scanning phase. The grouping rule must be locked before schema changes.

---

### Pitfall 4: MP3 Track Ordering Breaks Without Natural Sort

**What goes wrong:** `walkLibrary` returns paths sorted alphabetically (via `.sort()`). For `.m4b`, order does not matter — there is one file per book. For MP3 folders, the sort order of files within a folder directly determines playback order. Alphabetic sort puts "Chapter 10" before "Chapter 2". Files named "track1.mp3", "track2.mp3" ... "track10.mp3" play in order 1, 10, 2, 3 — the classic lexicographic vs. numeric sort failure.

**Why it happens:** JavaScript's `Array.sort()` is lexicographic by default. "10" < "2" because "1" < "2". This is universally documented as a pitfall for numbered file sequences.

**Consequences:** Book plays chapters out of order. Audiobook experience is broken from first listen.

**Codebase reference:** `src/scanner/walk.ts` line 19: `return m4bPaths.sort()`. This is correct for `.m4b` (filenames do not affect order) but will be wrong for MP3 track ordering.

**Prevention:**
- Sort MP3 files within a folder by their ID3 `track` and `disc` tags (extracted via ffprobe), with natural-sort filename as tiebreaker
- Implement natural sort: split filenames on numeric boundaries and compare segments as integers where numeric, strings where alpha
- `"track10.mp3"` vs `"track2.mp3"` → natural sort returns `track2` first
- Fallback order: (1) disc tag, (2) track tag, (3) natural filename sort
- The `track` tag in ID3 is often formatted as `"N/Total"` (e.g., `"3/12"`) — parse the part before `/`
- Run the sort deterministically so repeated scans produce identical chapter sequences

**Phase:** MP3 scanning phase. Must be implemented before any chapter list is generated from MP3 files.

---

### Pitfall 5: Rescan During Active Scan — Concurrent Scan Corruption

**What goes wrong:** Admin triggers a rescan from the browser UI while a startup scan (or a previous manual scan) is still running. Both scan processes run simultaneously against the same SQLite database. The `scanFile` upsert is atomic, but the `DELETE FROM chapters WHERE book_id = ?` followed by re-insertion is a two-step operation. A concurrent scan of the same file could see the deleted chapters before re-insertion is complete.

**Why it happens:** The current `scanLibrary` does not hold a lock or flag during execution. An HTTP-triggered rescan has no mechanism to detect that a scan is already in progress.

**Consequences:** A book may temporarily have zero chapters. If the race is tight enough, one scan's chapter write gets deleted by the other scan's DELETE. The result is a book with chapters from a partial write or no chapters at all. Requires full rescan to repair.

**Codebase reference:** `src/scanner/index.ts` lines 168-186. The chapter delete+insert is wrapped in a `db.transaction()`, which makes the pair atomic for a single `scanFile` call, but does not prevent a second concurrent call from racing against the outer scan.

**Prevention:**
- Maintain a `scanInProgress: boolean` flag as a module-level variable (or in a singleton)
- `POST /api/admin/rescan` checks the flag: if true, return 409 with "Scan already in progress"
- Reset the flag on scan completion or unhandled error (use `try/finally`)
- Optionally track `scanStartedAt` timestamp to surface in admin UI
- Do not attempt to use SQLite transactions to solve this — the isolation is per-connection but the concurrency issue is at the application level

**Phase:** Library rescan phase. Must be resolved before the rescan endpoint exists.

---

## Moderate Pitfalls

Mistakes that cause bad UX or data inconsistency, but are recoverable.

---

### Pitfall 6: Session Tokens Survive User Deletion

**What goes wrong:** Admin deletes a user. The user's session tokens still exist in the `sessions` table... but they reference a deleted user via a foreign key with `ON DELETE CASCADE`. In this schema, cascade delete is already configured, so sessions are auto-deleted when the user row is deleted. However, if a deleted user has an active browser tab, their in-flight requests between the tab's last auth check and the next will still carry the now-invalid cookie. The `authMiddleware` will reject the token (session deleted), but the UI will not know the session is dead until the next API call.

**What is already handled:** `sessions.user_id` has `ON DELETE CASCADE` (schema.ts line 54), so the DB side is already correct. Password reset already calls `DELETE FROM sessions WHERE user_id = ?` (users.ts line 66).

**What is NOT handled:** User deletion does not. The cascade handles it at the DB level, but the client's live tab will get 401s with no friendly message. If the admin UI is on the same session as the deleted user, the page will appear broken.

**Prevention:**
- Cascade delete already handles token cleanup — no additional backend work needed
- Add UI handling: on 401 from any API call, redirect to `/login` with a "Session expired" message
- In the admin UI, consider a confirmation step before deletion: "This will log out the user from all devices"

**Phase:** Admin UI phase. The DB is already correct; the frontend behavior needs attention.

---

### Pitfall 7: Progress Tiles Show Stale Data After Tab Is Reopened

**What goes wrong:** User opens the library grid. Progress percentages are read from IndexedDB and rendered into Alpine tiles. User listens on another device (or in another tab), returns to the first tab. The progress tiles still show the old position because IndexedDB was read once at page load and is not reactive to changes in other tabs.

**Why it happens:** Raw IndexedDB has no cross-tab notification mechanism. Alpine's `x-data` and `$store` are reactive within a tab but do not observe IndexedDB changes from other contexts.

**Consequences:** Progress tile shows 23% when user is actually at 67%. Not data-corrupting, but confusing and trust-eroding.

**Prevention:**
- Refresh progress data on `visibilitychange` event: when the tab becomes visible again, re-read IndexedDB for all displayed books and update Alpine store
- After progress sync is implemented, `visibilitychange` also triggers a sync push+pull, so the displayed percentage reflects server state
- Keep the read lightweight: a single IndexedDB `getAll` on the progress store is fast (< 5ms for a household-sized library)
- Do not use `setInterval` polling — `visibilitychange` is the correct event

**Phase:** Progress tiles phase. The sync phase amplifies this fix — on visibility, sync then display.

---

### Pitfall 8: Alpine Large List Re-render on Progress Update

**What goes wrong:** When a progress value changes in Alpine's `$store`, Alpine re-evaluates all expressions in all components that reference that store property. If the library grid has 200+ books, each with a `x-bind` to a computed progress percentage, every progress update triggers a full store traversal and re-evaluation.

**Why it happens:** Alpine does not have virtual DOM diffing — it re-evaluates expressions directly. Deeply nested or large arrays in `$store` worsen this. The GitHub issue #570 confirms `x-for` has overhead at scale compared to vanilla JS.

**Consequences:** Visible jank when progress updates during playback (e.g., the progress bar update ripples to the grid). On low-power devices (Raspberry Pi browser, older Android), this may be noticeable.

**Prevention:**
- Store progress in a `Map`-like structure keyed by `bookId` in `$store.progress`
- Use `x-bind:style` or `x-bind:class` referencing only `$store.progress[bookId]`, not a computed array
- Each tile accesses only its own key — Alpine only re-evaluates tiles whose key changes
- Do not store the entire progress record in `x-data` per tile — that creates N reactive roots
- Debounce progress writes: during playback, write to IndexedDB and store every 10 seconds, not on every `timeupdate` event

**Phase:** Progress tiles phase. Architecture decision before Alpine wiring begins.

---

### Pitfall 9: MP3 Metadata Overwrite on Rescan Erases User-Corrected Titles

**What goes wrong:** User's MP3 collection has no embedded ID3 tags. The scanner derives titles from the folder name (fallback logic in `applyFallbackMetadata`). User creates a `metadata.json` file to correct the title. Later, admin triggers a rescan. The upsert in `scanFile` overwrites ALL metadata columns, including those the user corrected via `metadata.json` — but only if the file's mtime/size changed. If a file is re-touched (e.g., by a backup tool), the upsert runs and the fallback re-applies, which should be fine. However, if mtime changes but `metadata.json` is absent at rescan time (e.g., user deleted it after correcting), the title reverts to the folder name.

**Why it happens:** `applyFallbackMetadata` fills null fields from `metadata.json` but cannot distinguish "was null because never set" from "was null and user wants it null." The upsert always overwrites all metadata columns.

**Codebase reference:** `src/scanner/index.ts` lines 97-145. The upsert overwrites all non-cover fields unconditionally.

**Prevention:**
- This is acceptable behavior for v1.1: document that `metadata.json` is the override mechanism and it must be kept in place
- For the MP3 scanning case, the same rule applies: `metadata.json` in the book folder overrides all extracted/fallback metadata
- If admin-editable metadata via the UI is added in a later milestone, add a `metadata_locked` flag to the books table and skip upsert of metadata columns when set

**Phase:** MP3 scanning phase. Not a blocker for v1.1, but document the behavior.

---

### Pitfall 10: MP3 Folder Books Share a `file_path` Identity Problem

**What goes wrong:** The current `books` table uses `file_path TEXT NOT NULL UNIQUE` as the natural key for upsert and identity. For `.m4b`, one file = one book, so `file_path` is the canonical identifier. For MP3 folders, there is no single file — the book is a *directory* of files. If `file_path` is set to the folder path, it works for identity. But if the scanner also tries to index individual MP3 files by their path, there will be N rows per book.

**Why it happens:** The schema was designed for single-file books. The `file_path` column is not conceptually wrong for folder-based books, but the scanner needs an explicit convention: "for MP3 books, `file_path` is the folder path, not a member file path."

**Consequences:** If the scanner accidentally creates one book row per MP3 file, the library grid shows 30 "books" for a 30-track audiobook.

**Codebase reference:** `src/db/schema.ts` line 8. `file_path TEXT NOT NULL UNIQUE` — currently expected to be a `.m4b` file path.

**Prevention:**
- For MP3 books, set `file_path = directory_path` (the folder, not any individual file)
- `mtime` and `size` for an MP3 book: use the folder's mtime and the sum of all member file sizes
- Store member files in a new table (`book_files`?) or derive them on demand from the filesystem
- The simplest v1.1 approach: no `book_files` table — store the folder path, re-read member files on every streaming request, and trust the sort order from the scan
- Add a `format` column to `books` (e.g., `'m4b'` or `'mp3_folder'`) so streaming and chapter logic can branch by type

**Phase:** MP3 scanning phase. Schema migration required before any MP3 scanning code runs.

---

### Pitfall 11: Rescan API Has No Progress Feedback — User Triggers Multiple Rescans

**What goes wrong:** Admin clicks "Rescan Library" and nothing visibly happens (or response is slow). Admin clicks again. Now two concurrent scans race (see Pitfall 5), or the second request 409s silently, leaving the admin unsure if the rescan is running.

**Why it happens:** HTTP POST for a long-running background operation returns immediately or hangs. Without feedback, the user assumes nothing happened.

**Prevention:**
- POST `/api/admin/rescan` starts the scan in the background (fire and forget) and immediately returns `{ status: 'started' }` or `{ status: 'already_running' }` (409)
- Expose GET `/api/admin/scan-status` that returns `{ inProgress: boolean, startedAt: string | null, lastCompletedAt: string | null }`
- Admin UI polls `scan-status` every 3 seconds while `inProgress` is true, then refreshes the book list on completion
- Store `lastCompletedAt` in a module-level variable (no DB needed) — survives until next restart, which is sufficient

**Phase:** Library rescan phase. The status endpoint is simple but prevents the double-trigger problem.

---

## Minor Pitfalls

---

### Pitfall 12: `cover_path` Upsert Does Not Reset on Rescan

**What goes wrong:** A `.m4b` or MP3 folder's cover art is extracted on first scan and written to `/data/covers/{id}.jpg`. On rescan (mtime changed), the upsert runs, but the cover is inserted as `null` and then updated below the upsert. If the re-extraction fails (e.g., cover stream gone in a re-encoded file), `cover_path` is set to null. A working cover art disappears.

**Codebase reference:** `src/scanner/index.ts` line 144 — `null` is inserted for `cover_path`, then updated on lines 154-165. If the second update succeeds with a non-null value, fine. If it fails silently (exception caught), cover_path stays null.

**Prevention:**
- Before overwriting `cover_path` with null on upsert, check if a cover file already exists at the previous path
- If cover extraction fails and a previous cover file exists, preserve the existing `cover_path` value
- The simplest fix: read existing `cover_path` before the upsert and fall back to it if new extraction fails

**Phase:** MP3 scanning phase (covers for MP3 books will need similar handling; fix the root issue then).

---

### Pitfall 13: Service Worker `precacheAndRoute` Revision Must Be Updated

**What goes wrong:** `sw.js` hardcodes revision strings for precached assets (line 8-13 in `public/sw.js`). When the admin UI page is added as a new route or existing HTML/JS files change, the old revision causes the service worker to serve stale assets from cache. Users see the old UI after a deployment.

**Why it happens:** Workbox precaching uses revision to detect changes. Without a build tool to auto-generate revisions, revisions must be bumped manually on every asset change.

**Prevention:**
- Increment the revision string whenever any precached file changes — treat it as a required step in the deployment checklist
- When new admin UI pages/scripts are added, add them to the `precacheAndRoute` array with a `revision: '1'`
- Consider adding a comment at the top of `sw.js`: "// Bump revision strings when any precached asset changes"

**Phase:** Any phase that modifies frontend assets. Low-severity but breaks cache freshness.

---

### Pitfall 14: Alpine `adminOnly` UI Guards Are Not a Security Boundary

**What goes wrong:** Admin UI is shown/hidden with Alpine `x-if` based on the user's role from `$store.auth.role`. A regular user who knows the admin endpoint URLs can still call them directly — the browser UI guard is cosmetic only. The backend `adminOnly` middleware is the real gate.

**Prevention:** This is already handled — `src/middleware/auth.ts` has `adminOnly` middleware applied to all `/api/users/*` routes. This pitfall is a reminder: do not route the admin rescan endpoint without the same middleware, and do not move any admin logic to the frontend.

**Phase:** Admin UI phase. Verify `adminOnly` middleware is on all new admin endpoints before shipping.

---

## Phase-Specific Warnings

| Phase Topic | Pitfall | Prevention Summary |
|-------------|---------|-------------------|
| Admin UI — user management | Last-admin deletion lockout (P1) | Count admins before DELETE; block if count = 1 |
| Admin UI — user management | Session tokens for deleted users (P6) | Cascade already handles DB; fix frontend 401 redirect |
| Admin UI — rescan trigger | Concurrent scan race (P5) | Module-level `scanInProgress` flag; 409 on second request |
| Admin UI — rescan trigger | No feedback loop (P11) | Background start + status polling endpoint |
| Admin UI — security | Frontend role guard bypassed (P14) | Ensure `adminOnly` middleware on all new admin routes |
| Progress sync | Clock-drift conflict (P2) | `MAX(excluded.position_sec, position_sec)` upsert; server timestamp only |
| Progress tiles | Stale data on tab resume (P7) | Re-read IndexedDB on `visibilitychange` |
| Progress tiles | Alpine re-render at scale (P8) | Keyed `$store.progress` map; debounce writes |
| MP3 scanning | Book identity ambiguity (P3) | Folder path = book identity; document supported layout |
| MP3 scanning | Lexicographic file ordering (P4) | Natural sort by disc/track tag then filename |
| MP3 scanning | Schema incompatibility (P10) | `file_path` = folder path; add `format` column; migration required |
| MP3 scanning | Metadata overwrite on rescan (P9) | Document; `metadata.json` is the correction mechanism |
| All phases | Cover art lost on re-extraction failure (P12) | Preserve previous `cover_path` if re-extraction fails |
| All phases | Service worker stale cache (P13) | Bump `precacheAndRoute` revision strings on any asset change |

---

## Sources

- [audiobookshelf scanner docs](https://www.audiobookshelf.org/guides/book-scanner/) — MEDIUM confidence, community-driven audiobook scanning patterns
- [audiobookshelf issue #3829](https://github.com/advplyr/audiobookshelf/issues/3829) — MP3 chapter creation requires audio meta tags; confirmed community bug report
- [audiobookshelf issue #2762](https://github.com/advplyr/audiobookshelf/issues/2762) — metadata order of precedence not honored on weekly scan; confirmed community bug
- [Debugging audiobookshelf folder-based books (Abookio, 2025)](https://abookio.app/news/2025/11/25/abs-bug.html) — folder detection bugs in production scanner
- [Offline sync & conflict resolution (Feb 2026)](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-architecture-trade%E2%80%91offs-practical-guide-feb-19-2026/) — architecture patterns for offline-first sync conflict
- [Downsides of offline-first | RxDB](https://rxdb.info/downsides-of-offline-first.html) — IndexedDB eviction, clock drift, sync complexity
- [IndexedDB performance pitfalls](https://dev.to/roverbober/indexeddb-understanding-performance-pitfalls-part-1-434d) — transaction handling limits; initialization time at scale
- [Solving IndexedDB slowness | RxDB](https://rxdb.info/slow-indexeddb.html) — store partitioning, transaction batching
- [How to invalidate JWT without blacklist](https://dev.to/webjose/how-to-invalidate-jwt-tokens-without-collecting-tokens-47pk) — session invalidation strategies
- [Alpine.js x-for large list performance](https://github.com/alpinejs/alpine/discussions/570) — confirmed overhead at scale
- [Alpine.js stores usage guide](https://alpinedevtools.com/blog/stores-usage-guide) — keyed store patterns, reactivity scope
- [Workbox audio caching / range requests](https://github.com/daffinm/audio-cache-test) — RangeRequestsPlugin is mandatory for audio; CacheFirst requires full-file cache
- [6 RBAC implementation pitfalls](https://idenhaus.com/rbac-implementation-pitfalls/) — privilege escalation, separation of duties
- Codebase review: `src/routes/users.ts`, `src/db/schema.ts`, `src/scanner/index.ts`, `src/scanner/walk.ts`, `src/scanner/probe.ts`, `src/middleware/auth.ts`, `public/sw.js` — HIGH confidence, direct code inspection
