---
type: quick-fix
date: 2026-03-23
tags: [css, frontend, backend, cover-art, player, ux]
key-files:
  modified:
    - public/index.html
    - public/style.css
    - src/scanner/cover.ts
    - src/scanner/index.ts
decisions:
  - Write cover art to /data/covers/{bookId}.jpg (writable volume) not beside .m4b (read-only mount)
  - Use chapter-relative seek in both expanded player and collapsed progress strip
  - Auto-restore position on refresh without auto-playing — user must tap play
metrics:
  duration: ~25 minutes
  completed: 2026-03-23
  fixes: 8
---

# Quick Fix: 8 Manual Testing Quirks (2026-03-23)

**One-liner:** Fixed 8 UX/correctness issues found during manual testing — cover art writing to writable Docker volume, square covers, search layout fixes, chapter-scoped player progress and seek, time-remaining display, and last-played session restore.

## Fixes Applied

### Quirk 5 — Cover art not displaying (backend)

**Commit:** `9c9e3c0`

**Root cause:** `extractCoverArt` wrote `cover.jpg` beside the `.m4b` file, but the books volume is mounted `:ro` in Docker. `ffmpeg` silently failed with a non-zero exit code and the cover was never written.

**Fix in `src/scanner/cover.ts`:**
- `extractCoverArt` now accepts a `bookId` parameter and writes to `/data/covers/{bookId}.jpg`
- `resolveCoverPath` checks `/data/covers/{bookId}.jpg` first, then falls back to legacy `cover.jpg` beside `.m4b`
- `fs.mkdirSync(COVERS_DIR, { recursive: true })` ensures the directory exists

**Fix in `src/scanner/index.ts`:**
- Upsert runs first (to obtain the DB row ID), then cover is extracted using that ID
- `cover_path` column updated in a separate `UPDATE` after extraction
- No change to the cover API route (`src/routes/cover.ts`) — it reads `cover_path` from DB and serves the file, which works regardless of path location

---

### Quirk 8 — Cover images not square

**Commit:** `e4e188e`

Changed `aspect-ratio: 2/3` to `aspect-ratio: 1 / 1` on:
- `.cover-container` (library grid cards)
- `.skeleton-cover` (loading skeleton)
- `.detail-cover` (book detail view)

`object-fit: cover` was already set on all `img` elements — the change only affected the container shape.

---

### Quirk 6 — Filters overlap the search box

**Commit:** `c2e3e1c`

**Root cause:** `.search-bar` used `position: relative` with an absolutely-positioned `.search-icon`. The search input used `width: 100%`, pushing the filter button outside the flow. A duplicate `flex-wrap: wrap` rule at the bottom of the file had no flex context to apply to.

**Fix:**
- `.search-bar` is now `display: flex; flex-wrap: wrap; align-items: center; gap: 8px`
- New `.search-input-wrap` div wraps the input + icon + clear button with `position: relative; flex: 1; min-width: 180px`
- `.filter-downloaded` and `.storage-summary` are flex siblings — no more overlapping
- Removed duplicate `.search-bar { flex-wrap: wrap }` at bottom of CSS
- Removed `margin-left` from `.filter-downloaded` and `.storage-summary` (gap handles spacing)

---

### Quirk 7 — Filter icon misaligned

**Commit:** `2b1b985`

Added `.filter-downloaded svg { display: block; flex-shrink: 0; }` to prevent inline SVG from adding extra baseline whitespace inside the flex button.

---

### Quirk 2 — Expanded player shows full book duration

**Commit:** `4045607`

Updated the seek bar in the expanded player to use chapter-relative values:
- `max` = `chapter.end_sec - chapter.start_sec` (chapter duration)
- `value` = `currentTime - chapter.start_sec` (chapter elapsed)
- Seek handler adds `chapter.start_sec` back to get absolute time
- Left time label shows chapter elapsed; right label shows chapter duration
- Falls back to full book duration/time when no chapter data

---

### Quirk 3 — No progress indicator on collapsed player

**Commit:** `cbe9901`

Added `.player-progress-strip` (3px tall) and `.player-progress-fill` at the very top of `.player-bar`. The fill width is chapter-relative (matching quirk 2), falling back to book-level when no chapters. CSS transition `width 1s linear` provides smooth animation.

---

### Quirk 4 — No time remaining display

**Commit:** `b458c17`

Replaced the right-side chapter duration label in the seek row with a time-remaining label formatted as `-M:SS` or `-H:MM:SS`. Shows `chapter.end_sec - currentTime` when a chapter is active, otherwise `duration - currentTime`. Added `.seek-time-remaining { opacity: 0.75 }` to subtly distinguish it from the elapsed time on the left.

---

### Quirk 1 — No session restore on page refresh

**Commit:** `dacc6e6`

Two changes:

**Save path (`_saveProgress`):** After saving to IndexedDB, also writes to `localStorage.setItem('spine-last-book', JSON.stringify({ id, position }))`. Wrapped in `try/catch` for private mode and quota scenarios.

**Restore path (session `x-init`):** After books load from `/api/books`, reads `spine-last-book` from localStorage. If the referenced book exists in the library, fetches full book data (with chapters), sets `$store.player.book`, loads audio to the element, and on `canplay` seeks to the saved position and sets `currentChapterIdx`. Does **not** auto-play — user must tap play to resume. All errors are swallowed silently (non-fatal).

---

## Test Results

All 144 existing tests pass (`bun test` — 0 failures).

## Known Stubs

None.

## Self-Check: PASSED

All 8 commits verified in `git log --oneline -8`:
- `dacc6e6` — quirk 1 session restore
- `b458c17` — quirk 4 time remaining
- `cbe9901` — quirk 3 progress strip
- `4045607` — quirk 2 chapter seek
- `2b1b985` — quirk 7 icon alignment
- `c2e3e1c` — quirk 6 filter layout
- `e4e188e` — quirk 8 square covers
- `9c9e3c0` — quirk 5 cover path fix
