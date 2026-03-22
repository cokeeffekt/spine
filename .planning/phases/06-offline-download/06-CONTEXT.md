# Phase 6: Offline Download - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can download entire audiobooks for offline playback with full seeking support. This phase delivers: download button in detail view, progress overlay on cover art, Cache Storage for audio files, service worker range-request handling for offline seeking, storage management via library filter, cover art pre-caching, and offline browsing with grayed-out unavailable books.

</domain>

<decisions>
## Implementation Decisions

### Download trigger & location
- **D-01:** Download button appears in the book detail view only — next to the existing Play button. No download button on the library grid cards.
- **D-02:** Download button states: "Download" (not downloaded), progress overlay (downloading), "Downloaded ✓" with size (complete), "Delete Download" (management action).

### Download progress display
- **D-03:** Progress shown as semi-transparent overlay on the book's cover art with a circular or linear progress bar and percentage. Visible in both the library grid card and the detail view while download is active.
- **D-04:** Tapping the progress overlay on the cover art cancels the in-progress download and cleans up partial data.

### Download failure handling
- **D-05:** On failure (network drop, error), stop immediately, discard partial data, show error message. User must manually re-trigger download from the detail view. No auto-retry, no partial resume.

### Downloaded book indicators
- **D-06:** Small checkmark or download-complete icon badge in the corner of the cover art on library grid cards for downloaded books. Subtle but always visible.

### Storage management
- **D-07:** "Downloaded" filter toggle in the existing library search/filter bar area. When active, shows only downloaded books.
- **D-08:** When "Downloaded" filter is active, show total storage summary near the filter bar (e.g., "3 books — 1.2 GB").
- **D-09:** Per-book download size shown in the detail view for downloaded books.
- **D-10:** Delete confirmation uses native confirm() dialog: "Delete download for [Title]? (X MB)". Consistent with the book-switch confirmation pattern from Phase 4.

### Offline browsing experience
- **D-11:** When offline, full library loads from cached API response. Books not downloaded are visually dimmed/grayed out. Downloaded books appear normally with their badge.
- **D-12:** Tapping a grayed-out (undownloaded) book offline opens the detail view (from cached book data) but shows "Download required for offline playback" instead of the Play button. Download button shows "Available when online".
- **D-13:** Small cloud-off icon in the nav bar area when offline. Subtle, doesn't take vertical space. Disappears when connection returns.

### Cover art caching
- **D-14:** Service worker caches all cover images when the library is first fetched. Covers always available offline even for undownloaded books. Covers are small enough that this is negligible overhead.

### Claude's Discretion
- Service worker range-request implementation strategy for cached audio (OFFL-04)
- Cache Storage naming and organization
- navigator.storage.persist() request timing and UX
- Download overlay visual design (circular vs linear progress, exact styling)
- Badge icon design and positioning on cover art
- Online/offline detection mechanism (navigator.onLine + fetch probing)
- Whether to use Workbox CacheFirst or custom cache-put for audio files
- How the "Downloaded" filter toggle integrates with the existing search bar
- Cloud-off icon design

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Service worker (Phase 3 — extending)
- `public/sw.js` — Current Workbox service worker: precaches app shell, NetworkFirst for /api/* calls. Phase 6 must ADD audio caching routes and range-request handling without breaking existing routes.

### Audio streaming (Phase 2)
- `src/routes/audio.ts` — GET /api/books/:id/audio with HTTP 206 range support. Content-Type: audio/mp4. The service worker must replicate this range-request behavior from Cache Storage.

### Frontend (Phase 3 + 4)
- `public/index.html` — Alpine.js SPA with stores: `$store.auth`, `$store.app`, `$store.library`, `$store.player`. New download state likely needs a `$store.downloads` or extension of existing stores.
- `public/style.css` — CSS custom properties and component styles. Download overlays, badges, and offline states need new styles.

### Player integration (Phase 4)
- `public/player-utils.js` — Pure utility functions for player. Player reads audio from `/api/books/:id/audio` — offline playback must work transparently via service worker intercept.

### Project constraints
- `CLAUDE.md` §Technology Stack — Workbox 7.4.0 CDN via importScripts, no build step. Alpine.js 3.15.x CDN.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `public/sw.js` Workbox setup — already handles precaching and API NetworkFirst. Audio caching adds new routes to same file.
- `$store.library.books` array — can be cross-referenced with download state to determine badge display and gray-out logic.
- `$store.library.filteredBooks` getter — already handles search filtering, "Downloaded" filter can compose with this.
- `progressDB` IndexedDB pattern — download tracking state could follow same raw IndexedDB pattern (no library needed).
- Native confirm() pattern from Phase 4 book-switch — reuse for delete download confirmation.

### Established Patterns
- Alpine.js stores for cross-component state — downloads will need tracking state accessible from grid, detail view, and player.
- `x-show` for conditional rendering — used for view toggling, can conditionally show/hide download overlays and badges.
- Workbox CDN `importScripts` — no build step, strategies loaded via `workbox.strategies.*`.
- Cover art served from `/api/books/:id/cover` — service worker can intercept and cache these proactively.

### Integration Points
- Service worker: Add CacheFirst or custom route for `/api/books/:id/audio` (downloaded books only).
- Service worker: Add proactive cover art caching after library API response.
- Service worker: Handle range requests from Cache Storage for offline seeking (this is the hardest technical challenge).
- Detail view: Download button next to Play button, download status display, size info.
- Library grid: Badge overlay on cover art, gray-out logic when offline, progress overlay during download.
- Nav bar: Cloud-off icon for offline indicator.
- Filter bar: "Downloaded" toggle with storage summary.
- Player: Audio src remains `/api/books/:id/audio` — service worker transparently serves from cache when offline.

</code_context>

<specifics>
## Specific Ideas

- Progress overlay on cover art — visible in both grid and detail view during active download
- Cancel by tapping the overlay — simple gesture, no extra buttons needed
- Grayed-out books offline feel like "you can see them but can't play them" — encourages downloading
- Filter toggle rather than a whole separate downloads page — keeps it lightweight
- Storage summary only appears when filter is active — not cluttering the default view

</specifics>

<deferred>
## Deferred Ideas

- Server-side progress sync — v2 (SYNC-01, SYNC-02, SYNC-03)
- Per-chapter downloads — explicitly out of scope (REQUIREMENTS.md)
- Selective quality/bitrate for downloads — not in v1
- Background download with notification — browser API limitations make this unreliable in PWA
- Download queue for multiple books — could be added later, v1 does one at a time

</deferred>

---

*Phase: 06-offline-download*
*Context gathered: 2026-03-22*
