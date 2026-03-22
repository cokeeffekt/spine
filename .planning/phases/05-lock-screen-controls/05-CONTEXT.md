# Phase 5: Lock Screen Controls - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users listening on Android can control playback from the lock screen without unlocking the device. This phase delivers: Media Session metadata (title, author, cover artwork), lock-screen playback controls (play/pause, skip), and a chapter-scoped scrubber with position state updates.

Note: Phase 4 already registered Media Session action handlers for play, pause, nexttrack, and previoustrack. This phase adds the **metadata** and **position state** that makes those controls show up on the lock screen with book information.

</domain>

<decisions>
## Implementation Decisions

### Cover art / artwork
- **D-01:** Use the existing `/api/books/:id/cover` URL directly as the Media Session artwork src. No blob URL fetching needed — the browser handles caching and the session cookie is valid during playback.
- **D-02:** Provide two artwork sizes: 96px and 512px. Both point to the same cover URL — the original image is served and the browser/OS downscales as needed.
- **D-03:** When a book has no cover art (`cover_url` is null), use a generic placeholder image (e.g., `/public/images/default-cover.svg` or similar). This ensures the lock screen always shows something polished rather than a default music icon.

### Scrubber / position state
- **D-04:** Lock-screen scrubber is scoped to the **current chapter only**, not the full book. It shows 0:00 to chapter duration and resets at each chapter boundary. This gives precise seeking within chapters.
- **D-05:** Position state is updated every 1 second via `setInterval`, not on every `timeupdate` event. Smooth enough for a lock-screen scrubber with lower overhead.
- **D-06:** When the user seeks via the lock-screen scrubber, the seek is within the current chapter (matching the scrubber scope). The `seekto` Media Session action handler maps the requested position to the chapter's time range.

### Metadata update timing
- **D-07:** Set Media Session metadata (title, author, artwork) when a new book starts playing. Update on every chapter change to reflect the current chapter.
- **D-08:** Lock-screen title format: **"Book Title -- Ch. N: Chapter Name"** (all info in one line in the title field). Author goes in the artist field.
- **D-09:** Keep metadata visible on pause so the user can resume from the lock screen. Clear metadata only on explicit logout or player close — not on pause.

### Claude's Discretion
- Placeholder image design (SVG vs PNG, exact appearance)
- How to calculate chapter-relative position from the audio element's absolute currentTime
- Whether to register `seekto` as a new handler or modify the existing `nexttrack`/`previoustrack` handlers
- Exact `setPositionState` call shape (duration, playbackRate, position)
- Whether to start/stop the 1s position interval on play/pause or let it run continuously

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Media Session (Phase 4 foundation)
- `public/index.html` -- Existing `navigator.mediaSession.setActionHandler` calls for play, pause, nexttrack, previoustrack (lines ~692-710). Phase 5 adds metadata and position state alongside these.

### Cover art infrastructure
- `src/routes/cover.ts` -- GET `/api/books/:id/cover` serves cover image from `cover_path`. Returns 404 when no cover exists.
- `src/routes/books.ts` -- GET `/api/books/:id` returns `cover_url` field (null when no cover). Book list also includes `cover_url`.

### Player state
- `public/index.html` -- `$store.player` Alpine store: `book` (with title, author, cover_url, chapters), `currentTime`, `currentChapterIdx`, `playing`, `speed`. The `initAudio` method sets up the audio element via `window._spineAudio`.
- `public/player-utils.js` -- `getCurrentChapterIdx(chapters, currentTime)` pure function for chapter detection.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `$store.player.book.cover_url` -- Already contains `/api/books/:id/cover` or null. Can be passed directly to MediaMetadata artwork.
- `$store.player.book.title`, `$store.player.book.author` -- Already available for metadata.
- `$store.player.book.chapters[currentChapterIdx]` -- Has `title`, `start_sec`, `end_sec` for chapter-scoped scrubber calculations.
- `getCurrentChapterIdx()` from `player-utils.js` -- Already used in timeupdate handler.

### Established Patterns
- Media Session handlers follow the pattern: check `'mediaSession' in navigator`, then `navigator.mediaSession.setActionHandler(...)`.
- Audio state is accessed via `window._spineAudio` (non-reactive) and Alpine store for reactive UI.
- `$store.player._startSaveInterval()` already uses `setInterval` for 15s progress saves -- similar pattern for 1s position updates.

### Integration Points
- Metadata should be set inside `$store.player.play()` method (on new book) and updated in the `timeupdate` handler or chapter-change detection (on chapter change).
- Position state interval should start/stop alongside the existing save interval in play/pause handlers.
- `seekto` handler needs to map chapter-relative position back to absolute audio time using `chapters[currentChapterIdx].start_sec + seekOffset`.

</code_context>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 05-lock-screen-controls*
*Context gathered: 2026-03-22*
