# Phase 5: Lock Screen Controls - Research

**Researched:** 2026-03-22
**Domain:** Web Media Session API (metadata, position state, seekto action handler)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use the existing `/api/books/:id/cover` URL directly as the Media Session artwork src. No blob URL fetching.
- **D-02:** Provide two artwork sizes: 96px and 512px. Both point to the same cover URL — the browser/OS downscales.
- **D-03:** When `cover_url` is null, use `/public/images/default-cover.svg` as placeholder. Lock screen always shows something polished.
- **D-04:** Lock-screen scrubber is scoped to the **current chapter only** (0:00 to chapter duration). Resets at chapter boundaries.
- **D-05:** Position state updated every 1 second via `setInterval`, not on every `timeupdate`.
- **D-06:** `seekto` action maps chapter-relative `details.seekTime` back to absolute audio time via `chapter.start_sec + details.seekTime`.
- **D-07:** Set Media Session metadata on new book start; update on every chapter change.
- **D-08:** Lock-screen title format: `"{Book Title} -- Ch. N: {Chapter Name}"`. Author goes in `artist` field.
- **D-09:** Keep metadata visible on pause. Clear only on explicit logout or player close (book set to null).

### Claude's Discretion
- Placeholder image design (SVG vs PNG, exact appearance)
- How to calculate chapter-relative position from the audio element's absolute currentTime
- Whether to register `seekto` as a new handler or modify existing handlers
- Exact `setPositionState` call shape (duration, playbackRate, position)
- Whether to start/stop the 1s position interval on play/pause or let it run continuously

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOCK-01 | Android lock-screen shows book title, author, and cover art | `navigator.mediaSession.metadata = new MediaMetadata(...)` with title, artist, artwork fields |
| LOCK-02 | Lock-screen play/pause, skip forward/back controls work via Media Session API | `play`, `pause`, `nexttrack`, `previoustrack` handlers already registered in Phase 4; `seekto` added in Phase 5 |
| LOCK-03 | Lock-screen scrubber reflects current position and responds to seek | `navigator.mediaSession.setPositionState(...)` on 1s interval; `seekto` handler maps chapter-relative time back to absolute |
</phase_requirements>

---

## Summary

Phase 5 is a pure JavaScript integration phase with no new HTML, CSS, or backend work. It adds three capabilities on top of the Media Session API foundation from Phase 4: (1) `MediaMetadata` to populate the lock screen with book/chapter info and cover art, (2) `setPositionState` called on a 1-second interval to drive the lock-screen scrubber, and (3) a `seekto` action handler that translates chapter-relative seek positions back to absolute audio time.

The entire implementation lives in `public/index.html` (Alpine store additions) and one new static file `public/images/default-cover.svg`. The Media Session API has good Android Chrome support; `setPositionState` and `seekto` are both available in Android Chrome 81+. The chapter-scoped scrubber pattern (D-04 through D-06) requires careful math: the `duration` and `position` passed to `setPositionState` are chapter-relative, and `seekto`'s `details.seekTime` is also chapter-relative — so the handler must add `chapter.start_sec` before seeking the audio element.

The critical pitfall is `setPositionState` throwing `TypeError` when called with invalid values — specifically when `position > duration` (can happen during chapter transitions if position state is updated just before `currentChapterIdx` advances) or when `playbackRate` is zero (impossible here since speed is always >= 1.0). Guard with a try/catch or ensure chapter boundary math is tight.

**Primary recommendation:** Add a `_positionInterval` field to `$store.player` alongside the existing `saveInterval`; start/stop it in `play()`/`togglePlay()` following the identical pattern of `_startSaveInterval`/`_clearSaveInterval`. Update metadata in the existing `timeupdate` handler's chapter-change detection branch.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Media Session API | Web standard | Lock-screen metadata, controls, scrubber | Only standardized mechanism for OS media integration from a web page. No library needed. |
| MediaMetadata constructor | Web standard | Title/artist/artwork for lock screen | Part of Media Session spec; single constructor call sets all fields |
| `setPositionState()` | Web standard | Drive lock-screen scrubber | Android Chrome 81+; the only way to expose a seekable scrubber to the OS |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | — | No npm packages needed; this phase is 100% Web APIs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct `/api/books/:id/cover` URL | Blob URL via fetch | No benefit — session cookie is valid during playback, direct URL is simpler and avoids memory leak risk from unreleased blob URLs |
| Chapter-scoped scrubber | Full-book scrubber | Full-book duration is more natural but chapter scoping matches D-04 and gives precise seeking within long chapters |

**Installation:** No installation required. Web APIs only.

---

## Architecture Patterns

### Recommended Project Structure
No new files beyond `public/images/default-cover.svg`. All changes in `public/index.html`.

### Pattern 1: MediaMetadata Initialization
**What:** Create a `MediaMetadata` object and assign to `navigator.mediaSession.metadata` when a book starts or chapter changes.
**When to use:** Inside `play()` method (new book) and in the `timeupdate` handler when `currentChapterIdx` changes.

```javascript
// Source: MDN MediaMetadata, verified 2026-03-22
function _setMediaMetadata() {
  if (!('mediaSession' in navigator) || !this.book) return
  const ch = this.currentChapter
  const chNum = this.currentChapterIdx + 1
  const title = ch
    ? `${this.book.title} -- Ch. ${chNum}: ${ch.title}`
    : this.book.title
  const coverSrc = this.book.cover_url ?? '/images/default-cover.svg'
  const coverType = this.book.cover_url ? 'image/jpeg' : 'image/svg+xml'
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: this.book.author ?? '',
    album: '',
    artwork: [
      { src: coverSrc, sizes: '96x96',   type: coverType },
      { src: coverSrc, sizes: '512x512', type: coverType },
    ],
  })
}
```

### Pattern 2: setPositionState with Chapter Scope
**What:** Call `setPositionState` every second with chapter-relative values.
**When to use:** In the 1s position interval, only when audio is playing and a book + chapters exist.

```javascript
// Source: MDN MediaSession.setPositionState, verified 2026-03-22
function _updatePositionState() {
  if (!('mediaSession' in navigator) || !this.book || !this.currentChapter) return
  const ch = this.currentChapter
  const chDuration = ch.end_sec - ch.start_sec
  const chPosition = Math.max(0, (window._spineAudio?.currentTime ?? 0) - ch.start_sec)
  // Guard: position must not exceed duration (can happen at chapter boundary)
  const safePosition = Math.min(chPosition, chDuration)
  try {
    navigator.mediaSession.setPositionState({
      duration: chDuration,
      playbackRate: window._spineAudio?.playbackRate ?? 1.0,
      position: safePosition,
    })
  } catch (e) {
    // Ignore stale-state errors at chapter transitions
  }
}
```

### Pattern 3: seekto Handler (chapter-relative to absolute)
**What:** Register `seekto` handler that translates `details.seekTime` (0 to chapter duration) back to absolute audio position.
**When to use:** Registered once alongside other Media Session handlers.

```javascript
// Source: MDN MediaSession.setActionHandler, verified 2026-03-22
navigator.mediaSession.setActionHandler('seekto', (details) => {
  const player = Alpine.store('player')
  if (!player.book || !player.currentChapter) return
  const ch = player.currentChapter
  const absoluteTime = ch.start_sec + details.seekTime
  player.seek(absoluteTime)
  player._updatePositionState()
})
```

### Pattern 4: Position Interval Lifecycle
**What:** Start/stop the 1s position interval in the same places as `saveInterval`.
**When to use:** `_startSaveInterval` / `_clearSaveInterval` calls are the integration points.

```javascript
// Alongside existing _startSaveInterval / _clearSaveInterval pattern
_startPositionInterval() {
  this._clearPositionInterval()
  this.positionInterval = setInterval(() => {
    if (this.playing) this._updatePositionState()
  }, 1000)
},
_clearPositionInterval() {
  if (this.positionInterval) {
    clearInterval(this.positionInterval)
    this.positionInterval = null
  }
},
```

### Pattern 5: Metadata Clear on Logout/Close
**What:** Set `navigator.mediaSession.metadata = null` when the user logs out or closes the player.
**When to use:** In the logout action (auth store) and wherever `$store.player.book` is set to null.

```javascript
if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = null
}
```

### Anti-Patterns to Avoid
- **Updating metadata on every `timeupdate` event:** `timeupdate` fires 4+ times per second. Only update when `currentChapterIdx` actually changes — compare with previous value.
- **Not guarding `setPositionState` with try/catch:** Chapter boundary transitions can briefly produce `position > duration` before `currentChapterIdx` advances, causing a `TypeError`.
- **Using `seekto` details.seekTime as absolute time:** It is chapter-relative (0 to chapter duration). Must add `chapter.start_sec` before seeking the audio element.
- **Updating position interval when paused:** The interval can run continuously but the `_updatePositionState` call should check `this.playing` to avoid stale updates.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OS lock screen integration | Custom native bridge | Media Session API | Web standard, zero dependencies, works in Android Chrome 81+ |
| Scrubber position tracking | Manual DOM update loop | `setPositionState` | The OS reads this directly; no other mechanism exposes a seekable scrubber |
| Cover art resizing | Canvas resize + blob | Serve original, declare sizes in artwork array | Browser/OS downscales; serving two separate sized images is unnecessary |

**Key insight:** The Media Session API is the only standardized way to expose playback controls to the OS. There is no alternative for Android Chrome lock-screen integration.

---

## Common Pitfalls

### Pitfall 1: setPositionState TypeError at Chapter Boundaries
**What goes wrong:** `setPositionState` throws `TypeError: Failed to execute 'setPositionState': position must be less than or equal to duration` when the 1s interval fires during a chapter transition where `currentTime` has advanced past the old chapter's `end_sec` but `currentChapterIdx` has not yet updated.
**Why it happens:** The `timeupdate` handler and the position interval are asynchronous; there is a brief window where `currentChapter` is stale.
**How to avoid:** Wrap `setPositionState` in try/catch, and also apply `Math.min(chPosition, chDuration)` before the call.
**Warning signs:** Console errors with "position must be less than or equal to duration" during chapter transitions.

### Pitfall 2: seekto receives chapter-relative time, not absolute
**What goes wrong:** Handler does `audio.currentTime = details.seekTime` — this seeks to near the beginning of the book because `details.seekTime` is 0 to chapter duration.
**Why it happens:** `setPositionState` told the OS the scrubber spans 0 to chapter duration, so the OS sends back values in that range.
**How to avoid:** Always compute `ch.start_sec + details.seekTime` before seeking.
**Warning signs:** Lock-screen seek jumps to near the start of the book instead of within the chapter.

### Pitfall 3: Metadata update on every timeupdate
**What goes wrong:** `new MediaMetadata(...)` and `navigator.mediaSession.metadata =` called 4+ times per second degrades performance and triggers unnecessary OS redraws.
**Why it happens:** Putting the metadata call inside `timeupdate` without a chapter-change gate.
**How to avoid:** Track previous `currentChapterIdx` and only update when it changes. Set metadata in `play()` for the initial book load, and gate updates in `timeupdate` on `newIdx !== this.currentChapterIdx`.
**Warning signs:** Jittery lock-screen title updates; high CPU in DevTools during playback.

### Pitfall 4: Cover art type mismatch
**What goes wrong:** Passing `type: 'image/jpeg'` for the SVG placeholder causes some OS implementations to ignore the artwork.
**Why it happens:** The default-cover fallback is SVG but the code reuses the JPEG type from the book cover path.
**How to avoid:** Use `this.book.cover_url ? 'image/jpeg' : 'image/svg+xml'` when building the artwork array.
**Warning signs:** Lock screen shows default OS music icon instead of placeholder on books without cover art.

### Pitfall 5: /public/images/ directory does not exist
**What goes wrong:** `serveStatic` returns 404 for `/images/default-cover.svg` even after the file is created if the directory was not created first.
**Why it happens:** `public/images/` does not currently exist in the repository.
**How to avoid:** Create `public/images/` directory and add `default-cover.svg` before testing. The existing `serveStatic` middleware already covers everything under `public/`.
**Warning signs:** 404 on `/images/default-cover.svg`; lock screen shows OS default icon.

---

## Code Examples

### Full setPositionState call (verified shape)
```javascript
// Source: MDN MediaSession.setPositionState — verified 2026-03-22
navigator.mediaSession.setPositionState({
  duration: chapterDuration,      // chapter end_sec - start_sec (positive number)
  playbackRate: audio.playbackRate, // current speed (>0, never 0)
  position: chapterRelativePos,   // audio.currentTime - chapter.start_sec (0 to duration)
})
```

### MediaMetadata constructor (verified shape)
```javascript
// Source: MDN MediaMetadata — verified 2026-03-22
navigator.mediaSession.metadata = new MediaMetadata({
  title: 'Book Title -- Ch. 3: Chapter Name',
  artist: 'Author Name',
  album: '',
  artwork: [
    { src: '/api/books/42/cover', sizes: '96x96',   type: 'image/jpeg' },
    { src: '/api/books/42/cover', sizes: '512x512', type: 'image/jpeg' },
  ],
})
```

### seekto handler (verified shape)
```javascript
// Source: MDN MediaSession.setActionHandler — verified 2026-03-22
navigator.mediaSession.setActionHandler('seekto', (details) => {
  // details.seekTime is chapter-relative (0 to chapter duration)
  // details.fastSeek is present during rapid scrub sequences
  const player = Alpine.store('player')
  const ch = player.currentChapter
  if (!ch) return
  window._spineAudio.currentTime = ch.start_sec + details.seekTime
})
```

### Default cover SVG (minimal safe spec)
```svg
<!-- public/images/default-cover.svg — no external refs, no scripts -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1e293b"/>
  <!-- icon paths here — color #94a3b8 -->
</svg>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No lock-screen integration for PWAs | Media Session API (W3C standard) | Chrome 57 (2017), full scrubber Android Chrome 81 (2020) | PWA can fully replace native app for lock-screen control |
| `updateState()` (early Media Session draft) | `setPositionState()` | Chrome 81 | Renamed and stabilized API |

**Deprecated/outdated:**
- `navigator.mediaSession.playbackState = 'playing'/'paused'`: Setting this manually is no longer needed — the browser infers playback state from the HTMLMediaElement. It still exists but is redundant.

---

## Open Questions

1. **iOS behavior**
   - What we know: REQUIREMENTS.md explicitly marks "iOS background audio continuity" as out of scope — platform limitation.
   - What's unclear: Whether `setPositionState` or `seekto` break silently or throw on iOS Safari during playback.
   - Recommendation: Wrap all Phase 5 additions in the existing `if ('mediaSession' in navigator)` guard; silent fail on iOS is acceptable per project scope.

2. **Chapter title when chapters array is empty**
   - What we know: `currentChapter` getter returns null when chapters array is empty; some .m4b files have no chapter markers (SCAN-05 fallback).
   - What's unclear: What title should appear if `currentChapter` is null.
   - Recommendation: Fall back to just the book title with no chapter info: `this.book.title`. `setPositionState` should not be called when `currentChapter` is null.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none — `bun test` auto-discovers `tests/**/*.test.ts` |
| Quick run command | `bun test tests/player.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOCK-01 | MediaMetadata title format `"Title -- Ch. N: Name"` | unit | `bun test tests/lock-screen.test.ts` | Wave 0 |
| LOCK-01 | Artwork array shape (src, sizes, type for cover + fallback) | unit | `bun test tests/lock-screen.test.ts` | Wave 0 |
| LOCK-02 | `seekto` handler maps chapter-relative time to absolute audio position | unit | `bun test tests/lock-screen.test.ts` | Wave 0 |
| LOCK-03 | `setPositionState` values: duration = chapter duration, position = chapter-relative offset | unit | `bun test tests/lock-screen.test.ts` | Wave 0 |
| LOCK-03 | position clamped to not exceed duration at chapter boundary | unit | `bun test tests/lock-screen.test.ts` | Wave 0 |

All LOCK requirements require physical Android device testing for final acceptance (lock screen does not appear in desktop DevTools — noted in STATE.md Blockers). Unit tests cover the pure calculation logic that can be extracted from player-utils.js.

### Sampling Rate
- **Per task commit:** `bun test tests/lock-screen.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lock-screen.test.ts` — covers LOCK-01, LOCK-02, LOCK-03 calculation logic
- [ ] New pure functions in `public/player-utils.js`: `buildMediaMetadata(book, chapterIdx)`, `chapterPositionState(chapter, currentTime, playbackRate)`, `seektoAbsolute(chapter, seekTime)` — extracted for testability following the established `module.exports` guard pattern

*(No new framework install needed — `bun:test` already in use)*

---

## Sources

### Primary (HIGH confidence)
- MDN MediaSession.setPositionState — https://developer.mozilla.org/en-US/docs/Web/API/MediaSession/setPositionState — verified call shape, exception conditions, 2026-03-22
- MDN MediaMetadata constructor — https://developer.mozilla.org/en-US/docs/Web/API/MediaMetadata/MediaMetadata — verified constructor params and artwork format, 2026-03-22
- MDN MediaSession.setActionHandler — https://developer.mozilla.org/en-US/docs/Web/API/MediaSession/setActionHandler — verified seekto details.seekTime shape and fastSeek field, 2026-03-22
- `public/index.html` (lines 692-713) — Phase 4 Media Session handler registration pattern
- `public/player-utils.js` — established module.exports guard pattern for shared pure functions
- `src/routes/cover.ts` — cover endpoint confirmed to serve `image/jpeg` (or Bun auto-detected MIME); returns 404 when no cover

### Secondary (MEDIUM confidence)
- STATE.md Blockers — "Phase 4: Media Session API requires physical Android device testing — desktop DevTools does not replicate lock-screen behavior" — context for manual testing requirement
- REQUIREMENTS.md — "iOS background audio continuity" explicitly out of scope

### Tertiary (LOW confidence)
None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Web APIs only, verified via MDN official docs
- Architecture: HIGH — Phase 4 patterns are directly reusable; setPositionState/seekto shapes verified
- Pitfalls: HIGH — TypeError conditions for setPositionState verified in MDN exceptions table; chapter-relative seekTime is a logical consequence of the setPositionState call shape

**Research date:** 2026-03-22
**Valid until:** 2026-09-22 (Media Session API is stable; 6 months is conservative)
