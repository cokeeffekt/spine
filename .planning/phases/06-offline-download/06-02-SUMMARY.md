---
phase: 06-offline-download
plan: "02"
subsystem: frontend-pwa
tags: [service-worker, workbox, alpine-store, offline, download, cache-storage, range-requests]
dependency_graph:
  requires: [06-01]
  provides: [sw-audio-cachefirst, sw-cover-cachefirst, downloads-store, download-ui, offline-indicators]
  affects: [public/sw.js, public/index.html, public/style.css]
tech_stack:
  added: []
  patterns: [Workbox-CacheFirst-RangeRequestsPlugin, Alpine-store-downloads, Fetch-ReadableStream-progress, AbortController-cancel, fire-and-forget-cover-cache]
key_files:
  created: []
  modified:
    - public/sw.js
    - public/index.html
    - public/style.css
key_decisions:
  - "audioCacheFirst strategy instantiated at top level of sw.js so workbox-sw auto-loads rangeRequests and cacheableResponse modules before registerRoute"
  - "Audio route registered before general /api/* NetworkFirst route — specific routes must precede catch-all to prevent offline audio falling through to NetworkFirst"
  - "chunks kept in local closure (not on reactive Alpine store) during streaming download — avoids Alpine proxy wrapping ArrayBuffers (Pitfall 6)"
  - "cacheAllCovers called fire-and-forget (no await) in both loadBooks() and session-restore paths — cover caching never blocks library rendering"
  - "isOffline state stored on $store.app with window online/offline listeners — consistent offline detection across all components"
metrics:
  duration: 3 minutes
  completed_date: "2026-03-22"
  tasks_completed: 2
  files_modified: 3
---

# Phase 06 Plan 02: Service Worker + Download System Summary

Workbox CacheFirst+RangeRequestsPlugin for offline audio, CacheFirst for cover art, Alpine $store.downloads managing full download lifecycle with Fetch streaming progress, and complete download UI with overlays, badges, and offline indicators.

## What Was Built

### Task 1: Service Worker Extensions (`public/sw.js`)

Three additions to the existing Workbox service worker:

1. **Audio route** — `CacheFirst` with `CacheableResponsePlugin({ statuses: [200] })` and `RangeRequestsPlugin()` on the `spine-audio` cache. Matches `/api/books/:id/audio` exactly. Transforms a full `200` cached response into `206` partial responses for seeking.

2. **Cover art route** — `CacheFirst` on the `spine-covers` cache. Matches `/api/books/:id/cover` exactly.

3. **Route ordering** — Audio and cover routes registered BEFORE the general `/api/*` NetworkFirst route. Specific routes must match first.

4. **Precache bump** — `index.html`, `style.css`, and `player-utils.js` revisions bumped to `'2'`. `player-utils.js` added to precache list.

Key implementation detail: The `audioCacheFirst` strategy object is instantiated at the top level of `sw.js` (before `registerRoute` calls) so that `workbox-sw` auto-loads the `rangeRequests` and `cacheableResponse` sub-packages on first use.

### Task 2: Alpine Store + Download UI (`public/index.html`, `public/style.css`)

**`$store.downloads` Alpine store:**
- `states: {}` — reactive map of `{ [bookId]: { status, progress, sizeBytes } }`
- `_controllers: {}` — non-reactive AbortController map (avoids Alpine proxying)
- `init()` — reconciles IndexedDB with Cache Storage on page load; cleans stale entries
- `cacheAllCovers(books)` — proactively fetches and caches all cover URLs that aren't cached yet into `spine-covers`; fire-and-forget error handling
- `startDownload(book)` — fetches full audio via ReadableStream, accumulates chunks in a local closure (not reactive state), reassembles into a Blob, stores as a full `200 Response` in `spine-audio` cache, saves to `downloadDB`
- `cancelDownload(bookId)` — aborts via AbortController, calls `_cleanup`
- `deleteDownload(book)` — native `confirm()` dialog with title and formatted size, then `_cleanup`
- `_cleanup(bookId)` — removes from both `spine-audio` cache and `downloadDB`

**`$store.app` extension:**
- `isOffline: !navigator.onLine` initial value
- `window.addEventListener('online/offline')` listeners update `$store.app.isOffline`

**Download UI in detail view:**
- Download button (idle/online state)
- Progress bar with percentage and Cancel button (downloading state)
- "Downloaded [size]" + Delete Download button (complete state)
- Error message + Retry button (error state)
- "Available when online" disabled button (idle/offline state)
- Play button conditionally hidden when offline and not downloaded; "Download required for offline playback" notice shown instead

**Library grid cards:**
- Progress overlay on cover art during active download (semi-transparent, shows %, tappable to cancel)
- Checkmark badge in bottom-right of cover for downloaded books

**Nav bar:**
- Cloud-off SVG icon in `.offline-indicator` shown when `$store.app.isOffline`

**Proactive cover caching:** `cacheAllCovers` called fire-and-forget in both `$store.library.loadBooks()` (after login) and the session-restore `x-init` block (on page reload while already logged in).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all download paths are fully wired. `downloadDB` (from Plan 01) is the real IndexedDB implementation. Cache Storage calls use the real browser Cache API via service worker.

## Self-Check: PASSED

Files verified:
- `public/sw.js` — contains `RangeRequestsPlugin`, `spine-audio`, `spine-covers`, audio route before /api/* route
- `public/index.html` — contains `Alpine.store('downloads'`, `cacheAllCovers`, `startDownload`, `cancelDownload`, `deleteDownload`, `_cleanup`, `isOffline`, `btn-download`, `download-overlay`, `downloaded-badge`, `offline-indicator`, `confirm('Delete download`, `Download required for offline playback`
- `public/style.css` — contains `.download-overlay`, `.downloaded-badge`, `.offline-indicator`

Commits verified:
- `36c6a89` — feat(06-02): extend service worker with audio CacheFirst+RangeRequestsPlugin and cover caching
- `2d9df8b` — feat(06-02): build $store.downloads Alpine store, download UI, and offline indicators
