# Phase 4: Player and Progress - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can listen to audiobooks with full player controls and resume from exactly where they left off. This phase delivers: persistent audio player with play/pause/seek/skip/speed/sleep timer, chapter navigation, keyboard shortcuts, and local-first progress tracking via IndexedDB with per-user isolation.

</domain>

<decisions>
## Implementation Decisions

### Player UI layout
- **D-01:** Persistent bottom bar visible whenever audio is playing. Stays visible across all views (library grid, book detail). Basic controls always shown: play/pause, book title, progress indicator.
- **D-02:** Bottom bar is expandable — tap/click to reveal full controls: playback speed selector, sleep timer, chapter list, seek bar. Collapsed bar shows the essentials only.
- **D-03:** "Go to title" button on the player bar — navigates to the current book's detail view from anywhere (e.g., while browsing library).
- **D-04:** Tapping a chapter in the detail view starts playback from that chapter immediately.
- **D-05:** Switching books while audio is playing requires a confirmation prompt ("Switch to [new title]? You'll lose your place in [current title]." — though position is auto-saved, so "lose" means interrupting, not data loss).

### Playback controls
- **D-06:** Play/pause toggle button. Skip forward +30s, skip backward -30s buttons.
- **D-07:** Playback speed via dropdown select. Options: 1.0x, 1.2x, 1.4x, 1.6x, 1.8x, 2.0x. Lives in the expanded player area. Speed preference is remembered locally per book (IndexedDB).
- **D-08:** Sleep timer control next to playback speed in the expanded player area. Presets: 5, 10, 15, 30, 60 minutes + "End of chapter". Hard stop when timer fires (no fade).
- **D-09:** Player shows: current chapter title, elapsed time, total duration. Seek bar for scrubbing within the current file.

### Progress persistence
- **D-10:** Auto-save position every 15 seconds while playing + on every pause event.
- **D-11:** Position stored in IndexedDB. Keyed by user ID + book ID. Stores: chapter index, timestamp (seconds), playback speed, last updated date.
- **D-12:** On book open/resume, restore from IndexedDB — seek to saved chapter and timestamp. If no saved position, start from beginning.
- **D-13:** Per-user isolation — each household member's progress is independent. User ID comes from `$store.auth` (set at login).

### Keyboard shortcuts (desktop)
- **D-14:** Spacebar toggles play/pause. Left arrow seeks back 10s, right arrow seeks forward 10s. Media keys (MediaPlayPause, MediaTrackNext, MediaTrackPrevious) work if available.

### Claude's Discretion
- Exact expanded player layout and animation (slide up, accordion, etc.)
- Seek bar styling and interaction (drag vs click)
- How chapter list displays in expanded player (same as detail view or compact)
- IndexedDB schema details (database name, store name, index structure)
- Confirmation dialog styling for book-switch prompt
- Whether sleep timer shows countdown in the player bar or only in expanded view
- How elapsed/remaining time is formatted during playback

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audio streaming (Phase 2)
- `src/routes/audio.ts` — GET /api/books/:id/audio with HTTP 206 range support. Content-Type: audio/mp4. Full file or byte-range slice.
- `src/routes/books.ts` — GET /api/books/:id returns chapters array with id, title, start_sec, end_sec

### Frontend (Phase 3)
- `public/index.html` — Alpine.js SPA with stores: `$store.auth` (loggedIn, username, role), `$store.app` (view), `$store.library` (books, selectedBook, selectBook). Detail view has disabled Play button to wire up. Chapter list already rendered with x-for.
- `public/style.css` — CSS custom properties (--color-accent: #e94560, --color-secondary: #1a1a2e, etc.), component styles. Player styles need to be added.
- `public/sw.js` — Workbox service worker. NetworkFirst for /api/* calls.

### Project constraints
- `CLAUDE.md` §Technology Stack — Alpine.js 3.15.x CDN, no build step. Workbox 7.4.0 CDN.
- `CLAUDE.md` §Constraints — No heavy framework, no build step required.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `$store.library.selectedBook` already holds full book data including chapters array — player can read directly from this store
- `$store.auth.username` available for per-user IndexedDB keying (or user ID if available)
- `formatDuration()` and `formatChapterDuration()` utility functions already in index.html
- CSS custom properties for consistent dark theme styling
- Audio endpoint returns `audio/mp4` with proper range support — HTML5 `<audio>` element can stream directly

### Established Patterns
- Alpine.js stores for cross-component state — player will need a new `$store.player` store
- `x-show` for view toggling — player bar is always-visible, not a view toggle
- All API calls check for 401 and redirect to login — player API calls should follow same pattern
- Inline `<script>` before Alpine CDN tag for store registration

### Integration Points
- Detail view Play button: currently `<button class="btn-play-disabled" disabled>` — needs to become active and wire to `$store.player.play(book)`
- Chapter list rows: currently display-only — need `@click` to trigger `$store.player.jumpToChapter(chapter)`
- `<audio>` element: new HTML element, src set to `/api/books/:id/audio`, use `currentTime` for seeking
- IndexedDB: new browser API usage — no existing IndexedDB code in the project

</code_context>

<specifics>
## Specific Ideas

- Basic player bar always visible when playing; expand for full controls (speed, sleep, chapters)
- "Go to title" button to navigate to current book's detail view from library
- Confirmation prompt when switching books mid-playback
- Hard stop on sleep timer (no fade out)
- Speed remembered per book, not globally

</specifics>

<deferred>
## Deferred Ideas

- Media Session API for lock-screen controls — Phase 5
- Offline audio download and cached playback — Phase 6
- Server-side progress sync — v2 (SYNC-01, SYNC-02, SYNC-03)
- Chapter scrubber with visual boundary markers — v2 (LIBE-03)
- Admin user management UI — future phase

</deferred>

---

*Phase: 04-player-and-progress*
*Context gathered: 2026-03-22*
