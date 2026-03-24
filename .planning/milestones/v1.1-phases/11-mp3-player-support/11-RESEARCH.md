# Phase 11: MP3 Player Support - Research

**Researched:** 2026-03-24
**Domain:** Multi-file audio playback — Hono route extension, Alpine.js store branching, Workbox service worker, HTML5 audio `ended` event
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Sequential load on track end. When an MP3 track finishes (`ended` event), the player swaps `src` to the next track's URL, calls `load()` + `play()`. Brief silence (~200-500ms) between tracks is acceptable.
- **D-02:** No visual loading indicator during track transitions. Brief silence is sufficient feedback.
- **D-03:** No preloading or dual-element approach. Single `<audio>` element, sequential source swapping.
- **D-04:** New endpoint: `GET /api/books/:id/audio/:chapterIdx` — looks up the chapter's `file_path` from the chapters table, serves that .mp3 file with HTTP 206 range support (same pattern as existing m4b route). Existing `/api/books/:id/audio` stays unchanged.
- **D-05:** Add a `format` field to the book detail API response (`'m4b'` or `'mp3'`). Frontend uses this to decide playback strategy. Do NOT expose raw server `file_path` to the client.
- **D-06:** Content-Type for MP3 tracks: `audio/mpeg` (not `audio/mp4`).
- **D-07:** Seek bar stays chapter-scoped (same as m4b). No whole-book seek bar.
- **D-08:** Chapter jump for MP3 books: `jumpToChapter` swaps the audio `src` to the target track URL and plays from the beginning. Same UX as m4b chapter jump.
- **D-09:** `timeupdate` handler tracks position within the current track file (not cumulative). Progress saving uses the cumulative virtual timeline.
- **D-10:** Extend offline download to MP3 books — cache all track URLs. Feature parity with m4b download.
- **D-11:** Download progress shows overall progress only (tracks downloaded / total tracks).
- **D-12:** Service worker routing: add a CacheFirst rule for `/api/books/:id/audio/:chapterIdx` alongside the existing rule.

### Claude's Discretion

- How to detect MP3 vs m4b mode in the player store (use format field from API, or check chapters for `file_path` presence)
- Whether to add a `trackUrl(chapterIdx)` helper or inline the URL construction
- How to handle edge cases: last track ends (book complete), seeking past end of track, corrupt/missing individual track files
- Progress save format adjustments (if any) for MP3 books — current format stores chapter index + timestamp, which should work as-is with cumulative timestamps
- Whether `ended` event handler checks format before attempting track advance (m4b `ended` = book done, mp3 `ended` = next track)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAY-09 | Player handles multi-file MP3 books — swaps audio source at track boundaries | D-01/D-03/D-04 establish the pattern; `ended` event branching on `book.format` drives the swap |
| PLAY-10 | Seeking across MP3 track boundaries works correctly | D-07/D-08 establish chapter-scoped seek bar + `jumpToChapter` src-swap; cumulative timestamps from Phase 10 provide the coordinate system |
</phase_requirements>

---

## Summary

Phase 11 is an extension phase, not a greenfield build. The player already works perfectly for `.m4b` single-file books. The goal is to add a parallel code path for MP3 books where each chapter (track) is a separate file, all branched on a new `book.format` field (`'m4b'` or `'mp3'`).

The work has four integration points: (1) a new Hono audio route for per-track streaming, (2) the `format` field added to the books API detail response, (3) format-aware branching in four Alpine.js player store methods (`play`, `jumpToChapter`, `ended` handler, `skip`), and (4) MP3-aware offline download in the downloads store plus a new Workbox route in `sw.js`.

The key insight from Phase 10 is that MP3 chapters are already stored in the `chapters` table with cumulative `start_sec`/`end_sec` values — the same coordinate system m4b uses. This means `getCurrentChapterIdx`, `_saveProgress`, `progressDB`, and the seek bar position display are all reusable without modification. The only thing that changes is how the audio element gets its content (source URL swap vs. `currentTime` seek).

**Primary recommendation:** Branch on `book.format === 'mp3'` in four specific locations; touch nothing else. The existing test infrastructure in `src/routes/audio.test.ts` provides the pattern for the new route's tests. Add pure-function helpers to `player-utils.js` for any logic that can be extracted and unit-tested.

---

## Standard Stack

No new dependencies. Everything in this phase uses the existing project stack.

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | 4.12.8 | New `/api/books/:id/audio/:chapterIdx` route | Already in use; same range-request pattern as existing audio route |
| bun:sqlite (built-in) | Bun 1.2.x | `chapters.file_path` lookup for new route | Already in use; `chapters` table has `file_path` column from Phase 10 migration |
| Alpine.js | 3.15.x CDN | Player store branching | Already loaded; `$store.player` is the integration point |
| Workbox 7.4.0 CDN | — | New CacheFirst route for `/audio/:chapterIdx` | Already loaded in `sw.js`; add one `registerRoute` call |

### No New Installs Required

The project uses `bun:sqlite` (built-in, not `better-sqlite3`) per the STATE.md accumulated decisions. No npm installs needed for this phase.

---

## Architecture Patterns

### Recommended File Structure (changes only)

```
src/routes/audio.ts          # Add new route handler for /books/:id/audio/:chapterIdx
src/routes/books.ts          # Add format field to GET /api/books/:id response
public/index.html            # Branch player store: play(), jumpToChapter(), ended handler, startDownload()
public/sw.js                 # Add CacheFirst route for /api/books/:id/audio/:chapterIdx
public/player-utils.js       # Add trackUrl() helper if extracted; add mp3 edge-case utilities
```

### Pattern 1: Format Detection

**What:** Use `book.format` (string `'m4b'` or `'mp3'`) from the API response to branch behavior. This is cleaner than checking `chapters[0].file_path` because it doesn't depend on chapter array contents and is unambiguous.

**When to use:** Wherever the player store needs to choose between single-file and multi-file behavior.

**Derivation in books.ts:**
```typescript
// Source: books table codec column + chapters.file_path presence
// MP3 books have chapters with non-null file_path; m4b chapters have null file_path
const format = chapters.length > 0 && chapters[0].file_path !== null ? 'mp3' : 'm4b'
return c.json({ ...book, format, chapters })
```

Alternative: derive from `books.codec` column (stored as `'mp3'` or `'aac'`/`'alac'` by scanner). Either approach works; using `chapters[0].file_path` is self-consistent with Phase 10 data.

### Pattern 2: New Audio Route

**What:** `GET /api/books/:id/audio/:chapterIdx` — looks up `chapters.file_path` for the given book + chapterIdx, serves the MP3 file with HTTP 206 range support. Content-Type: `audio/mpeg`.

**Example:**
```typescript
// Source: src/routes/audio.ts — mirrors existing /audio route structure
audio.get('/books/:id/audio/:chapterIdx', async (c) => {
  const bookId = Number(c.req.param('id'))
  const idx = Number(c.req.param('chapterIdx'))
  const db = getDatabase()

  const row = db.query<{ file_path: string }, [number, number]>(
    'SELECT file_path FROM chapters WHERE book_id = ? AND chapter_idx = ? AND file_path IS NOT NULL'
  ).get(bookId, idx)

  if (!row) return c.json({ error: 'Not found' }, 404)

  const file = Bun.file(row.file_path)
  if (!await file.exists()) return c.json({ error: 'Not found' }, 404)

  // ... same range-request logic as existing /audio route ...
  // Content-Type: 'audio/mpeg'   ← D-06: not audio/mp4
})
```

The range-request logic (parse `bytes=start-end`, clamp, `file.slice()`) is identical to the existing route. The only differences are: the DB query (chapters vs. books), Content-Type (`audio/mpeg` vs. `audio/mp4`), and the absence of `is_missing` check (chapters table has no `is_missing` column — guard via `file_path IS NOT NULL`).

### Pattern 3: Player Store Branching

**What:** Four methods in `$store.player` need format-aware branching. All branches share `window._spineAudio` (`el`). The MP3 path swaps `el.src`; the m4b path seeks `el.currentTime`.

**`play(book)` — MP3 resume:**
```javascript
// For MP3 books, resolve resume position to a track index + within-track offset
// resumeChapterIdx is already stored; set src to that track URL, seek to within-track offset
if (book.format === 'mp3') {
  el.src = '/api/books/' + book.id + '/audio/' + resumeChapterIdx
  // within-track offset = resumeTimestamp - chapters[resumeChapterIdx].start_sec
  // set el.currentTime in canplay handler
} else {
  el.src = '/api/books/' + book.id + '/audio'
}
```

**`jumpToChapter(chapterIdx)` — MP3 path:**
```javascript
if (this.book.format === 'mp3') {
  el.src = '/api/books/' + this.book.id + '/audio/' + chapterIdx
  el.load()
  el.addEventListener('canplay', () => {
    el.playbackRate = this.speed
    el.play()
    this.playing = true
    // ...intervals, metadata...
  }, { once: true })
} else {
  el.currentTime = ch.start_sec   // existing m4b path
}
```

**`ended` event handler — MP3 track advance:**
```javascript
el.addEventListener('ended', () => {
  if (this.book && this.book.format === 'mp3') {
    // Advance to next track
    const nextIdx = this.currentChapterIdx + 1
    if (nextIdx < this.book.chapters.length) {
      this.currentChapterIdx = nextIdx
      el.src = '/api/books/' + this.book.id + '/audio/' + nextIdx
      el.load()
      el.addEventListener('canplay', () => {
        el.playbackRate = this.speed
        el.play()
        this.playing = true
        this._startSaveInterval()
        this._startPositionInterval()
        this._setMediaMetadata()
      }, { once: true })
    } else {
      // Last track finished — book complete (same as m4b ended behavior)
      this.playing = false
      this._clearSaveInterval()
      this._clearPositionInterval()
      this._saveProgress()
    }
  } else {
    // m4b: book complete
    this.playing = false
    this._clearSaveInterval()
    this._clearPositionInterval()
    this._saveProgress()
  }
})
```

**`timeupdate` — within-track currentTime for seek bar (D-09):**

For MP3 books, `el.currentTime` is the position within the current track file (resets to 0 on each src swap). The seek bar uses `el.currentTime` directly scoped to the current chapter — this is already chapter-scoped by design (`chapterPositionState` uses `chapter.start_sec` relative offset). For MP3 books, `chapter.start_sec` within the file is 0 (each track starts at 0). The cumulative `chapter.start_sec` is only used for:
- `getCurrentChapterIdx(el.currentTime, chapters)` — MUST NOT use `el.currentTime` for MP3 because that's within-track time, not cumulative time.

**Critical fix for `timeupdate` in MP3 mode:** `getCurrentChapterIdx` uses cumulative timestamps but `el.currentTime` for MP3 books is within-track (0-based). The `currentChapterIdx` must track which track is playing, not be re-derived from `el.currentTime` during MP3 playback.

Solution: Skip the `getCurrentChapterIdx` call for MP3 books in `timeupdate`. The `currentChapterIdx` is already set correctly by `play()` and `jumpToChapter()` and `ended` handler — no re-derivation needed during playback. Only m4b books use `getCurrentChapterIdx` in `timeupdate`.

```javascript
el.addEventListener('timeupdate', () => {
  this.currentTime = el.currentTime   // within-track time for seek bar
  if (this.book && this.book.chapters) {
    if (this.book.format === 'mp3') {
      // currentChapterIdx is set by play()/jumpToChapter()/ended handler — do not re-derive
      // but update the cumulative progress tracker for _saveProgress
      const ch = this.book.chapters[this.currentChapterIdx]
      this._trackCumulativeTime = ch ? ch.start_sec + el.currentTime : el.currentTime
    } else {
      this.currentChapterIdx = getCurrentChapterIdx(el.currentTime, this.book.chapters)
    }
  }
  // ... chapter change detection, sleep timer (uses this.currentTime = within-track) ...
})
```

Note: `_saveProgress` currently uses `this.currentTime` as the stored timestamp. For MP3 books, `this.currentTime` is within-track. The saved `timestamp` needs to be the cumulative position for cross-session resume to work. This requires storing cumulative time separately (e.g., `_trackCumulativeTime`) and using it in `_saveProgress` for MP3 books.

### Pattern 4: Download — MP3 Books

**What:** `startDownload` for an MP3 book fetches N track URLs sequentially, each stored as a separate cache entry. Progress is reported as `tracksDownloaded / totalTracks`.

```javascript
async startDownload(book) {
  if (book.format === 'mp3') {
    const totalTracks = book.chapters.length
    let downloaded = 0
    const cache = await caches.open('spine-audio')
    let totalBytes = 0

    for (let i = 0; i < totalTracks; i++) {
      const url = '/api/books/' + book.id + '/audio/' + i
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for track ' + i)
      const blob = await res.blob()
      const fullResponse = new Response(blob, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(blob.size),
          'Accept-Ranges': 'bytes',
        }
      })
      await cache.put(url, fullResponse)
      downloaded++
      totalBytes += blob.size
      this.states[book.id] = {
        status: 'downloading',
        progress: downloaded / totalTracks,
        sizeBytes: totalBytes
      }
    }
    // save to downloadDB, set complete state...
  } else {
    // existing m4b path unchanged
  }
}
```

**Delete cleanup** (`_cleanup`) must also delete all N track cache entries for MP3 books:
```javascript
async _cleanup(bookId) {
  const cache = await caches.open('spine-audio')
  const book = Alpine.store('player').book   // may be stale; prefer storing track count in downloadDB
  // Delete the primary key and all known track URLs
  await cache.delete('/api/books/' + bookId + '/audio')
  const meta = await downloadDB.get(bookId)
  if (meta && meta.trackCount) {
    for (let i = 0; i < meta.trackCount; i++) {
      await cache.delete('/api/books/' + bookId + '/audio/' + i)
    }
  }
}
```

This requires storing `trackCount` in downloadDB on save. The `init()` method that reconciles on page load must also check per-track URLs for MP3 books.

### Pattern 5: Service Worker Route

**What:** Add one `registerRoute` call in `sw.js` for the new per-track URL pattern.

```javascript
// Per-track MP3 audio: CacheFirst — same strategy as whole-book m4b audio
workbox.routing.registerRoute(
  ({ url }) => url.pathname.match(/^\/api\/books\/\d+\/audio\/\d+$/),
  audioCacheFirst   // reuse the already-instantiated strategy
)
```

The regex `/^\/api\/books\/\d+\/audio\/\d+$/` matches `/api/books/42/audio/0` etc. Register it BEFORE the existing `/audio$` route (more specific patterns first).

**SW precache revision:** The `sw.js` file itself is being modified, which means the precache revision string for `/index.html` does NOT need bumping (sw.js is not precached). However, if `index.html` changes (it will, for player store updates), the precache revision for `index.html` MUST be bumped. Same for `player-utils.js` if that file changes. Per the project memory: always bump SW precache revision strings when modifying precached static files.

**SW init reconciliation:** The `downloads.init()` function currently only checks `/api/books/${bookId}/audio` (the m4b URL) in Cache Storage. For MP3 books, the primary check should be whether track 0 exists: `/api/books/${bookId}/audio/0`. The `downloadDB` entry's `trackCount` field enables this.

### Anti-Patterns to Avoid

- **Using `el.currentTime` as cumulative position for MP3 books:** `el.currentTime` resets to 0 on each track src swap. Store `_trackCumulativeTime` (cumulative start of current chapter + `el.currentTime`) and use that in `_saveProgress` for MP3 books.
- **Calling `getCurrentChapterIdx(el.currentTime, chapters)` during MP3 `timeupdate`:** The chapters array uses cumulative timestamps; `el.currentTime` is within-track. This would always return chapter 0. Skip the re-derivation for MP3 books.
- **Forgetting `{ once: true }` on `canplay` listeners:** Each `load()` + src-swap registers a canplay handler. Without `{ once: true }`, handlers accumulate and fire repeatedly.
- **Not storing `trackCount` in downloadDB for MP3 books:** Without it, `_cleanup` and `init()` cannot enumerate per-track cache entries.
- **Bumping wrong precache revision:** `sw.js` modifications do NOT require bumping `sw.js`'s own revision (sw.js is not in the precache list). Changes to `index.html` and `player-utils.js` DO require their revision strings bumped.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP range requests for MP3 tracks | Custom range parser | Copy existing pattern from `src/routes/audio.ts` | Already battle-tested; Bun's `file.slice()` handles it correctly |
| Format detection | Complex codec detection | `format` field derived from `chapters[0].file_path !== null` in books route | One line; consistent with Phase 10 data model |
| Workbox per-track caching | Custom fetch/cache logic | Reuse existing `audioCacheFirst` strategy instance | RangeRequestsPlugin already handles slicing cached 200 responses into 206 |
| Progress coordinate conversion | Re-architecting the progress store | Maintain `_trackCumulativeTime` as a single derived value updated in `timeupdate` | Minimal change; existing `_saveProgress` needs one conditional |

---

## Common Pitfalls

### Pitfall 1: `currentTime` Coordinate Mismatch
**What goes wrong:** `getCurrentChapterIdx(el.currentTime, chapters)` returns 0 for an MP3 book playing track 5, because `el.currentTime` is track-relative (e.g., 45.0 seconds into track 5) while `chapters[5].start_sec` might be 14400 (4 hours cumulative).
**Why it happens:** `el.currentTime` resets to 0 on every `el.src` swap. m4b books never swap src so `el.currentTime` equals cumulative position.
**How to avoid:** Skip `getCurrentChapterIdx` re-derivation in `timeupdate` for MP3 books. The `currentChapterIdx` is maintained by the `play`/`jumpToChapter`/`ended` handlers.
**Warning signs:** Chapter display always shows "Chapter 1" for MP3 books after the first track ends.

### Pitfall 2: Cumulative Progress Timestamp for Resume
**What goes wrong:** `_saveProgress` stores `this.currentTime` (within-track for MP3). On resume, `resumeTimestamp` is e.g. 45 seconds (within the previous track) not the cumulative 14445 seconds. `jumpToChapter(resumeChapterIdx)` plays from start_sec=14400, then the canplay handler sets `el.currentTime = 45` — which is correct within-track. This actually works IF the resume logic does `el.currentTime = resumeTimestamp - chapter.start_sec`. Must verify this arithmetic in the `play()` canplay handler.
**Why it happens:** The progress store saves within-track time but `play()` was written for m4b where `el.currentTime = resumeTimestamp` is the absolute seek.
**How to avoid:** In `play()` canplay handler for MP3 books: `el.currentTime = resumeTimestamp - chapter.start_sec` (within-track offset). Store `_trackCumulativeTime = chapter.start_sec + el.currentTime` in timeupdate so percentage calculation in `_saveProgress` remains correct.
**Warning signs:** Resume always starts at the beginning of the resume chapter for MP3 books, skipping the within-chapter position.

### Pitfall 3: `canplay` Listener Accumulation
**What goes wrong:** `jumpToChapter` adds a `canplay` event listener each time it is called. Without `{ once: true }`, every previous listener fires on the next `load()`. A user jumping through 5 chapters accumulates 5 listeners, causing `play()` to be called 5 times simultaneously.
**Why it happens:** The existing `play(book)` already uses `{ once: true }` on its canplay listener — the same pattern must be applied in `jumpToChapter` and the `ended` handler.
**How to avoid:** Always use `{ once: true }` when registering `canplay` for src-swap operations.
**Warning signs:** Audio plays at normal speed but calls `el.play()` multiple times; Chrome DevTools shows repeated play promise chains.

### Pitfall 4: SW `_cleanup` Leaves Orphaned Track Caches
**What goes wrong:** `deleteDownload(book)` calls `_cleanup(bookId)` which only deletes `/api/books/:id/audio`. For MP3 books, the 20-50 per-track cache entries (`/audio/0`, `/audio/1`, ...) are left in `spine-audio` Cache Storage permanently.
**Why it happens:** The current `_cleanup` was written for single-URL m4b books.
**How to avoid:** Store `trackCount` (and `format`) in the downloadDB entry when saving. In `_cleanup`, iterate all track URLs if `meta.format === 'mp3'`.
**Warning signs:** Cache Storage grows unboundedly after delete/re-download cycles for MP3 books. `caches.open('spine-audio')` shows old track entries.

### Pitfall 5: `init()` Reconciliation Misses MP3 Downloads
**What goes wrong:** `downloads.init()` checks `cache.match('/api/books/' + bookId + '/audio')` to verify a download. MP3 books have no cache entry at that URL — only at `/audio/0`, `/audio/1`, etc. The download appears missing and is deleted from IndexedDB.
**Why it happens:** Init was written for m4b single-URL pattern.
**How to avoid:** In `init()`, if the downloadDB entry has `format: 'mp3'`, check `/api/books/:id/audio/0` for presence instead of `/api/books/:id/audio`.

### Pitfall 6: SW Precache Revision Not Bumped
**What goes wrong:** Old cached `index.html` and/or `player-utils.js` served to returning users despite new code being deployed. MP3 books play incorrectly or not at all.
**Why it happens:** Service worker precaching serves stale versions when revision strings don't change.
**How to avoid:** Bump revision strings for every precached file that changes: `index.html` (certain to change), `player-utils.js` (likely to change if helpers are added). Current revisions: `index.html` = `'6'`, `player-utils.js` = `'3'`.

### Pitfall 7: `skip()` at Track Boundary for MP3 Books
**What goes wrong:** `skip(seconds)` calls `el.currentTime = clampSkip(el.currentTime, seconds, el.duration)`. For a 60-second MP3 track playing at second 55, `skip(30)` clamps to `el.duration` (60 seconds), not the cumulative end of the book. This means forward-skip does NOT advance to the next track.
**Why it happens:** `skip` is scoped to the current audio element's duration.
**How to avoid:** Per D-07, the seek bar is chapter-scoped — this behavior is acceptable (skip stays within current track). Document this as intended. The `ended` event handler will advance the track naturally when the user listens to the end. No code change needed; just document the expected behavior.

---

## Code Examples

Verified patterns from the existing codebase:

### Existing Range-Request Handler (copy pattern for new route)
```typescript
// Source: src/routes/audio.ts lines 22-71
// The entire range-request block is reusable verbatim; only change:
// - DB query targets chapters.file_path instead of books.file_path
// - Content-Type: 'audio/mpeg' instead of 'audio/mp4'
const rangeHeader = c.req.header('Range')
if (!rangeHeader) {
  return new Response(file, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=86400',
      'Content-Length': String(totalSize),
    },
  })
}
// ... parse Range, slice, return 206 ...
```

### Workbox Route Registration (existing sw.js pattern)
```javascript
// Source: public/sw.js lines 26-29
// NEW route — add BEFORE the existing /audio$ route
workbox.routing.registerRoute(
  ({ url }) => url.pathname.match(/^\/api\/books\/\d+\/audio\/\d+$/),
  audioCacheFirst   // same strategy instance — RangeRequestsPlugin included
)
```

### Format Field Derivation (books.ts addition)
```typescript
// Derive format without exposing file_path to client
const isMP3 = chapters.length > 0 && chapters[0].file_path !== null
return c.json({ ...book, format: isMP3 ? 'mp3' : 'm4b', chapters })
```

### `canplay` with `{ once: true }` (existing play() pattern)
```javascript
// Source: public/index.html line 1131
el.addEventListener('canplay', () => {
  // ... setup ...
}, { once: true })
// Apply same { once: true } in jumpToChapter() and ended handler for MP3
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dual `<audio>` elements for gapless | Single element with `ended` src-swap (acceptable brief silence) | Decision D-01/D-03 | Simpler implementation; no gapless requirement for audiobooks |
| Whole-book seek bar | Chapter-scoped seek bar | Phase 4 decisions D-04 | No change needed; same behavior for both formats |

**Not applicable:** This phase introduces no new library versions. All patterns are extensions of existing code.

---

## Open Questions

1. **Progress `timestamp` field — within-track vs. cumulative for MP3**
   - What we know: `_saveProgress` stores `this.currentTime` which for MP3 is within-track. Resume uses `resumeTimestamp` as `el.currentTime` (for m4b, this is the cumulative seek).
   - What's unclear: Does the canplay handler in `play()` set `el.currentTime = resumeTimestamp` directly, expecting cumulative time? If so, it will set the wrong position for MP3 (seeking to second 45 within a 3-hour track file).
   - Recommendation: Store `_trackCumulativeTime` in the player store for progress percentage. Use within-track offset for `el.currentTime` in the canplay resume handler: `el.currentTime = resumeTimestamp - chapter.start_sec`. This requires the planner to add a small calculation in the canplay handler for MP3 books.

2. **`downloads.init()` reconciliation for MP3 books**
   - What we know: Init checks for `/audio` cache entry. MP3 books use `/audio/0`.
   - What's unclear: Should `downloadDB` store format so init can branch, or should init always check `/audio/0` as fallback?
   - Recommendation: Store `{ sizeBytes, downloadedAt, format, trackCount }` in downloadDB for MP3 books. Init checks format-appropriate URL.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none — `bun test` auto-discovers `**/*.test.ts` and `tests/*.test.ts` |
| Quick run command | `bun test src/routes/audio.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAY-09 | `GET /api/books/:id/audio/:chapterIdx` returns 206 with `audio/mpeg` | unit | `bun test src/routes/audio.test.ts` | ❌ Wave 0 — add MP3 route tests to existing file |
| PLAY-09 | `GET /api/books/:id/audio/:chapterIdx` returns 404 for nonexistent chapterIdx | unit | `bun test src/routes/audio.test.ts` | ❌ Wave 0 |
| PLAY-09 | `GET /api/books/:id` response includes `format: 'mp3'` for MP3 books | unit | `bun test src/routes/books.test.ts` | ❌ Wave 0 — add format field test |
| PLAY-09 | `GET /api/books/:id` response includes `format: 'm4b'` for m4b books | unit | `bun test src/routes/books.test.ts` | ❌ Wave 0 |
| PLAY-10 | Track URL helper constructs correct URL | unit | `bun test tests/player.test.ts` | ❌ Wave 0 — add trackUrl helper test if extracted |
| PLAY-09/10 | Manual: MP3 book plays continuously across tracks | manual-only | n/a | Requires real .mp3 files and browser |
| PLAY-09/10 | Manual: `jumpToChapter` swaps to correct track | manual-only | n/a | Requires real .mp3 files and browser |

### Sampling Rate

- **Per task commit:** `bun test src/routes/audio.test.ts src/routes/books.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/routes/audio.test.ts` — add describe block for `GET /api/books/:id/audio/:chapterIdx` (MP3 route tests). Seed chapters with `file_path` to a temp `.mp3` file.
- [ ] `src/routes/books.test.ts` — add tests verifying `format` field in `/api/books/:id` response for both m4b and MP3 books (seed chapters with null vs. non-null `file_path`).
- [ ] `tests/player.test.ts` — add test for `trackUrl()` helper if extracted to `player-utils.js`.

---

## Sources

### Primary (HIGH confidence)

- `src/routes/audio.ts` — Full existing range-request implementation; new route is a near-copy
- `src/routes/books.ts` — Book detail response shape; `format` field insertion point
- `src/db/schema.ts` — Confirms `chapters.file_path` column from Phase 10 migration
- `src/types.ts` — Confirms `Chapter.file_path: string | null`, `NormalizedChapter.file_path?: string`
- `public/index.html` lines 1059-1492 — Full player store and downloads store; all integration points read
- `public/sw.js` — Existing Workbox routes; new route insertion point confirmed
- `public/player-utils.js` — All utility functions; `getCurrentChapterIdx` behavior confirmed
- `.planning/phases/11-mp3-player-support/11-CONTEXT.md` — All locked decisions verified
- `.planning/STATE.md` — Confirms `bun:sqlite` (not better-sqlite3), no new npm deps constraint

### Secondary (MEDIUM confidence)

- HTML5 `ended` event behavior: fires when audio element reaches end of `src` — well-established browser API, consistent across all modern browsers. Load-then-play pattern for src swap is standard.
- Workbox `CacheFirst` with `RangeRequestsPlugin`: confirmed working in existing sw.js for m4b audio; same strategy handles MP3 files (content-type agnostic).

### Tertiary (LOW confidence)

- None — all critical claims verified against codebase source.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all existing
- Architecture: HIGH — derived directly from codebase reading + locked decisions
- Pitfalls: HIGH — derived from code analysis (coordinate mismatch, listener accumulation confirmed by reading existing patterns)
- Test infrastructure: HIGH — existing test files read directly

**Research date:** 2026-03-24
**Valid until:** Until Phase 11 implementation (no external dependencies to expire)
