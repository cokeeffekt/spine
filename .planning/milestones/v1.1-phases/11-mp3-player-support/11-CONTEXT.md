# Phase 11: MP3 Player Support - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Make MP3 audiobooks play seamlessly in the existing player — automatic track transitions, cross-track seeking via chapter navigation, chapter markers reflecting track boundaries, and offline download support for multi-file MP3 books. The player already handles .m4b single-file playback; this phase extends it to handle MP3 books where each chapter is a separate file.

</domain>

<decisions>
## Implementation Decisions

### Track Transitions
- **D-01:** Sequential load on track end. When an MP3 track finishes (`ended` event), the player swaps `src` to the next track's URL, calls `load()` + `play()`. Brief silence (~200-500ms) between tracks is acceptable — audiobooks have natural chapter pauses.
- **D-02:** No visual loading indicator during track transitions. The brief silence is sufficient feedback. Keep it simple.
- **D-03:** No preloading or dual-element approach. Single `<audio>` element, sequential source swapping.

### Audio Endpoint
- **D-04:** New endpoint: `GET /api/books/:id/audio/:chapterIdx` — looks up the chapter's `file_path` from the chapters table, serves that .mp3 file with HTTP 206 range support (same pattern as existing m4b route). Existing `/api/books/:id/audio` stays unchanged for .m4b books.
- **D-05:** Add a `format` field to the book detail API response (`'m4b'` or `'mp3'`). Frontend uses this to decide playback strategy (single-file vs multi-track). Do NOT expose raw server file_path to the client.
- **D-06:** Content-Type for MP3 tracks: `audio/mpeg` (not `audio/mp4`).

### Seek Bar & Cross-Track Seeking
- **D-07:** Seek bar stays chapter-scoped (same as m4b). No whole-book seek bar. User navigates between tracks via the chapter list or skip buttons.
- **D-08:** Chapter jump for MP3 books: `jumpToChapter` swaps the audio `src` to the target track's URL and plays from the beginning (or from a specific offset if resuming). Same UX as m4b chapter jump, just with a source swap instead of a seek.
- **D-09:** The `timeupdate` handler needs to track position within the current track file (not the virtual cumulative timeline) for seek bar accuracy. Progress saving continues to use the cumulative virtual timeline for cross-session resume.

### Offline Download
- **D-10:** Extend offline download to work for MP3 books in this phase. When user downloads an MP3 book, cache all track URLs (`/api/books/:id/audio/0`, `/api/books/:id/audio/1`, etc.). Feature parity with m4b download.
- **D-11:** Download progress shows overall progress only (tracks downloaded / total tracks). Consistent with m4b download UX which shows one progress bar.
- **D-12:** Service worker routing: add a CacheFirst rule for `/api/books/:id/audio/:chapterIdx` alongside the existing rule for `/api/books/:id/audio`.

### Claude's Discretion
- How to detect MP3 vs m4b mode in the player store (use format field from API, or check chapters for file_path presence)
- Whether to add a `trackUrl(chapterIdx)` helper or inline the URL construction
- How to handle edge cases: last track ends (book complete), seeking past end of track, corrupt/missing individual track files
- Progress save format adjustments (if any) for MP3 books — current format stores chapter index + timestamp, which should work as-is with cumulative timestamps
- Whether `ended` event handler checks format before attempting track advance (m4b `ended` = book done, mp3 `ended` = next track)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Player (Phase 4)
- `public/index.html` lines 1059-1220 — `$store.player` Alpine store: play(), jumpToChapter(), initAudio(), seek(), skip(), togglePlay(), _saveProgress()
- `.planning/phases/04-player-and-progress/04-CONTEXT.md` — Player UI decisions (D-01 through D-14)

### Audio Streaming (Phase 2)
- `src/routes/audio.ts` — Current GET /api/books/:id/audio with HTTP 206 range support. Serves book.file_path as single file. Content-Type: audio/mp4.
- `src/routes/books.ts` — GET /api/books/:id returns book detail with chapters (currently excludes file_path from chapters query)

### MP3 Scanner (Phase 10)
- `src/scanner/mp3-sort.ts` — parseTrackNumber, sortTracks, parseDiscNumber
- `src/db/schema.ts` — chapters.file_path nullable column (NULL for m4b, populated for MP3 tracks)
- `src/types.ts` — NormalizedChapter.file_path?, Chapter.file_path
- `.planning/phases/10-mp3-folder-scanner/10-CONTEXT.md` — Scanner decisions (D-01 through D-14)

### Offline Download (Phase 6)
- `public/index.html` — Download functions in the library store (downloadBook, deleteDownload)
- `public/sw.js` — Workbox service worker with CacheFirst for audio, NetworkFirst for API
- `.planning/phases/06-offline-download/06-CONTEXT.md` — Offline decisions

### Progress Sync (Phase 9)
- `public/index.html` — progressDB IndexedDB store, _saveProgress(), server sync
- `.planning/phases/09-progress-sync-and-tiles/09-CONTEXT.md` — Sync decisions

### Requirements
- `.planning/REQUIREMENTS.md` — PLAY-09 (multi-file track transitions), PLAY-10 (cross-track seeking)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `$store.player` Alpine store — full playback state machine with play/pause/seek/skip/chapter-jump. Needs branching logic for MP3 format, not a rewrite.
- `getCurrentChapterIdx(currentTime, chapters)` — Maps playback time to chapter index using cumulative timestamps. Works for both formats since MP3 chapters have cumulative start_sec/end_sec.
- `progressDB` IndexedDB wrapper — Stores chapter index + timestamp. Compatible as-is since MP3 books use cumulative timestamps.
- Audio route pattern in `src/routes/audio.ts` — Range request handling can be extracted/reused for the new track endpoint.
- Download functions in library store — Currently cache one URL per book. Need to loop over track count for MP3 books.

### Established Patterns
- Alpine.js stores for cross-component state — player store is the integration point
- `el.addEventListener('ended', ...)` — Currently marks playback as stopped. Needs format-aware branching.
- `el.src = '/api/books/' + book.id + '/audio'` — Single source pattern. MP3 needs `/audio/${chapterIdx}` variant.
- Service worker uses `workbox.routing.registerRoute` with URL pattern matching and `CacheFirst` strategy

### Integration Points
- `play(book)` — Needs to check book.format and set initial src accordingly (m4b: `/audio`, mp3: `/audio/0`)
- `jumpToChapter(chapterIdx)` — For MP3: swap src to `/audio/${chapterIdx}`, load, play. For m4b: seek to start_sec (existing).
- `ended` event listener — For MP3: advance to next track. For m4b: book complete (existing).
- Books API detail response — Add `format` field derived from whether chapters have file_path
- Audio route file — Add new route handler for `/books/:id/audio/:chapterIdx`
- Service worker — Add route for per-track audio URLs
- Download function — Branch on format to cache N track URLs instead of one

</code_context>

<specifics>
## Specific Ideas

- Keep the player UX identical between m4b and mp3 books — user shouldn't notice a difference except the brief silence at track transitions
- The cumulative timestamps from Phase 10 are the bridge — they let progress tracking, chapter display, and the seek bar work identically across formats
- Format detection via API response field keeps server paths private and gives the frontend a clean branching signal

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-mp3-player-support*
*Context gathered: 2026-03-24*
