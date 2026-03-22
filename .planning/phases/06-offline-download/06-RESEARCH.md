# Phase 6: Offline Download - Research

**Researched:** 2026-03-22
**Domain:** Service Worker (Workbox), Cache Storage API, ReadableStream progress tracking, offline UX
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Download trigger & location**
- D-01: Download button appears in the book detail view only — next to the existing Play button. No download button on library grid cards.
- D-02: Download button states: "Download" (not downloaded), progress overlay (downloading), "Downloaded ✓" with size (complete), "Delete Download" (management action).

**Download progress display**
- D-03: Progress shown as semi-transparent overlay on the book's cover art with a circular or linear progress bar and percentage. Visible in both the library grid card and the detail view while download is active.
- D-04: Tapping the progress overlay on the cover art cancels the in-progress download and cleans up partial data.

**Download failure handling**
- D-05: On failure (network drop, error), stop immediately, discard partial data, show error message. User must manually re-trigger download from the detail view. No auto-retry, no partial resume.

**Downloaded book indicators**
- D-06: Small checkmark or download-complete icon badge in the corner of the cover art on library grid cards for downloaded books. Subtle but always visible.

**Storage management**
- D-07: "Downloaded" filter toggle in the existing library search/filter bar area. When active, shows only downloaded books.
- D-08: When "Downloaded" filter is active, show total storage summary near the filter bar (e.g., "3 books — 1.2 GB").
- D-09: Per-book download size shown in the detail view for downloaded books.
- D-10: Delete confirmation uses native confirm() dialog: "Delete download for [Title]? (X MB)". Consistent with the book-switch confirmation pattern from Phase 4.

**Offline browsing experience**
- D-11: When offline, full library loads from cached API response. Books not downloaded are visually dimmed/grayed out. Downloaded books appear normally with their badge.
- D-12: Tapping a grayed-out (undownloaded) book offline opens the detail view (from cached book data) but shows "Download required for offline playback" instead of the Play button. Download button shows "Available when online".
- D-13: Small cloud-off icon in the nav bar area when offline. Subtle, doesn't take vertical space. Disappears when connection returns.

**Cover art caching**
- D-14: Service worker caches all cover images when the library is first fetched. Covers always available offline even for undownloaded books. Covers are small enough that this is negligible overhead.

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

### Deferred Ideas (OUT OF SCOPE)

- Server-side progress sync (SYNC-01, SYNC-02, SYNC-03)
- Per-chapter downloads (explicitly out of scope in REQUIREMENTS.md)
- Selective quality/bitrate for downloads
- Background download with notification (browser API limitations)
- Download queue for multiple books (v1 does one at a time)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OFFL-01 | User can download an entire audiobook for offline playback | Fetch API + ReadableStream for progress tracking; cache.put() to store full response in Cache Storage |
| OFFL-02 | Downloaded books are stored in Cache Storage and playable without network | Workbox CacheFirst route for `/api/books/:id/audio` with RangeRequestsPlugin; service worker intercepts audio element src requests transparently |
| OFFL-03 | User can see which books are downloaded and manage storage | IndexedDB download-state store tracks per-book download metadata (size, timestamp); navigator.storage.estimate() for total; cache.delete() to remove |
| OFFL-04 | Service worker handles range requests for cached audio (seeking works offline) | workbox.rangeRequests.RangeRequestsPlugin — the only correct approach; browser audio element fires Range header requests; plugin slices cached full response to satisfy 206 Partial Content |
</phase_requirements>

---

## Summary

Phase 6 adds offline download and playback to Spine. The core technical challenge is OFFL-04: the browser's `<audio>` element always requests audio via HTTP Range headers (e.g., `Range: bytes=0-`), but Cache Storage cannot store 206 Partial Content responses. The solution is to download the full audio file as a single 200 response via the Fetch API (not via the audio element), store it with `cache.put()`, then intercept all subsequent audio requests in the service worker and use Workbox's `RangeRequestsPlugin` to slice the cached full response into the requested byte range on-the-fly. This is the only correct approach — trying to cache 206 responses fails silently.

Download progress tracking is done in the main page (not the service worker) using the Fetch API's `response.body` ReadableStream. The page fetches `/api/books/:id/audio` directly, reads chunks counting bytes, updates Alpine's `$store.downloads`, and when complete calls `cache.open().then(c => c.put(...))` to store the full response. Cancel is handled by calling `reader.cancel()` followed by `cache.delete()` to discard partial data.

The Alpine `$store.downloads` object tracks per-book state (status: 'idle'|'downloading'|'complete', progress 0–1, sizeBytes). Download metadata (which books are cached, their byte sizes) is persisted in IndexedDB so the state survives page reload. The service worker only handles playback interception (range requests) — it does not participate in download progress communication.

**Primary recommendation:** Download via `fetch()` + ReadableStream in the page; persist full response with `cache.put()`; serve offline via Workbox CacheFirst + RangeRequestsPlugin.

---

## Standard Stack

### Core (no new npm packages needed — all existing or CDN)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Workbox `workbox-range-requests` | 7.4.0 (CDN) | Slice cached full response to satisfy Range header requests | The only correct solution for offline audio seeking from Cache Storage. Already loaded via `workbox-sw` CDN `importScripts`. |
| Workbox `workbox-strategies` | 7.4.0 (CDN) | CacheFirst strategy for audio route | Already loaded via `workbox-sw`. |
| Fetch API (browser built-in) | — | Stream audio download with progress | `response.body` ReadableStream gives byte-level progress without any library. |
| Cache Storage API (browser built-in) | — | Store full audio responses for offline | `cache.put(request, response)` — stores 200 response that RangeRequestsPlugin can slice. |
| IndexedDB (browser built-in, raw API) | — | Persist download state across page reloads | Follows existing `progressDB` pattern from Phase 4. No library needed. |
| `navigator.storage` (browser built-in) | — | Estimate used storage; request persistence | `navigator.storage.estimate()` for size display; `navigator.storage.persist()` to prevent eviction. |

### No New npm Dependencies

All functionality is achievable with existing Workbox CDN (already in sw.js), the Fetch API, Cache Storage API, and IndexedDB. The backend requires no changes — audio is served from `/api/books/:id/audio` unchanged.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fetch API + ReadableStream for download | Background Fetch API | Background Fetch shows OS-level download UI but is not available in all browsers and requires more complex service worker coordination. Deferred per CONTEXT.md. |
| `cache.put()` full response | IndexedDB Blob storage | IndexedDB Blobs work but are inaccessible from the service worker's Cache Storage API — the audio element's src URL won't be intercepted. Cache Storage is the only store the service worker can transparently intercept. |
| RangeRequestsPlugin | Custom range-slice logic | ~40 lines of custom code replicating exactly what RangeRequestsPlugin does. Not worth it given Workbox is already loaded. |
| BroadcastChannel for SW→page messaging | MessageChannel / postMessage | Not needed — download runs entirely in the page via fetch(). No SW→page messaging required for progress. |

---

## Architecture Patterns

### Recommended Project Structure (additions)

```
public/
├── sw.js               # EXTEND: add audio CacheFirst+RangeRequests, cover caching
├── index.html          # EXTEND: $store.downloads, download button, progress overlay,
│                       #         badge, offline indicator, "Downloaded" filter
├── player-utils.js     # EXTEND: downloadDB helpers (follows progressDB pattern)
└── style.css           # EXTEND: .download-overlay, .downloaded-badge, .offline-dim,
                        #         .offline-indicator, .downloaded-filter, .storage-summary
```

No new files strictly required. All new logic fits in the existing four public files, following established patterns.

### Pattern 1: Service Worker — CacheFirst with RangeRequestsPlugin

**What:** Register a Workbox route for audio URLs that uses CacheFirst strategy with RangeRequestsPlugin. Only downloaded books have a cache entry; non-downloaded books fall through to the network normally.

**When to use:** Always — this is the only way to serve cached audio to the `<audio>` element with seeking support.

```javascript
// In public/sw.js — ADD after existing routes

// Audio: CacheFirst for downloaded books, with range-request slicing for seeking
workbox.routing.registerRoute(
  ({ url }) => url.pathname.match(/^\/api\/books\/\d+\/audio$/),
  new workbox.strategies.CacheFirst({
    cacheName: 'spine-audio',
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [200] }),
      new workbox.rangeRequests.RangeRequestsPlugin(),
    ],
  })
)

// Cover art: CacheFirst, populated proactively after library load
workbox.routing.registerRoute(
  ({ url }) => url.pathname.match(/^\/api\/books\/\d+\/cover$/),
  new workbox.strategies.CacheFirst({ cacheName: 'spine-covers' })
)
```

**CRITICAL:** The `CacheableResponsePlugin({ statuses: [200] })` is required. Without it, Workbox may refuse to cache the response. The full 200 response must be in cache before the browser makes a Range request; the plugin then synthesizes the 206 response from the cached bytes.

**Source:** https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video

### Pattern 2: Download Flow — Fetch + ReadableStream in the Page

**What:** Trigger download from the Alpine store (not the service worker). Use `fetch()` on `/api/books/:id/audio`, read `response.body` as a ReadableStream to track byte-level progress, then store the complete response in Cache Storage.

**When to use:** When user taps the Download button (D-01).

```javascript
// In $store.downloads.startDownload(book)
async startDownload(book) {
  if (this.states[book.id]?.status === 'downloading') return
  this._setStatus(book.id, 'downloading', 0)

  const controller = new AbortController()
  this._controllers[book.id] = controller

  try {
    const res = await fetch('/api/books/' + book.id + '/audio', {
      signal: controller.signal
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)

    const totalBytes = parseInt(res.headers.get('Content-Length') || '0', 10)
    const reader = res.body.getReader()
    const chunks = []
    let loaded = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.byteLength
      const progress = totalBytes > 0 ? loaded / totalBytes : 0
      this._setStatus(book.id, 'downloading', progress)
    }

    // Reassemble and store in Cache Storage
    const blob = new Blob(chunks, { type: 'audio/mp4' })
    const fullResponse = new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mp4',
        'Content-Length': String(loaded),
        'Accept-Ranges': 'bytes',
      }
    })
    const cache = await caches.open('spine-audio')
    await cache.put('/api/books/' + book.id + '/audio', fullResponse)

    // Persist download state to IndexedDB
    await downloadDB.save(book.id, { sizeBytes: loaded, downloadedAt: Date.now() })
    this._setStatus(book.id, 'complete', 1, loaded)

  } catch (err) {
    if (err.name === 'AbortError') {
      // User cancelled — cleanup already done in cancelDownload()
    } else {
      this._setStatus(book.id, 'error')
      await this._cleanup(book.id)
    }
  } finally {
    delete this._controllers[book.id]
  }
}
```

**Source:** https://javascript.info/fetch-progress (ReadableStream chunk reading pattern)

### Pattern 3: Cancel Download

**What:** Abort the in-flight fetch and remove any partial data from Cache Storage.

```javascript
async cancelDownload(bookId) {
  const controller = this._controllers[bookId]
  if (controller) controller.abort()
  await this._cleanup(bookId)
  this._setStatus(bookId, 'idle', 0)
},

async _cleanup(bookId) {
  const cache = await caches.open('spine-audio')
  await cache.delete('/api/books/' + bookId + '/audio')
  await downloadDB.delete(bookId)
}
```

**Source:** https://developer.chrome.com/blog/abortable-fetch

### Pattern 4: downloadDB — IndexedDB for Download State Persistence

**What:** A minimal IndexedDB wrapper following the existing `progressDB` pattern (Phase 4). Stores per-book download metadata so the UI knows which books are downloaded after page reload.

```javascript
// In public/player-utils.js — ADD alongside existing progressDB pattern
const downloadDB = (() => {
  const DB_NAME = 'spine-downloads'
  const DB_VERSION = 1
  const STORE = 'downloads'
  let _db = null

  function open() {
    if (_db) return Promise.resolve(_db)
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE)
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db) }
      req.onerror = (e) => reject(e.target.error)
    })
  }

  async function get(bookId) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(String(bookId))
      req.onsuccess = (e) => resolve(e.target.result || null)
      req.onerror = (e) => reject(e.target.error)
    })
  }

  async function getAll() {
    const db = await open()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      req.onsuccess = (e) => resolve(e.target.result || [])
      req.onerror = (e) => reject(e.target.error)
    })
  }

  async function save(bookId, data) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(data, String(bookId))
      req.onsuccess = () => resolve()
      req.onerror = (e) => reject(e.target.error)
    })
  }

  async function del(bookId) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(String(bookId))
      req.onsuccess = () => resolve()
      req.onerror = (e) => reject(e.target.error)
    })
  }

  return { open, get, getAll, save, delete: del }
})()
```

### Pattern 5: Alpine $store.downloads Structure

**What:** New Alpine store tracking per-book download state. Initialized from IndexedDB on page load so state survives refresh.

```javascript
Alpine.store('downloads', {
  // { [bookId]: { status: 'idle'|'downloading'|'complete'|'error', progress: 0-1, sizeBytes: number } }
  states: {},
  // { [bookId]: AbortController } — not reactive, stored on 'this' directly
  _controllers: {},
  showDownloadedOnly: false,

  async init() {
    // Restore state from IndexedDB
    const all = await downloadDB.getAll()
    for (const entry of all) {
      // entry keys are bookId strings, values are { sizeBytes, downloadedAt }
      // We need bookId from the cursor key — getAll returns values only
      // Pattern: store { bookId, sizeBytes, downloadedAt } as value so getAll works
    }
  },

  isDownloaded(bookId) { return this.states[bookId]?.status === 'complete' },
  isDownloading(bookId) { return this.states[bookId]?.status === 'downloading' },
  getProgress(bookId) { return this.states[bookId]?.progress ?? 0 },
  getSizeBytes(bookId) { return this.states[bookId]?.sizeBytes ?? 0 },

  _setStatus(bookId, status, progress = 0, sizeBytes = 0) {
    this.states[bookId] = { status, progress, sizeBytes }
  }
})
```

**Note:** Store `{ bookId, sizeBytes, downloadedAt }` as the IndexedDB value (bookId included in value) so `getAll()` returns self-describing records without needing cursor key access.

### Pattern 6: Cover Art Proactive Caching

**What:** After the library API response is cached (NetworkFirst), extract all cover URLs and cache them proactively. Done in the service worker's fetch handler by intercepting the `/api/books` response.

```javascript
// In sw.js — override the api-cache NetworkFirst route to also cache covers
workbox.routing.registerRoute(
  ({ url }) => url.pathname === '/api/books',
  async ({ request, event }) => {
    const networkFirst = new workbox.strategies.NetworkFirst({ cacheName: 'api-cache' })
    const response = await networkFirst.handle({ request, event })
    // Proactively cache cover art for all books
    if (response && response.ok) {
      const books = await response.clone().json().catch(() => [])
      const coverCache = await caches.open('spine-covers')
      for (const book of books) {
        if (book.cover_url) {
          const coverReq = new Request(book.cover_url)
          const cached = await coverCache.match(coverReq)
          if (!cached) {
            fetch(coverReq).then(r => { if (r.ok) coverCache.put(coverReq, r) }).catch(() => {})
          }
        }
      }
    }
    return response
  }
)
```

**Simpler alternative:** Register a separate CacheFirst route for `/api/books/:id/cover` (covers are always small). First visit online caches them; subsequent visits served from cache. This is simpler and avoids intercepting the book list response.

**Recommendation:** Use the simpler CacheFirst route for covers. The service worker naturally caches covers on first visit to the library. This satisfies D-14 without complex service worker logic.

### Pattern 7: Offline Detection

**What:** Combine `navigator.onLine` with event listeners on `window` 'online'/'offline'. Update a reactive flag in `$store.app` or `$store.downloads`.

```javascript
// In Alpine store init or document.addEventListener('alpine:init')
Alpine.store('app', {
  view: 'login',
  isOffline: !navigator.onLine
})

window.addEventListener('online', () => { Alpine.store('app').isOffline = false })
window.addEventListener('offline', () => { Alpine.store('app').isOffline = true })
```

`navigator.onLine` is not 100% reliable (can be true while on a captive portal), but is sufficient for this use case. The audio element will fail with a network error if offline regardless.

### Pattern 8: Storage Size Display

**What:** Use `navigator.storage.estimate()` for total used; use size stored in `downloadDB` for per-book display (more precise than re-reading blobs).

```javascript
// For total storage summary (D-08)
async getTotalStorageBytes() {
  let total = 0
  for (const state of Object.values(this.states)) {
    if (state.status === 'complete') total += state.sizeBytes
  }
  return total
}

// Format bytes
function formatBytes(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + ' MB'
  return (bytes / 1e3).toFixed(0) + ' KB'
}
```

Store `sizeBytes` in the `states` object (populated from IndexedDB on init) so no async cache.blob() iteration is needed per render.

### Anti-Patterns to Avoid

- **Caching the audio element's initial 206 response:** The browser sends `Range: bytes=0-` on first audio load. The service worker MUST NOT cache this 206 response. Always download via explicit `fetch()` with no Range header to get a 200 response. The `CacheableResponsePlugin({ statuses: [200] })` acts as a guard.
- **Downloading via an invisible audio element:** Setting `<audio>` src and relying on its preload to populate cache does not work — the browser sends Range requests and the responses cannot be stored in Cache Storage as-is.
- **Fetching inside the service worker's install handler for large files:** Audio files are large (100MB+). Fetching them inside `install` would block service worker activation and time out.
- **Using BroadcastChannel for SW→page progress:** Not needed in this design (download runs in page). BroadcastChannel also has Safari gotchas. Avoid the complexity.
- **Reading blobs from cache for size calculation every render:** Too slow for a reactive Alpine getter. Pre-compute and store `sizeBytes` in the downloadDB record and Alpine state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Serving 206 range responses from cache | Custom byte-slice logic | `workbox.rangeRequests.RangeRequestsPlugin` | Handles all edge cases: open-ended ranges `bytes=X-`, multi-range requests, out-of-range 416 responses, Content-Range header construction. ~40 lines of correct code from Workbox vs. likely-wrong custom code. |
| Offline audio playback | Special offline audio URL | Service worker transparent interception of `/api/books/:id/audio` | Audio element src stays exactly `/api/books/:id/audio` — the SW intercepts and serves from cache. Zero change to player code. |
| Progress bar | Canvas drawing | CSS `conic-gradient` or `<progress>` element with CSS | Native browser element or single CSS property. |

**Key insight:** The browser's audio handling is opaque. You cannot make the audio element "use a different URL when offline" — you must intercept at the network layer (service worker). This is exactly what the SW/Workbox approach provides.

---

## Common Pitfalls

### Pitfall 1: Caching 206 Partial Responses
**What goes wrong:** Service worker route intercepts the audio element's first request (which sends `Range: bytes=0-` getting a 206), tries to cache it, and the cached 206 cannot satisfy subsequent range requests for different byte ranges.
**Why it happens:** Browsers proactively send Range headers for audio — even the first request. The `CacheFirst` strategy would cache the 206, but `RangeRequestsPlugin` can only slice a full 200 response.
**How to avoid:** Always download via explicit `fetch()` without Range header (page-side `fetch('/api/books/:id/audio')`) — server returns 200. Store via `cache.put()`. The `CacheableResponsePlugin({ statuses: [200] })` ensures only 200 responses get cached by Workbox routes.
**Warning signs:** Audio plays the first few seconds offline then stalls/errors on seek.

### Pitfall 2: workbox-sw Module Auto-Loading Timing
**What goes wrong:** `workbox.rangeRequests.RangeRequestsPlugin` referenced inside a function (e.g., a route handler callback) instead of at top level — `workbox-sw` lazy-loads modules only during synchronous top-level or install-handler execution. The module may not be loaded in time.
**Why it happens:** `workbox-sw` CDN auto-loads sub-modules on first reference, but only if accessed at the right time in the SW lifecycle.
**How to avoid:** Reference all Workbox strategy/plugin classes at the TOP LEVEL of sw.js, before any `addEventListener`. Alternatively use `workbox.loadModule('workbox-range-requests')` explicitly.
**Warning signs:** `workbox.rangeRequests is undefined` errors in sw.js console.

### Pitfall 3: Content-Length Missing Breaks Progress Bar
**What goes wrong:** The server returns audio without a `Content-Length` header (e.g., chunked transfer encoding). `totalBytes = parseInt(res.headers.get('Content-Length'))` returns 0, causing `progress = loaded / totalBytes` to be NaN or Infinity.
**Why it happens:** Some HTTP servers or proxies strip Content-Length for large files.
**How to avoid:** Check the existing `audio.ts` — it explicitly sets `Content-Length: String(totalSize)`. Verify this is preserved. Add defensive check: if `totalBytes === 0`, show indeterminate progress spinner instead of percentage.
**Warning signs:** Progress always shows 0% or NaN.

### Pitfall 4: navigator.storage.persist() Timing
**What goes wrong:** Calling `navigator.storage.persist()` before the user has interacted with the app returns `false` on many browsers (Chrome auto-denies if app is not "engaged"). Showing UI feedback for a denied persist call confuses users.
**Why it happens:** Chrome's persist heuristic requires PWA install or repeated visits.
**How to avoid:** Call `navigator.storage.persist()` silently when the user starts their first download. Don't show UI feedback for the result. Cache Storage data is evicted only under extreme storage pressure — practical risk is low.
**Warning signs:** `persist()` always returns `false` in testing.

### Pitfall 5: Cache Storage Eviction Without Persistence
**What goes wrong:** On mobile devices with low storage, the browser may evict Cache Storage entries (including downloaded audio) without warning. User discovers their offline book is gone when needed.
**Why it happens:** Without `navigator.storage.persist()`, Cache Storage is "best-effort" and subject to LRU eviction.
**How to avoid:** Call `navigator.storage.persist()` on first download. Reconcile downloadDB state with actual Cache Storage contents on app init (verify cache entry exists before marking book as downloaded).
**Warning signs:** Book shows "Downloaded" badge but audio errors when played offline.

### Pitfall 6: Alpine Reactivity with Large Byte Arrays
**What goes wrong:** Storing `chunks` (array of `Uint8Array`) directly on an Alpine reactive store triggers Alpine's deep proxy on every chunk push — for a 500MB book this means thousands of proxy wraps per second, causing severe UI lag.
**Why it happens:** Alpine's reactivity system wraps all objects. Typed arrays in reactive state trigger full object traversal.
**How to avoid:** Keep `chunks` as a local variable inside the `startDownload` method (closure), not on the reactive store. Only update the reactive `progress` number in the store.
**Warning signs:** UI freezes during download of large files.

### Pitfall 7: Delete Without Cache Cleanup
**What goes wrong:** User deletes a download (IndexedDB record removed, Alpine state cleared) but the Cache Storage entry for `/api/books/:id/audio` is not deleted. The book appears undownloaded but the service worker still serves it from cache — wasting storage.
**Why it happens:** Two storage locations must be kept in sync: IndexedDB (metadata) and Cache Storage (actual data).
**How to avoid:** `_cleanup(bookId)` must always delete BOTH: `await downloadDB.delete(bookId)` AND `await cache.delete('/api/books/' + bookId + '/audio')`. This is a two-step atomic-ish operation — do both in the same function.
**Warning signs:** `navigator.storage.estimate()` shows high usage after "deleting" all downloads.

### Pitfall 8: Offline State Race on App Init
**What goes wrong:** App starts offline. `$store.library.loadBooks()` fails with a network error, `books` stays empty, user sees empty library instead of cached books.
**Why it happens:** The existing `loadBooks()` fetches `/api/books` — the service worker caches it NetworkFirst, so offline it falls back to cache. But if the service worker isn't controlling the page yet (first install), there's no cached response.
**How to avoid:** The NetworkFirst strategy for `/api/` routes handles this automatically after first visit. On first install, the app cannot be used offline — this is expected PWA behavior. Document this in UX: "Visit once while online to enable offline mode."
**Warning signs:** Library appears empty on first offline visit.

---

## Code Examples

### sw.js — Complete Phase 6 Additions
```javascript
// Source: https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video

// IMPORTANT: Reference module classes at top level so workbox-sw auto-loads them
const AudioCacheFirst = new workbox.strategies.CacheFirst({
  cacheName: 'spine-audio',
  plugins: [
    new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [200] }),
    new workbox.rangeRequests.RangeRequestsPlugin(),
  ],
})

workbox.routing.registerRoute(
  ({ url }) => url.pathname.match(/^\/api\/books\/\d+\/audio$/),
  AudioCacheFirst
)

workbox.routing.registerRoute(
  ({ url }) => url.pathname.match(/^\/api\/books\/\d+\/cover$/),
  new workbox.strategies.CacheFirst({ cacheName: 'spine-covers' })
)
```

### Reconcile Cache on Init
```javascript
// On app startup: verify each "downloaded" book actually has a cache entry
async function reconcileDownloads(downloadedBookIds) {
  const cache = await caches.open('spine-audio')
  const validIds = []
  for (const bookId of downloadedBookIds) {
    const entry = await cache.match('/api/books/' + bookId + '/audio')
    if (entry) validIds.push(bookId)
    else await downloadDB.delete(bookId) // stale record — clean up
  }
  return validIds
}
```

### Detect Offline and Update Alpine
```javascript
// Source: MDN navigator.onLine
// Register before Alpine initializes
window.addEventListener('online', () => Alpine.store('app').isOffline = false)
window.addEventListener('offline', () => Alpine.store('app').isOffline = true)
// Initial state set in store definition: isOffline: !navigator.onLine
```

### Storage Estimate for Display
```javascript
// Format stored sizeBytes (from downloadDB) — no async needed per render
function formatBytes(bytes) {
  if (!bytes) return '0 MB'
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
  return Math.round(bytes / 1048576) + ' MB'
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Background Fetch API for large file download | Fetch API + ReadableStream in page | — | Background Fetch has poor browser support and complex SW coordination. Page-side fetch gives reliable progress and simpler cancel. |
| Workbox module imports (ES modules) | workbox-sw CDN with importScripts | — | No build step. `workbox.rangeRequests.RangeRequestsPlugin` is the correct CDN access pattern. |
| BroadcastChannel SW→page for progress | Page-driven fetch (no SW needed) | — | Simpler: download lives in page, no cross-context messaging. |

**Deprecated/outdated:**
- Storing 206 Partial responses in cache: Never worked correctly. Full 200 + RangeRequestsPlugin is the current correct pattern (Workbox docs, verified March 2026).
- `fluent-ffmpeg`: Already noted in CLAUDE.md as archived May 2025 — no relevance to this phase.

---

## Open Questions

1. **Content-Length on the existing audio route (OFFL-01 progress bar)**
   - What we know: `audio.ts` explicitly sets `Content-Length: String(totalSize)` on both 200 and 206 responses.
   - What's unclear: Hono + Bun may strip or transform headers in some configurations.
   - Recommendation: Early in implementation, `console.log(res.headers.get('Content-Length'))` in the download fetch and verify it is non-zero. Add indeterminate fallback just in case.

2. **workbox-sw module namespaces for rangeRequests**
   - What we know: `workbox.rangeRequests.RangeRequestsPlugin` is the documented CDN namespace.
   - What's unclear: Exact namespace in workbox-sw 7.4.0 — docs examples primarily show ES module import syntax.
   - Recommendation: Test in sw.js console first: `console.log(workbox.rangeRequests)` after `importScripts`. If undefined, use `workbox.loadModule('workbox-range-requests')` before first reference.

3. **Cache Storage sw.js precache revision bump**
   - What we know: sw.js is precached with `revision: '1'`. When we modify sw.js, the revision must change for the updated service worker to install.
   - What's unclear: Whether the planning/execution process accounts for bumping precache revisions.
   - Recommendation: Plan task to increment sw.js revision strings when sw.js is modified. Consider replacing the static revision with a content hash comment pattern.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun built-in test runner (`bun:test`) |
| Config file | none — `bun test` auto-discovers `*.test.ts` and `*.test.js` |
| Quick run command | `bun test tests/downloads.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| OFFL-01 | Download progress: bytes accumulate, progress 0→1, AbortController cancel | unit (downloadDB + $store.downloads logic in isolation) | `bun test tests/downloads.test.ts` | Wave 0 |
| OFFL-01 | formatBytes() returns correct strings for MB/GB/KB | unit | `bun test tests/downloads.test.ts` | Wave 0 |
| OFFL-02 | Cache Storage entry exists after download completes | manual-only (requires browser Cache Storage API) | manual: DevTools > Application > Cache Storage | N/A |
| OFFL-02 | Audio plays without network (airplane mode test) | manual-only | manual: airplane mode + play | N/A |
| OFFL-03 | downloadDB.save/get/delete round-trip | unit | `bun test tests/downloads.test.ts` | Wave 0 |
| OFFL-03 | reconcileDownloads() removes stale IndexedDB entries | unit (mock cache) | `bun test tests/downloads.test.ts` | Wave 0 |
| OFFL-04 | RangeRequestsPlugin slices 200→206 correctly | manual-only (requires service worker interception in browser) | manual: DevTools Network tab, verify 206 served offline | N/A |

**Manual-only justification:** OFFL-02 and OFFL-04 require a live browser environment with service worker, Cache Storage, and network control (airplane mode). Bun test runner has no browser context.

### Sampling Rate
- **Per task commit:** `bun test tests/downloads.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green + manual offline audio seeking verified before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/downloads.test.ts` — covers OFFL-01 (progress logic, formatBytes), OFFL-03 (downloadDB CRUD, reconcileDownloads)
- [ ] `downloadDB` and `formatBytes` must be exported from `public/player-utils.js` using the same `module.exports` guard pattern as existing functions

---

## Sources

### Primary (HIGH confidence)
- https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video — Verified: CacheFirst + RangeRequestsPlugin + CacheableResponsePlugin(200) is the canonical pattern. crossorigin="anonymous" required on media elements for CORS mode.
- https://developer.chrome.com/docs/workbox/modules/workbox-range-requests — Verified: `RangeRequestsPlugin`, `createPartialResponse()` API, plugin intercepts `cachedResponseWillBeUsed`.
- https://developer.chrome.com/docs/workbox/modules/workbox-sw — Verified: `workbox.rangeRequests.RangeRequestsPlugin` CDN namespace; top-level reference required for auto-load; `workbox.loadModule()` escape hatch.
- https://web.dev/articles/storage-for-the-web — Verified: Chrome origin quota 60% disk; Safari 7-day eviction cap (excludes installed PWA); `navigator.storage.estimate()` API.
- Existing codebase: `public/sw.js`, `src/routes/audio.ts`, `public/index.html`, `tests/player.test.ts` — direct inspection, HIGH confidence.

### Secondary (MEDIUM confidence)
- https://micahjon.com/2022/track-download-progress-workbox/ — ReadableStream chunk accumulation pattern + Workbox plugin architecture. Adapted pattern: progress tracked in page (not SW). Safari BroadcastChannel note accurate.
- https://javascript.info/fetch-progress — ReadableStream `reader.read()` loop pattern for byte progress.
- https://developer.chrome.com/blog/abortable-fetch — `AbortController` + `signal` for cancellable fetch; `fetchEvent.request.signal` propagation.
- https://gist.github.com/jeffposnick/9bc877a477031872ec8fb9851f81a526 — `blob.size` pattern for per-response byte size from Cache Storage (by Workbox maintainer, MEDIUM confidence).

### Tertiary (LOW confidence)
- WebSearch findings on BroadcastChannel Safari 15.4 support — confirmed available but avoided in this design.
- WebSearch on navigator.storage.persist() behavior — Chrome auto-approve/deny heuristics; no official spec quote found.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; Workbox CDN and browser APIs confirmed
- Architecture (download flow): HIGH — Fetch+ReadableStream+cache.put is the verified pattern
- Range request handling (OFFL-04): HIGH — RangeRequestsPlugin is documented canonical solution
- Pitfalls: HIGH (pitfalls 1-3, 6-7 from direct code inspection + official docs) / MEDIUM (pitfalls 4-5, 8 from web search + reasoning)
- Storage/quota numbers: HIGH (official Chrome docs)

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (Workbox stable; browser APIs stable)
