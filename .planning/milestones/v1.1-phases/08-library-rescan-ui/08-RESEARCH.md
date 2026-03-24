# Phase 8: Library Rescan UI - Research

**Researched:** 2026-03-23
**Domain:** SSE streaming, Alpine.js tab UI, Hono route patterns, Audnexus API integration
**Confidence:** HIGH (SSE/Hono patterns), MEDIUM (Audnexus API contract — critical gap documented below)

## Summary

This phase adds an admin-facing Library tab that lets an admin trigger a manual rescan, watch live progress via SSE, and benefits from Audnexus metadata enrichment on incomplete books. The backend work is a clean extension of the existing `scanLibrary()` function — inject a progress callback, add an in-memory scan lock, and stream events to a `/api/scan/progress` SSE endpoint. The frontend work wraps the existing admin component in a tab UI and adds the new Library tab content.

The most important technical finding is that the **Audnexus API does not support title/author search**. It only supports ASIN-based lookup (`GET /books/{ASIN}`). D-09 in CONTEXT.md assumed a search endpoint exists — that assumption is incorrect. The plan must address how enrichment looks up books without ASINs (see Open Questions).

**Primary recommendation:** Use Hono's built-in `streamSSE` helper (from `hono/streaming`) for the SSE endpoint. Enrich via Audnexus only if the book's ASIN is stored or can be derived; otherwise skip enrichment gracefully per D-10/LIBM-09.

## User Constraints (from CONTEXT.md)

<user_constraints>
### Locked Decisions

- **D-01:** Add tabs to the existing admin page: "Users" | "Library". Tab state is local to the admin component.
- **D-02:** "Library" tab contains the rescan button, progress display, and scan summary. "Users" tab retains existing user management content.
- **D-03:** "Rescan Library" button triggers `POST /api/scan` (admin-only).
- **D-04:** While scanning, a horizontal progress bar shows "Scanning... 42/128 files" with live SSE updates from `GET /api/scan/progress`.
- **D-05:** Backend modifies `scanLibrary()` (or wraps it) to emit progress events: file count, files scanned, current file name.
- **D-06:** Rescan button is disabled during scan with text "Scan in progress". Admin can watch but cannot start another scan.
- **D-07:** Backend maintains a scan-in-progress flag (in-memory singleton). `POST /api/scan` returns 409 if scan is already running (LIBM-03).
- **D-08:** Enrichment runs per book during scan. After probe, if metadata is incomplete, query Audnexus.
- **D-09:** Audnexus lookup uses book title + author as search keys. Endpoint: `https://api.audnex.us/books` (or equivalent). **Researcher must verify — see Open Questions.**
- **D-10:** If Audnexus is unreachable or returns no match, silently skip that book. No per-book error in progress stream.
- **D-11:** Enrichment results written to books table. Existing non-null fields are NOT overwritten.
- **D-12:** On scan completion, show summary: "Scan complete: 3 new, 1 updated, 0 missing, 2 not enriched".
- **D-13:** Library grid auto-refreshes after scan completes. SSE "done" event triggers `$store.library.loadBooks()`.
- **D-14:** Progress bar and summary persist on Library tab until next scan or admin navigates away.

### Claude's Discretion

- Exact SSE event format and field names
- Whether to show "enriching..." as a sub-status in the progress bar or keep it merged into the file count
- Tab styling (reuse nav patterns or new tab component)
- Whether the periodic watcher (5-min interval) should also trigger progress events or remain console-only

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

## Phase Requirements

<phase_requirements>
| ID | Description | Research Support |
|----|-------------|------------------|
| LIBM-01 | Admin can trigger a library rescan from the browser UI | POST /api/scan route with adminOnly middleware; existing route/middleware patterns are sufficient |
| LIBM-02 | Rescan shows live progress (files scanned / total) via SSE | Hono `streamSSE` helper confirmed; SSE EventSource API in browser; in-memory event emitter bridges scanLibrary callback to SSE stream |
| LIBM-03 | Concurrent rescans are prevented (scan-in-progress guard) | In-memory boolean flag in scan module; POST /api/scan returns 409 when flag is true |
| LIBM-08 | Scanner enriches book metadata from Audnexus API when local data is incomplete | CRITICAL: Audnexus only supports ASIN lookup, not title/author search. Enrichment must be ASIN-based or skipped entirely. See Open Questions. |
| LIBM-09 | Enrichment is non-blocking — scan completes even if Audnexus is unreachable | fetch() with AbortController timeout; try/catch around each enrichment call; scan continues on any error |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono/streaming` (built-in) | 4.12.8 (already installed) | SSE streaming via `streamSSE` | Built into Hono — zero additional deps. Confirmed API: `streamSSE(c, async (stream) => { await stream.writeSSE({data, event, id}) })` |
| `bun:sqlite` (built-in) | Bun 1.2.x (already in use) | Write enriched fields to books table | Already the project DB — consistent with all other routes |
| Alpine.js 3.15.x (CDN, already loaded) | 3.15.x | Tab state, progress bar reactivity, SSE EventSource | Already in use; `x-data` with local state is the established pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `EventEmitter` (built-in) | Bun 1.2.x | Bridge scan progress from `scanLibrary()` callback to SSE stream | Use a module-level singleton to pass events from scanner → route handler |
| `fetch()` with `AbortController` (built-in) | Web standard | Audnexus HTTP calls with timeout | Use for LIBM-09: set 5s timeout so slow/offline Audnexus never blocks the scan |

**Installation:** No new dependencies. All tooling is already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── routes/scan.ts          # NEW: POST /api/scan, GET /api/scan/progress (SSE)
├── scanner/
│   ├── index.ts            # MODIFY: add ProgressCallback type; inject into scanLibrary()
│   ├── enrichment.ts       # NEW: Audnexus client; enrichBook(db, bookId, asin)
│   └── watcher.ts          # OPTIONAL: may call scanLibrary with no-op progress callback
public/
├── index.html              # MODIFY: wrap admin component in tab UI; add Library tab
└── style.css               # MODIFY: add tab styles (.admin-tabs, .admin-tab-btn, .admin-tab-panel)
```

### Pattern 1: scanLibrary Progress Callback Injection

**What:** Add an optional `onProgress` callback parameter to `scanLibrary()`. The callback receives structured events. The scan module owns a module-level in-memory singleton for the running scan state (lock + emitter).

**When to use:** Whenever a caller needs live progress (manual scan via API). Watcher calls pass a no-op or omit the callback.

```typescript
// src/scanner/index.ts — additions

export type ScanProgressEvent =
  | { type: 'start'; total: number }
  | { type: 'file'; scanned: number; total: number; current: string }
  | { type: 'done'; newBooks: number; updatedBooks: number; missing: number; notEnriched: number }

export type ProgressCallback = (event: ScanProgressEvent) => void

// Module-level scan lock
let _scanInProgress = false

export function isScanRunning(): boolean { return _scanInProgress }

export async function scanLibrary(
  db: Database,
  libraryRoot: string,
  probeFn: ProbeFn = defaultProbeFn,
  onProgress?: ProgressCallback   // NEW optional param — existing callers unaffected
): Promise<void> {
  // ... existing walk logic ...
  onProgress?.({ type: 'start', total: paths.length })
  // ... inside file loop after each scanFile() completes ...
  onProgress?.({ type: 'file', scanned: i, total: paths.length, current: filePath })
  // ... after mark-missing step ...
  onProgress?.({ type: 'done', newBooks, updatedBooks, missing: missingCount, notEnriched })
}
```

### Pattern 2: SSE Route with Hono streamSSE

**What:** `GET /api/scan/progress` uses Hono's `streamSSE` helper. The route subscribes to scan events via an EventEmitter and forwards them to the client. On stream close (client disconnect), it unsubscribes.

**When to use:** Any push-notification from server to browser with no bidirectional need.

```typescript
// src/routes/scan.ts
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { adminOnly } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import { getDatabase } from '../db/index.js'
import { isScanRunning, runScan, scanEmitter } from '../scanner/index.js'

const scan = new Hono<{ Variables: AuthVariables }>()
scan.use('/*', adminOnly)

// POST /api/scan — trigger manual rescan
scan.post('/scan', async (c) => {
  if (isScanRunning()) return c.json({ error: 'Scan already in progress' }, 409)
  const db = getDatabase()
  const libraryRoot = process.env['LIBRARY_ROOT'] ?? '/books'
  // Fire-and-forget — do not await; SSE stream carries progress
  runScan(db, libraryRoot).catch((err) => {
    console.error('[scan] Manual scan failed:', err)
  })
  return c.json({ ok: true })
})

// GET /api/scan/progress — SSE stream
scan.get('/scan/progress', (c) => {
  return streamSSE(c, async (stream) => {
    const listener = async (event: ScanProgressEvent) => {
      await stream.writeSSE({
        data: JSON.stringify(event),
        event: event.type,
      })
    }
    scanEmitter.on('progress', listener)
    stream.onAbort(() => scanEmitter.off('progress', listener))
    // Keep alive until client disconnects or scan completes
    // The 'done' event triggers client-side cleanup; stream will close naturally
    await new Promise<void>((resolve) => {
      const onDone = () => { scanEmitter.off('progress', listener); resolve() }
      scanEmitter.once('done', onDone)
      stream.onAbort(onDone)
    })
  })
})

export default scan
```

### Pattern 3: Audnexus Enrichment Client

**CRITICAL FINDING:** The Audnexus API (`https://api.audnex.us`) only supports ASIN-based lookup: `GET /books/{ASIN}`. There is no title/author search endpoint. This contradicts D-09 in CONTEXT.md which expected a `title + author` search endpoint.

**Consequence for planning:** Enrichment is only possible if the book has an ASIN. ASINs are not stored by the current scanner (m4b metadata rarely embeds an ASIN). The plan must choose one of the approaches listed in Open Questions.

**What the Audnexus response includes (when an ASIN is known):**
- `description` (string)
- `image` (cover image URL)
- `narrators` (array of `{name}`)
- `series` (`{asin, name, position}`)
- `authors` (array of `{asin, name}`)

**Enrichment client pattern (ASIN-dependent):**
```typescript
// src/scanner/enrichment.ts
export interface AudnexusBook {
  description?: string
  image?: string                          // cover image URL
  narrators?: { name: string }[]
  series?: { asin: string; name: string; position?: string }
}

export async function fetchAudnexusBook(asin: string): Promise<AudnexusBook | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`https://api.audnex.us/books/${asin}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'spine/1.0' },
    })
    if (!res.ok) return null
    return await res.json() as AudnexusBook
  } catch {
    return null   // LIBM-09: unreachable or timeout — return null silently
  } finally {
    clearTimeout(timeout)
  }
}

// Apply enrichment fields to a book, never overwriting existing non-null values (D-11)
export function applyEnrichment(db: Database, bookId: number, data: AudnexusBook): boolean {
  const book = db.query<{ description: string|null; cover_path: string|null; narrator: string|null; series_title: string|null }, [number]>(
    'SELECT description, cover_path, narrator, series_title FROM books WHERE id = ?'
  ).get(bookId)
  if (!book) return false

  const updates: string[] = []
  const params: unknown[] = []

  if (!book.description && data.description) {
    updates.push('description = ?'); params.push(data.description)
  }
  if (!book.narrator && data.narrators?.[0]?.name) {
    updates.push('narrator = ?'); params.push(data.narrators[0].name)
  }
  if (!book.series_title && data.series?.name) {
    updates.push('series_title = ?'); params.push(data.series.name)
  }
  // cover_path from Audnexus: store image URL in cover_path if no cover exists
  if (!book.cover_path && data.image) {
    updates.push('cover_path = ?'); params.push(data.image)
  }

  if (updates.length === 0) return false
  db.prepare(`UPDATE books SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .run(...params, bookId)
  return true
}
```

### Pattern 4: Alpine.js Tab UI

**What:** Wrap the existing admin `x-data` component content in a tab structure. Tab state (`activeTab: 'users'`) is local to the admin `x-data` object. Use `x-show` (not `x-if`) for tabs — the Users tab must stay in DOM to avoid losing form state mid-interaction. Use `x-if` only for the outer admin container (existing behavior).

**CSS pattern — reuse existing classes, add minimal new ones:**
```html
<!-- Tab bar -->
<div class="admin-tabs">
  <button class="admin-tab-btn" :class="{ 'admin-tab-active': activeTab === 'users' }"
          @click="activeTab = 'users'" type="button">Users</button>
  <button class="admin-tab-btn" :class="{ 'admin-tab-active': activeTab === 'library' }"
          @click="activeTab = 'library'" type="button">Library</button>
</div>

<!-- Users tab panel (x-show keeps DOM alive, avoids re-render issues) -->
<div x-show="activeTab === 'users'">
  <!-- existing users content unchanged -->
</div>

<!-- Library tab panel -->
<div x-show="activeTab === 'library'">
  <!-- rescan button, progress bar, summary -->
</div>
```

**SSE EventSource pattern (browser-side):**
```javascript
// Inside Alpine x-data for Library tab
async startScan() {
  const res = await fetch('/api/scan', { method: 'POST' })
  if (res.status === 409) { this.scanError = 'Scan already in progress'; return }
  if (!res.ok) { this.scanError = 'Failed to start scan'; return }

  this.scanning = true
  this.scanError = ''
  this.scanSummary = null
  const es = new EventSource('/api/scan/progress')

  es.addEventListener('start', (e) => {
    const data = JSON.parse(e.data)
    this.scanTotal = data.total
    this.scanScanned = 0
  })
  es.addEventListener('file', (e) => {
    const data = JSON.parse(e.data)
    this.scanScanned = data.scanned
    this.scanTotal = data.total
    this.scanCurrent = data.current
  })
  es.addEventListener('done', async (e) => {
    const data = JSON.parse(e.data)
    this.scanning = false
    this.scanSummary = data
    es.close()
    await $store.library.loadBooks()  // D-13: auto-refresh grid
  })
  es.onerror = () => {
    this.scanning = false
    this.scanError = 'Connection lost during scan.'
    es.close()
  }
}
```

### Anti-Patterns to Avoid

- **Awaiting `scanLibrary()` inside the POST handler:** The scan is long-running. The POST handler must fire-and-forget; the SSE stream carries progress. If the handler awaits, the HTTP request hangs for the full scan duration.
- **Using `x-if` for the Users tab panel:** If the Users tab unmounts mid-edit (e.g., switching tabs), the create form state is lost. Use `x-show` for both tab panels. Only the outer admin container uses `x-if` (established in Phase 7).
- **Streaming SSE from the same request as POST /api/scan:** Two separate endpoints is correct. The POST triggers the scan; the GET streams progress. Mixing them breaks REST semantics and forces the client to manage a single long-lived response.
- **Setting `_scanInProgress` inside `scanLibrary()` itself:** The flag must be managed in a wrapper (`runScan()`) that guarantees the flag is cleared in a `finally` block even if the scan throws.
- **Not unsubscribing the EventEmitter listener on SSE stream abort:** Memory and listener leaks accumulate across repeated scans if `stream.onAbort()` does not call `scanEmitter.off()`.
- **Overwriting existing non-null book fields with Audnexus data:** D-11 is strict — only fill gaps. A naive `UPDATE books SET description = ?` overwrites user-curated data.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE streaming with keep-alive, proper headers | Manual `Response` with `ReadableStream` and `text/event-stream` header management | `streamSSE` from `hono/streaming` | Hono handles Content-Type, Cache-Control, connection keep-alive, and abort detection automatically |
| Concurrency guard | Custom mutex class | Module-level boolean `_scanInProgress` + `isScanRunning()` | The scan runs in a single Node/Bun process; a boolean is sufficient and has zero failure modes |
| Event bridging (scanner → SSE route) | Custom pub/sub | Node.js `EventEmitter` singleton | Already in Node/Bun stdlib; typed listeners; `once`/`off` cleanup pattern is well-established |
| HTTP fetch with timeout | Manual `setTimeout` + `AbortController` from scratch | `AbortController` + `setTimeout` (2 lines) — already built-in | No library needed; fetch + AbortController is the web-standard pattern |

**Key insight:** Everything in this phase can be built with Hono's built-in streaming helper, Node's EventEmitter, and the browser's native EventSource API. No new npm packages are required, consistent with the project constraint.

## Common Pitfalls

### Pitfall 1: SSE Connection Dropped by Reverse Proxy / Response Buffering
**What goes wrong:** Nginx or Caddy buffers SSE responses, so the browser receives no events until the buffer fills or the connection closes — defeating the purpose of live progress.
**Why it happens:** Reverse proxies buffer HTTP responses by default. SSE requires streaming headers.
**How to avoid:** Set `X-Accel-Buffering: no` response header from Hono. Hono's `streamSSE` sets `Cache-Control: no-cache` and `Connection: keep-alive`, but not `X-Accel-Buffering`. Add it in the route handler: `c.header('X-Accel-Buffering', 'no')` before calling `streamSSE`.
**Warning signs:** Events arrive in a burst at the end rather than one-by-one.

### Pitfall 2: EventSource Reconnect Loop on Error
**What goes wrong:** `EventSource` automatically reconnects on error. If the scan finishes and the SSE stream closes (normal), `EventSource` reconnects and opens a new idle stream. The alpine component thinks the scan is still running.
**Why it happens:** EventSource reconnects whenever the connection drops, including on intentional server close.
**How to avoid:** On the `done` event, call `es.close()` explicitly before `es.onerror` can fire. Set `this.scanning = false` only in the `done` handler. The `onerror` handler should only fire for actual errors (network failure mid-scan), and should use a guard: `if (this.scanning) { ... }`.

### Pitfall 3: Scan Lock Not Released on Exception
**What goes wrong:** `_scanInProgress` stays `true` after a scan crash. No further scans can run until server restarts.
**Why it happens:** If `scanLibrary()` throws, `_scanInProgress` is never set back to `false`.
**How to avoid:** Always wrap in `try/finally`:
```typescript
export async function runScan(db: Database, libraryRoot: string): Promise<void> {
  _scanInProgress = true
  try {
    await scanLibrary(db, libraryRoot, defaultProbeFn, (event) => {
      scanEmitter.emit('progress', event)
      if (event.type === 'done') scanEmitter.emit('done')
    })
  } finally {
    _scanInProgress = false
  }
}
```

### Pitfall 4: Audnexus API — No Title/Author Search
**What goes wrong:** Enrichment silently returns 0 results for every book because `GET /books?title=...` does not exist.
**Why it happens:** D-09 assumed a search-by-title endpoint. The official API documentation confirms only `GET /books/{ASIN}` exists.
**How to avoid:** See Open Questions for the resolution path. In the meantime, the implementation must be written to be ASIN-aware: if no ASIN is present, skip enrichment and count the book as "not enriched" in the summary.

### Pitfall 5: SW Precache Revision Not Bumped
**What goes wrong:** Service worker serves cached old `index.html` and `style.css` after the tab UI changes.
**Why it happens:** Workbox precache entries are keyed by revision string. If the revision is unchanged, the SW serves the cached version.
**How to avoid:** Bump the precache revision string in `public/sw.js` whenever `index.html` or `style.css` changes. This is documented in project memory (MEMORY.md).

### Pitfall 6: `x-if` vs `x-show` for Tab Panels
**What goes wrong:** If the Users tab is wrapped in `x-if`, switching to Library unmounts it — resetting the create form, delete confirmations, and reset password states.
**Why it happens:** `x-if` removes the DOM node entirely on false; `x-show` hides it with CSS.
**How to avoid:** Use `x-show` for both tab content panels. Only the outer admin container uses `x-if` (established behavior from Phase 7).

## Code Examples

### streamSSE with event types (Hono official docs)
```typescript
// Source: https://hono.dev/docs/helpers/streaming
import { streamSSE } from 'hono/streaming'

app.get('/sse', async (c) => {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: JSON.stringify({ message: 'hello' }),
      event: 'update',
      id: '1',
    })
    await stream.sleep(1000)
  })
})
```

### EventSource in browser (no library needed)
```javascript
const es = new EventSource('/api/scan/progress')
es.addEventListener('file', (e) => { const d = JSON.parse(e.data); /* update UI */ })
es.addEventListener('done', (e) => { es.close(); /* finalize */ })
es.onerror = () => { es.close(); /* error handling */ }
```

### Audnexus book lookup by ASIN (verified from official docs)
```typescript
// Source: https://audnex.us/ — GET /books/{ASIN}
const res = await fetch('https://api.audnex.us/books/B002V1BZE8')
// Returns: { asin, title, authors[], narrators[], description, image, series: {name, position}, ... }
```

### Hono route with adminOnly middleware (existing pattern from src/routes/users.ts)
```typescript
const scan = new Hono<{ Variables: AuthVariables }>()
scan.use('/*', adminOnly)
scan.post('/scan', async (c) => { ... })
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long-polling for progress updates | SSE (Server-Sent Events) | Widely adopted 2018+; Hono native since v4 | One-way push; browser handles reconnect; no polling overhead |
| WebSocket for server → browser progress | SSE | SSE is sufficient for one-way progress; WS adds handshake overhead | Simpler implementation; no ws library needed |
| `fluent-ffmpeg` for ffprobe calls | Direct `child_process.spawn` | Deprecated May 2025 | Already handled in project — do not introduce fluent-ffmpeg |

**Deprecated/outdated:**
- `EventSource` polyfills: Not needed — all target browsers (iOS Safari 14+, Chrome 57+) support EventSource natively.
- `fluent-ffmpeg`: Archived and deprecated May 2025 — already excluded from this project.

## Open Questions

1. **Audnexus enrichment without ASIN (CRITICAL — blocks D-08 implementation)**
   - What we know: The Audnexus API only provides `GET /books/{ASIN}`. There is no title/author search endpoint. This is confirmed by official API docs at audnex.us and GitHub source code review.
   - What's unclear: How does D-09 ("lookup uses book title + author as search keys") get implemented against this API?
   - Recommendation: The planner must choose one approach and document it as a decision:
     - **Option A (Skip enrichment entirely for v1.1):** Count all books as "not enriched". Satisfy D-10/LIBM-09. Enrichment becomes a placeholder for when ASINs are stored.
     - **Option B (ASIN from m4b tags):** Check if the probe step extracts an ASIN from the m4b's ID tags (some ripped Audible books embed the ASIN in `asin`, `audible_asin`, or a comment tag). If found, use it; otherwise skip.
     - **Option C (External ASIN lookup via Audible search API):** Query `https://api.audible.com/1.0/catalog/products?title=...&author=...` to find ASIN, then pass to Audnexus. This adds complexity and a dependency on an unofficial API — not recommended for v1.1.
   - **Recommended path:** Option B — check for ASIN in existing probe output (`NormalizedMetadata`). If `ffprobe` already extracts it, zero extra work. If not, add one field to `normalizeMetadata()`. Fall back gracefully (Option A behavior) when ASIN is absent.

2. **Watcher interaction with scan lock**
   - What we know: The watcher calls `scanLibrary()` on a 5-minute interval. If a manual scan is running, the watcher should not interfere.
   - What's unclear: Should the watcher skip its interval tick if `_scanInProgress` is true, or queue behind it?
   - Recommendation: Skip the tick. Add `if (isScanRunning()) return` at the top of the watcher interval callback. Queuing adds complexity with no benefit (the manual scan already covers the full walk).

3. **Scan summary tracking for "updated" vs "new" books**
   - What we know: The existing `scanLibrary()` only computes `newOrUpdated = afterCount - beforeCount`. D-12 requires separate "new" and "updated" counts.
   - Recommendation: Track counts by comparing `existing` (from the existing/unchanged check in `scanFile()`) — pass a result object back from `scanFile()` or use a counter struct passed by reference into the callback.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none — `bun test` discovers `*.test.ts` automatically |
| Quick run command | `bun test src/routes/scan.test.ts src/scanner/enrichment.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIBM-01 | POST /api/scan returns 200 for admin, 403 for non-admin | unit | `bun test src/routes/scan.test.ts` | ❌ Wave 0 |
| LIBM-02 | GET /api/scan/progress streams SSE events during scan | integration | `bun test src/routes/scan.test.ts` | ❌ Wave 0 |
| LIBM-03 | POST /api/scan returns 409 while scan in progress | unit | `bun test src/routes/scan.test.ts` | ❌ Wave 0 |
| LIBM-08 | enrichBook() writes description/narrator/series when ASIN present; skips when absent | unit | `bun test src/scanner/enrichment.test.ts` | ❌ Wave 0 |
| LIBM-09 | enrichBook() returns null gracefully when fetch throws or times out | unit | `bun test src/scanner/enrichment.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test src/routes/scan.test.ts src/scanner/enrichment.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/routes/scan.test.ts` — covers LIBM-01, LIBM-02, LIBM-03
- [ ] `src/scanner/enrichment.test.ts` — covers LIBM-08, LIBM-09

## Sources

### Primary (HIGH confidence)
- https://hono.dev/docs/helpers/streaming — `streamSSE` API, `writeSSE` parameters, full example. Verified March 2026.
- https://audnex.us/ — Audnexus API spec. Confirmed: only `GET /books/{ASIN}`, no title/author search. Verified March 2026.
- `/home/coke/gits/spine/src/scanner/index.ts` — existing `scanLibrary()` function; `ProbeFn` pattern; concurrency loop structure.
- `/home/coke/gits/spine/src/routes/users.ts` — existing `adminOnly` middleware pattern; Hono route structure.
- `/home/coke/gits/spine/public/index.html` — existing admin component; `x-data` structure; `x-if` outer wrapper.
- `/home/coke/gits/spine/public/style.css` — existing `.download-progress-bar` pattern (reusable for scan progress bar).

### Secondary (MEDIUM confidence)
- https://github.com/laxamentumtech/audnexus — Source code confirms only ASIN routes; no book search by text.
- https://github.com/honojs/discussions/1355 — Community confirmation of SSE support in Hono.

### Tertiary (LOW confidence)
- WebSearch: `X-Accel-Buffering: no` header for nginx SSE — confirmed by multiple community sources but not tested in this specific Bun/Hono config.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tooling already installed and in use; Hono streamSSE confirmed from official docs
- Architecture: HIGH — SSE/EventEmitter pattern is well-documented; Alpine tab pattern follows established x-show/x-if guidance from Phase 7
- Audnexus enrichment: MEDIUM — API contract confirmed (ASIN-only), but implementation path depends on Open Question #1 resolution
- Pitfalls: HIGH — SSE reconnect behavior and precache issue documented from direct code review

**Research date:** 2026-03-23
**Valid until:** 2026-04-22 (Audnexus API is stable; Hono 4.x is stable)
