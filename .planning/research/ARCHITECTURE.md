# Architecture Research

**Domain:** Self-hosted audiobook PWA (Node/Bun backend, Alpine.js + Workbox frontend)
**Researched:** 2026-03-22
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER (PWA)                        │
│                                                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │  Alpine.js  │  │ Audio Player│  │  Download Manager   │   │
│  │  UI/Router  │  │ (Media API) │  │  (fetch + progress) │   │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘   │
│         │                │                      │              │
│  ┌──────▼──────────────────────────────────────▼──────────┐   │
│  │              Alpine Stores (shared state)               │   │
│  │   auth · library · player · progress · downloads       │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                  │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │              Service Worker (Workbox)                    │   │
│  │   App Shell cache · Audio CacheFirst + RangeRequests    │   │
│  │   API NetworkFirst · Offline fallback                   │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                  │
│  ┌──────────────┐  ┌────────▼────────┐  ┌──────────────────┐  │
│  │  IndexedDB   │  │  Cache Storage  │  │  localStorage    │  │
│  │  (progress,  │  │  (audio files,  │  │  (session token, │  │
│  │   metadata)  │  │   app shell)    │  │   simple prefs)  │  │
│  └──────────────┘  └─────────────────┘  └──────────────────┘  │
└─────────────────────────────┬─────────────────────────────────┘
                              │ HTTP (REST + Range Requests)
                              │ JWT Bearer token
┌─────────────────────────────▼─────────────────────────────────┐
│                     SERVER LAYER (Node/Bun)                     │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  HTTP Server (Express/Hono)              │  │
│  │  Auth middleware → Route handlers → Response             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ Auth Module │  │ Library API  │  │  Stream Handler    │   │
│  │ (JWT, bcrypt│  │ (books,      │  │  (byte-range,      │   │
│  │  sessions)  │  │  chapters,   │  │   Content-Range,   │   │
│  │             │  │  covers)     │  │   206 responses)   │   │
│  └─────────────┘  └──────────────┘  └────────────────────┘   │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Library Scanner                        │   │
│  │  fs.watch → ffprobe probe → normalize → persist         │   │
│  │  Runs at startup + on file changes                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌──────────────────┐  ┌──────────────────────────────────┐   │
│  │  Progress API    │  │         Cover Cache              │   │
│  │  (read/write per │  │  (extracted covers → disk,       │   │
│  │   user/book)     │  │   served as static files)        │   │
│  └──────────────────┘  └──────────────────────────────────┘   │
└─────────────────────────────┬─────────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────────┐
│                       DATA LAYER                                │
│                                                                │
│  ┌──────────────┐  ┌───────────────────┐  ┌────────────────┐  │
│  │  SQLite DB   │  │  Filesystem Media │  │  Cover Cache   │  │
│  │  users       │  │  /audiobooks/     │  │  /metadata/    │  │
│  │  books       │  │    *.m4b          │  │  covers/       │  │
│  │  chapters    │  │                   │  │                │  │
│  │  progress    │  │                   │  │                │  │
│  └──────────────┘  └───────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Alpine.js UI | Page routing, reactive DOM, component state | `x-data` per page, Alpine Stores for shared state, ES module imports |
| Audio Player | Playback control, chapter navigation, Media Session API | HTML `<audio>` element + Alpine component wrapping Web Audio APIs |
| Download Manager | Whole-book offline acquisition, progress reporting | `fetch()` streaming response into Cache Storage, progress tracked in IndexedDB |
| Service Worker (Workbox) | App shell caching, audio offline delivery, API caching | `workbox-strategies` CacheFirst for audio, NetworkFirst for API, `workbox-range-requests` plugin |
| HTTP Server | Route handling, auth middleware, static serving | Express or Hono; one entry-point file wiring all routes |
| Auth Module | Password hashing, JWT issuance, token validation | bcrypt for hashing, jsonwebtoken for JWT; middleware validates on every protected route |
| Library Scanner | .m4b discovery, ffprobe extraction, DB normalization | Child process spawning ffprobe, result persisted to SQLite; runs once at startup and on `fs.watch` events |
| Stream Handler | Byte-range audio delivery | Parses `Range:` header, opens `fs.createReadStream({start, end})`, responds 206 with `Content-Range` |
| Progress API | Per-user per-book position persistence | REST endpoints reading/writing SQLite progress rows; client calls manually ("sync") |
| SQLite DB | Structured data persistence | `better-sqlite3` (synchronous, no async overhead); single file in `/config/` volume |
| Filesystem Media | Source of truth for .m4b files | Read-only mount in Docker; server never writes here |
| Cover Cache | Extracted cover art served as static files | ffprobe extracts embedded art once at scan time, stored as `{book-id}.jpg` |

## Recommended Project Structure

```
spine/
├── server/
│   ├── index.ts              # Entry point — wires server, scanner, DB
│   ├── db/
│   │   ├── schema.ts         # Table definitions (better-sqlite3)
│   │   ├── migrations/       # Sequential schema migrations
│   │   └── queries/          # Named query functions (books, users, progress)
│   ├── auth/
│   │   ├── middleware.ts     # JWT validation middleware
│   │   ├── routes.ts         # POST /auth/login, POST /auth/logout
│   │   └── passwords.ts      # bcrypt hash/compare helpers
│   ├── library/
│   │   ├── scanner.ts        # fs.watch + ffprobe orchestration
│   │   ├── probe.ts          # ffprobe subprocess wrapper, result types
│   │   └── routes.ts         # GET /api/books, GET /api/books/:id
│   ├── stream/
│   │   └── routes.ts         # GET /audio/:id — byte-range streaming
│   ├── progress/
│   │   └── routes.ts         # GET/PUT /api/progress/:bookId
│   └── covers/
│       └── routes.ts         # GET /covers/:bookId — static cover serving
├── public/
│   ├── index.html            # App shell (Alpine + Workbox bootstrap)
│   ├── sw.js                 # Service worker (Workbox injectManifest target)
│   ├── js/
│   │   ├── app.js            # Alpine.start() + store registration
│   │   ├── stores/
│   │   │   ├── auth.js       # Alpine.store('auth', ...)
│   │   │   ├── library.js    # Alpine.store('library', ...)
│   │   │   ├── player.js     # Alpine.store('player', ...)
│   │   │   └── progress.js   # Alpine.store('progress', ...)
│   │   └── components/
│   │       ├── player.js     # Alpine.data('player', ...)
│   │       ├── book-card.js  # Alpine.data('bookCard', ...)
│   │       └── downloader.js # Alpine.data('downloader', ...)
│   └── css/
│       └── app.css
├── Dockerfile
├── docker-compose.yml
└── package.json
```

### Structure Rationale

- **server/db/queries/:** Encapsulates all SQL behind named functions — routes never write raw SQL, which keeps migration paths clean and prevents injection footguns.
- **server/library/scanner.ts vs probe.ts:** Scanner owns the orchestration lifecycle (what to scan, when); probe owns the ffprobe subprocess interface. Split allows unit-testing probe parsing without touching the filesystem watcher.
- **server/stream/routes.ts:** Stream handler is isolated because byte-range logic is stateless and has no dependency on the library model — it only needs the file path from the DB.
- **public/js/stores/:** Alpine Stores are the single source of truth for cross-component state. Components (`x-data`) only hold local ephemeral state (e.g., "is this dropdown open?"). Keeps state predictable.
- **public/sw.js:** Service worker is a hand-authored file using Workbox's `injectManifest` strategy (not `generateSW`) so audio routing rules and IndexedDB access can be written explicitly.

## Architectural Patterns

### Pattern 1: Normalize-Once Ingest

**What:** The library scanner runs ffprobe on each .m4b file exactly once at ingest time (startup + file changes) and writes normalized book/chapter records to SQLite. Subsequent API requests read from the DB — never call ffprobe at request time.

**When to use:** Any time metadata extraction is expensive (ffprobe adds ~100–500ms per file). The DB is the cache. File changes trigger re-scan of changed files only.

**Trade-offs:** Requires a "dirty" detection strategy (file mtime or size change) to know when to re-probe. Cover images need to be extracted to disk at scan time as well.

**Example:**
```typescript
// scanner.ts
async function scanLibrary(dir: string) {
  const files = await glob('**/*.m4b', { cwd: dir });
  for (const file of files) {
    const known = db.getBookByPath(file);
    const stat = fs.statSync(path.join(dir, file));
    if (known && known.mtime === stat.mtimeMs) continue; // unchanged
    const metadata = await probe(path.join(dir, file));
    db.upsertBook({ ...metadata, mtime: stat.mtimeMs });
  }
}
```

### Pattern 2: Byte-Range Streaming (206 Partial Content)

**What:** The audio endpoint reads the HTTP `Range` header, opens a file stream at the requested byte offset, and returns status 206 with appropriate `Content-Range` and `Accept-Ranges` headers. This is required for `<audio>` seeking to work correctly.

**When to use:** Every audio file request. Browsers always send range requests for `<audio>` elements. Without this, scrubbing fails.

**Trade-offs:** Adds ~10 lines of header parsing per endpoint but is straightforward. No transcoding needed for .m4b (AAC in MP4 container is natively supported by all modern browsers).

**Example:**
```typescript
// stream/routes.ts
app.get('/audio/:id', requireAuth, (req, res) => {
  const book = db.getBookById(req.params.id);
  const { size } = fs.statSync(book.filePath);
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, { 'Content-Length': size, 'Content-Type': 'audio/mp4' });
    fs.createReadStream(book.filePath).pipe(res);
    return;
  }
  const [start, end = size - 1] = range.replace('bytes=', '').split('-').map(Number);
  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Content-Type': 'audio/mp4',
  });
  fs.createReadStream(book.filePath, { start, end }).pipe(res);
});
```

### Pattern 3: Local-First Progress with Manual Sync

**What:** Playback position is written to IndexedDB on every chapter/timestamp update (throttled, every 5s). The backend progress API is only called when the user explicitly triggers "sync" or when the app comes online after being offline. On conflict (same book, multiple devices), last-write-wins using a timestamp.

**When to use:** Any offline-capable app where the server is optional. Avoids tight coupling between playback and network availability.

**Trade-offs:** Conflict resolution is simple (last-write-wins) — acceptable for a household with a few users who rarely listen on two devices simultaneously. More complex CRDT-style merging is out of scope.

### Pattern 4: Workbox CacheFirst + RangeRequests for Offline Audio

**What:** The service worker registers a route matching `audio/*` requests, using `CacheFirst` strategy with `RangeRequestsPlugin`. Audio must be explicitly added to Cache Storage during download (not lazily cached on first play). Once cached, the service worker synthesizes partial-content (206) responses from the cached full file.

**When to use:** Whole-book offline downloads. The browser's `<audio>` element always makes range requests; the `RangeRequestsPlugin` handles this transparently from cached data.

**Trade-offs:** Requires the `crossorigin` attribute on `<audio>` even for same-origin URLs (browser quirk). Cache Storage has per-origin limits (typically 20–50% of available disk); large audiobook libraries will fill it. The download manager must track which books are cached so the UI can reflect offline availability.

**Example:**
```javascript
// sw.js
import { CacheFirst } from 'workbox-strategies';
import { RangeRequestsPlugin } from 'workbox-range-requests';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

registerRoute(
  ({ url }) => url.pathname.startsWith('/audio/'),
  new CacheFirst({
    cacheName: 'audiobooks',
    plugins: [
      new RangeRequestsPlugin(),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
);
```

## Data Flow

### Request Flow — Library Browse

```
User opens /library
    ↓
Alpine.store('library').init()
    ↓
fetch('/api/books', { headers: { Authorization: 'Bearer ...' } })
    ↓
Service Worker (NetworkFirst) → hits network if online
    ↓
Auth middleware validates JWT → LibraryController queries SQLite
    ↓
JSON response: [{ id, title, author, coverUrl, duration, chapterCount }]
    ↓
Alpine.store('library').books = response.json()
    ↓
DOM updates reactively via x-for
```

### Request Flow — Audio Playback

```
User taps Play on book
    ↓
Alpine player component sets <audio src="/audio/:id"> with crossorigin
    ↓
Browser emits Range request: bytes=0-65535
    ↓
Service Worker checks Cache Storage (CacheFirst)
    ├── Cache HIT → RangeRequestsPlugin synthesizes 206 response
    └── Cache MISS → fetch to server → server reads file range → 206 response
    ↓
Browser buffers and plays
    ↓
Alpine player emits 'timeupdate' every 5s → writes to IndexedDB
```

### Request Flow — Whole-Book Download

```
User taps Download
    ↓
Alpine downloader component starts fetch('/audio/:id')
    ↓
Service Worker is bypassed — download manager uses fetch() directly
    ↓
Response body streamed as ReadableStream
    ↓
Chunks accumulated in memory buffer → cache.put('/audio/:id', response)
    ↓
Progress % tracked: bytesReceived / Content-Length → IndexedDB { id, status: 'downloaded' }
    ↓
UI reflects book as available offline
```

### Request Flow — Progress Sync

```
User taps "Sync progress"
    ↓
Alpine.store('progress').sync()
    ↓
Reads all dirty progress records from IndexedDB
    ↓
PUT /api/progress/:bookId  { chapterIndex, position, syncedAt }
    ↓
Server writes to SQLite progress table (upsert by userId + bookId)
    ↓
Mark IndexedDB records as clean
```

### State Management

```
Alpine.store('auth')     ← login/logout, token storage
Alpine.store('library')  ← book list, search, loaded state
Alpine.store('player')   ← current book, chapter, position, playing
Alpine.store('progress') ← local progress map, dirty flags, sync status
Alpine.store('downloads')← per-book download state, cache availability

Components subscribe via x-bind / x-text referencing stores directly.
No centralized event bus needed at this scale.
```

### Key Data Flows

1. **Scan → DB → API:** ffprobe extracts chapter/metadata once → SQLite stores normalized records → REST API reads from DB on every request. FFprobe is never called at request time.
2. **Download → Cache Storage → Service Worker:** Whole-book fetch cached explicitly → service worker's CacheFirst serves it offline via range request synthesis.
3. **Playback → IndexedDB → Sync:** Progress writes are purely local (IndexedDB) during playback → explicit sync pushes dirty records to backend SQLite.
4. **Auth → JWT → Every Request:** Login returns JWT stored in localStorage → every fetch includes `Authorization: Bearer` → auth middleware on every protected route validates and rejects expired tokens.

## Scaling Considerations

This is a household app (2–10 users). Scaling is not a relevant concern. For completeness:

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 2–10 users (target) | Single Node process, single SQLite file, Docker container — no changes needed |
| 50–100 users | SQLite write contention appears; consider WAL mode (already default in better-sqlite3). Audio streaming may saturate upstream bandwidth before server CPU. |
| 1000+ users | SQLite → PostgreSQL; separate static/media server (nginx); horizontal scaling for API. Out of scope for this project. |

### Scaling Priorities

1. **First bottleneck:** Audio streaming bandwidth. The server pipes raw file bytes. At 10 concurrent streams of ~64kbps AAC, this is ~640kbps — trivial for LAN, may matter on residential uplink for remote access.
2. **Second bottleneck:** Library scan time on startup with hundreds of books. ffprobe each file is ~100–500ms. For 200 books, startup scan takes up to 100 seconds. Mitigate by checking mtime before probing.

## Anti-Patterns

### Anti-Pattern 1: Calling ffprobe at Request Time

**What people do:** Run ffprobe inside the `/api/books/:id` or `/api/books/:id/chapters` handler to read metadata fresh on every request.

**Why it's wrong:** ffprobe spawns a subprocess and reads the file header — ~100–500ms per call. Under concurrent requests or during library browse this becomes a bottleneck instantly. .m4b metadata does not change after ingest.

**Do this instead:** Run ffprobe once at scan time, persist to SQLite, serve from DB. Re-scan only when file mtime changes.

### Anti-Pattern 2: Streaming Full File on Every Request (No Range Support)

**What people do:** Respond to audio requests with the full file and status 200, ignoring the `Range` header.

**Why it's wrong:** The browser's `<audio>` element always sends range requests. Without 206 responses, scrubbing/seeking fails on many browsers (especially Safari/iOS). The service worker's `RangeRequestsPlugin` cannot synthesize partial responses from a full-file cache entry unless the original cached response was a 200.

**Do this instead:** Always parse the `Range` header and respond 206 when present. For offline, cache the full 200 response and let `RangeRequestsPlugin` handle synthesizing 206 from it.

### Anti-Pattern 3: Storing Audio Files in IndexedDB

**What people do:** Stream audio bytes into IndexedDB as a Blob for offline storage.

**Why it's wrong:** IndexedDB Blob storage works but Cache Storage is the correct Web Platform API for caching network responses. Workbox's `CacheFirst` strategy with `RangeRequestsPlugin` only works with Cache Storage. IndexedDB audio storage requires a custom service worker fetch handler that reconstructs a Response from the blob — more code, more bugs, no Workbox support.

**Do this instead:** Store audio in Cache Storage (via cache.put()). Store structured data (progress, metadata, download status) in IndexedDB.

### Anti-Pattern 4: Inline x-data Logic for Shared State

**What people do:** Put the entire player/library/auth state in inline `x-data="{ books: [], currentBook: null, ... }"` on a root element.

**Why it's wrong:** With no build step, all JS is global. Inline x-data bloats HTML, can't be tested, can't be split across files, and creates deep nesting when state is shared across components.

**Do this instead:** Use `Alpine.store()` for any state shared across more than one component. Use `Alpine.data()` with named component functions for component-local behavior. Register both before `Alpine.start()`.

### Anti-Pattern 5: Progress Autosync on Every Timeupdate Event

**What people do:** Call `PUT /api/progress` inside the `timeupdate` event handler of `<audio>`.

**Why it's wrong:** `timeupdate` fires ~4 times per second. This creates 240 HTTP requests per minute per user — hammering the server, burning battery on mobile, and failing entirely offline.

**Do this instead:** Write to IndexedDB on timeupdate (throttled to once every 5s). Sync to backend explicitly (on app backgrounding, on manual trigger, or on `visibilitychange`).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| ffprobe (local) | Child process spawn at scan time | ffprobe binary must be present in Docker image (install ffmpeg package); path configurable via env var |
| Docker volumes | Read-only media mount, read-write config/metadata mounts | Never write to the media volume — only read .m4b files from it |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Scanner ↔ DB | Direct function calls (same process) | Scanner calls db.upsertBook() synchronously; better-sqlite3 is synchronous |
| HTTP routes ↔ DB | Direct function calls (same process) | All routes import query functions from db/queries/; no ORM, named SQL functions |
| Service Worker ↔ Alpine | `postMessage` / Workbox messaging for cache status | SW notifies app when a book download completes; app queries SW for cache membership |
| Alpine Stores ↔ IndexedDB | Async calls wrapped in store methods | progress.js store owns all IndexedDB reads/writes; nothing else touches IDB directly |
| Client ↔ Server | REST over HTTP, JWT Bearer token | No WebSockets needed — this app has no real-time collaboration features |

## Build Order Implications

The component dependencies create a natural build sequence:

1. **DB schema + queries** — everything else depends on data access
2. **Auth routes + middleware** — required before any other route can be protected
3. **Library scanner + probe** — must produce book/chapter records before the API can serve them
4. **Audio stream handler** — stateless once DB is available, can be built alongside scanner
5. **Library API routes** — reads from DB, requires scanner to have run
6. **Progress API routes** — simple CRUD; requires auth and DB
7. **Backend Docker integration** — wire everything into a container that runs correctly
8. **Alpine app shell + auth UI** — login flow, token storage
9. **Library browse UI** — calls Library API
10. **Audio player component** — calls stream handler, integrates Media Session API
11. **Progress sync** — IndexedDB writes + sync-to-backend call
12. **Download manager + service worker** — most complex frontend piece; requires player working first
13. **PWA manifest + installability** — final polish

## Sources

- Audiobookshelf architecture analysis: [DeepWiki — Real-time Communication System / API Architecture](https://deepwiki.com/advplyr/audiobookshelf/3.2-api-architecture)
- Workbox offline audio: [Serving cached audio and video — Chrome for Developers](https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video)
- PWA offline streaming architecture: [PWA with offline streaming — web.dev](https://web.dev/articles/pwa-with-offline-streaming)
- Audio cache PWA reference implementation: [daffinm/audio-cache-test — GitHub](https://github.com/daffinm/audio-cache-test)
- PWA offline storage strategies: [Offline data — web.dev](https://web.dev/learn/pwa/offline-data)
- Alpine.js component organization: [Maintainable Alpine.js components — Ryan Chandler](https://ryangjchandler.co.uk/posts/organising-your-alpine-components)
- Node.js HTTP range requests: [Implementing HTTP range requests in Node.js — cri.dev](https://cri.dev/posts/2025-06-18-how-to-http-range-requests-video-nodejs/)

---
*Architecture research for: Self-hosted audiobook PWA (Spine)*
*Researched: 2026-03-22*
