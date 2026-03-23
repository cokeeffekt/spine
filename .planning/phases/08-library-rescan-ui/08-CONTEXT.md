# Phase 8: Library Rescan UI - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can trigger a library rescan from the browser, see live progress (files scanned / total) via SSE, and receive Audnexus metadata enrichment for books with incomplete data. Concurrent rescans are prevented. After completion, the library grid auto-refreshes for all users.

</domain>

<decisions>
## Implementation Decisions

### Admin Page Integration
- **D-01:** Add tabs to the existing admin page: "Users" | "Library". Each tab shows its own content. The admin view retains its `x-if` wrapper; tab state is local to the admin component.
- **D-02:** The "Library" tab contains the rescan button, progress display, and scan summary. The "Users" tab retains the existing user management table from Phase 7.

### Scan Trigger & Progress UX
- **D-03:** A "Rescan Library" button on the Library tab triggers `POST /api/scan` (admin-only).
- **D-04:** While scanning, a horizontal progress bar displays "Scanning... 42/128 files" with live updates via Server-Sent Events (SSE) from `GET /api/scan/progress`.
- **D-05:** The backend modifies `scanLibrary()` (or wraps it) to emit progress events: file count, files scanned so far, current file name. SSE endpoint streams these to the browser.
- **D-06:** The rescan button is disabled during a scan with text "Scan in progress". The progress bar shows the current scan's live status. Admin can watch but cannot start another scan.
- **D-07:** Backend maintains a scan-in-progress flag (in-memory singleton). `POST /api/scan` returns 409 if a scan is already running (LIBM-03).

### Audnexus Enrichment
- **D-08:** Enrichment runs during the scan, per book. After each book is probed, if metadata is incomplete (missing description, cover, narrator, or series), the scanner queries the Audnexus API for that book.
- **D-09:** Audnexus lookup uses book title + author as search keys. Endpoint: `https://api.audnex.us/books` (or equivalent). Researcher should verify the current API contract.
- **D-10:** If Audnexus is unreachable or returns no match, silently skip that book. No per-book error in the progress stream. The scan continues normally (LIBM-09).
- **D-11:** Enrichment results (description, cover URL, narrator, series) are written to the books table. Existing non-null fields are NOT overwritten — only fill gaps.

### Post-Scan Behavior
- **D-12:** On scan completion, show a summary below the progress bar: "Scan complete: 3 new, 1 updated, 0 missing, 2 not enriched".
- **D-13:** The library grid auto-refreshes after scan completes so new/updated books appear immediately. The SSE "done" event triggers a `$store.library.loadBooks()` call.
- **D-14:** The progress bar and summary persist on the Library tab until the next scan is triggered or the admin navigates away.

### Claude's Discretion
- Exact SSE event format and field names
- Whether to show "enriching..." as a sub-status in the progress bar or keep it merged into the file count
- Tab styling (reuse nav patterns or new tab component)
- Whether the periodic watcher (5-min interval) should also trigger progress events or remain console-only

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scanner
- `src/scanner/index.ts` — existing `scanLibrary()` and `scanFile()` functions that need progress hooks
- `src/scanner/watcher.ts` — periodic scan watcher (5-min interval)
- `src/scanner/probe.ts` — ffprobe integration for metadata extraction
- `src/scanner/cover.ts` — cover art extraction logic

### Admin UI
- `public/index.html` — admin view (Phase 7, wrapped in `x-if`, uses Alpine.js x-data)
- `public/style.css` — admin CSS classes (`.admin-container`, `.admin-table`, etc.)
- `.planning/phases/07-admin-user-management/07-CONTEXT.md` — Phase 7 decisions, admin page patterns

### API
- `src/routes/users.ts` — admin-only route pattern (uses `adminOnly` middleware)
- `src/middleware/auth.ts` — `authMiddleware` and `adminOnly` middleware

### Requirements
- `.planning/REQUIREMENTS.md` — LIBM-01, LIBM-02, LIBM-03, LIBM-08, LIBM-09

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scanLibrary()` in `src/scanner/index.ts` — walks library, probes files with concurrency 4, marks missing. Needs progress callback injection, not rewrite.
- `adminOnly` middleware — reuse for `POST /api/scan` and `GET /api/scan/progress` routes.
- Admin CSS patterns (`.admin-container`, `.admin-table`, `.btn-primary`, `.admin-status`) — reuse for Library tab styling.
- `$store.library.loadBooks()` — existing method to refresh library grid, can be called from SSE "done" handler.

### Established Patterns
- Alpine.js `x-data` with async methods and `$store` for cross-component state (Phase 7 admin view).
- `x-if` for conditional DOM rendering — prevents expression crashes when component is hidden.
- Hono route handlers with `authMiddleware` + `adminOnly` middleware chain.
- SW precache revisions must be bumped when index.html or style.css change.

### Integration Points
- New routes: `POST /api/scan`, `GET /api/scan/progress` (SSE) — mount in `src/server.ts`.
- `scanLibrary()` needs a progress callback parameter to emit events during scan.
- Admin view in `public/index.html` needs tab UI wrapping existing Users content + new Library content.
- Audnexus client is new code — no existing HTTP client patterns beyond `fetch()`.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for SSE streaming, tab UI, and Audnexus integration.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-library-rescan-ui*
*Context gathered: 2026-03-23*
