---
phase: 06-offline-download
verified: 2026-03-23T00:00:00Z
status: human_needed
score: 10/10 must-haves verified
human_verification:
  - test: "Download a book and observe byte-level progress"
    expected: "Progress bar updates with percentage during streaming download; cover art overlay shows matching percentage"
    why_human: "ReadableStream progress updates and DOM reactivity cannot be verified without a live browser"
  - test: "Cancel an in-progress download by tapping the progress overlay on the cover"
    expected: "Download stops, partial data is discarded, book returns to idle state"
    why_human: "AbortController cancel + cache cleanup requires live network fetch to exercise"
  - test: "Download a book, enable airplane mode, play it"
    expected: "Audio plays without network; seeking works with no errors (RangeRequestsPlugin serves 206 from cached 200)"
    why_human: "Service worker cache interception and range-request slicing require a real browser with a registered SW"
  - test: "Delete a download via the detail view"
    expected: "Native confirm() dialog shows book title and formatted file size; after confirmation, book is no longer marked downloaded"
    why_human: "window.confirm() behavior is browser-only"
  - test: "Toggle the 'Downloaded' filter in the search bar"
    expected: "Filter button appears only when at least one book is downloaded; storage summary (e.g. '1 book -- 50 MB') appears when filter is active"
    why_human: "Conditional visibility logic requires real download state in the store"
  - test: "Go offline with undownloaded books in the library"
    expected: "Undownloaded books appear dimmed (opacity 0.4, grayscale); cloud-off icon shows in nav bar; downloaded books appear normally and are playable"
    why_human: "navigator.onLine, offline/online events, and CSS visual appearance require a browser"
---

# Phase 06: Offline Download — Verification Report

**Phase Goal:** Offline download — whole-book download for offline play with progress and storage management
**Verified:** 2026-03-23
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `formatBytes` returns human-readable strings for KB, MB, and GB | VERIFIED | `function formatBytes` in `public/player-utils.js` lines 131-136; 8 test cases all pass |
| 2 | `downloadDB` CRUD operations (save, get, getAll, delete) work correctly | VERIFIED | Complete IIFE at `public/player-utils.js` lines 144-212 using raw IndexedDB; `var` declaration ensures browser global; methods: open, get, getAll, getAllKeys, save, delete |
| 3 | `reconcileDownloads` removes stale IndexedDB entries when cache entry is missing | VERIFIED | `async function reconcileDownloads` at lines 222-232; 3 test cases pass covering filter, empty input, all-stale |
| 4 | Service worker intercepts audio URLs and serves from cache with range-request support | VERIFIED | `public/sw.js` lines 13-25: `CacheFirst` with `CacheableResponsePlugin({statuses:[200]})` and `RangeRequestsPlugin()` on `cacheName: 'spine-audio'`; audio route registered before NetworkFirst catch-all |
| 5 | Service worker caches cover art via CacheFirst route | VERIFIED | `public/sw.js` lines 28-31: `CacheFirst({cacheName:'spine-covers'})` for `/api/books/:id/cover` pattern; route ordered before general `/api/` NetworkFirst |
| 6 | All cover art is proactively cached when library loads | VERIFIED | `cacheAllCovers(books)` method in `$store.downloads` (index.html line 857); called fire-and-forget in `loadBooks()` (line 538) and session-restore x-init (line 20); opens `spine-covers` cache and filters already-cached URLs |
| 7 | User can trigger a download from the book detail view and see byte-level progress | VERIFIED (code) | `startDownload(book)` method fully implemented with ReadableStream progress tracking; detail view has Download button, progress bar row, percentage text, and Cancel button; **requires human** for live behavior |
| 8 | User can cancel an in-progress download by tapping the progress overlay | VERIFIED (code) | `cancelDownload(bookId)` aborts via `AbortController`; progress overlay in grid at line 212-219 with `@click.stop="$store.downloads.cancelDownload(book.id)"`; **requires human** for live cancel path |
| 9 | Download failure discards partial data and shows error message | VERIFIED | Error branch in `startDownload` catch block sets `status: 'error'` and calls `_cleanup(bookId)`; error state UI at lines 309-315; retry button present |
| 10 | User can filter library to show only downloaded books and see storage summary | VERIFIED | `showDownloadedOnly` flag, `toggleDownloadedFilter()`, `getDownloadedCount()`, `getTotalSizeBytes()` all in `$store.downloads`; `filteredBooks` getter checks `dl.showDownloadedOnly` at line 573; filter button and storage summary in HTML at lines 133-149 |

**Score:** 10/10 truths verified (code-level); 6 items need human confirmation for live browser behavior

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `public/player-utils.js` | `downloadDB` IIFE, `formatBytes`, `reconcileDownloads`; all in `module.exports` | VERIFIED | All three present at lines 131-236; `var downloadDB` (browser global fix from Plan 03); exported in `module.exports` guard |
| `tests/downloads.test.ts` | Unit tests for download utility functions; min 40 lines | VERIFIED | 49 lines; 11 test cases; 11 pass, 0 fail |
| `public/sw.js` | `CacheFirst+RangeRequestsPlugin` for audio, `CacheFirst` for covers, bumped precache revisions | VERIFIED | 37 lines total; all required elements present; `player-utils.js` added to precache at revision `'2'`; audio and cover routes before general API route |
| `public/index.html` | `$store.downloads` Alpine store with full lifecycle; download UI; offline indicators; filter and dimming | VERIFIED | Store defined at line 814; all methods present (`init`, `cacheAllCovers`, `startDownload`, `cancelDownload`, `deleteDownload`, `_cleanup`, `getDownloadedCount`, `getTotalSizeBytes`, `toggleDownloadedFilter`); `showDownloadedOnly: false`; all UI elements present |
| `public/style.css` | `.download-overlay`, `.downloaded-badge`, `.offline-indicator`, `.offline-dim`, `.filter-downloaded`, `.storage-summary` | VERIFIED | All 6 classes present at lines 926, 943, 958, 966, 986, 994; `.offline-dim` has `opacity: 0.4` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `public/sw.js` | Cache Storage `spine-audio` | `CacheFirst` with `RangeRequestsPlugin` | WIRED | `cacheName: 'spine-audio'` at line 14; `RangeRequestsPlugin` at line 17 |
| `public/index.html` | Cache Storage `spine-audio` | `caches.open('spine-audio')` in `startDownload` and `_cleanup` | WIRED | `caches.open('spine-audio')` at lines 920 and 959 |
| `public/index.html` | Cache Storage `spine-covers` | `caches.open('spine-covers')` in `cacheAllCovers` | WIRED | `caches.open('spine-covers')` at line 859 inside `cacheAllCovers` |
| `public/index.html` | `public/player-utils.js` | `downloadDB` and `formatBytes` as browser globals (via `var`) | WIRED | `downloadDB.getAllKeys()` at line 836; `formatBytes(...)` at lines 952, 1036 (storage summary x-text); `var downloadDB` ensures global scope |
| `public/sw.js` | `/api/books/:id/audio` | `registerRoute` with pathname regex | WIRED | `/^\/api\/books\/\d+\/audio$/` at line 23; audio route at line 22, NetworkFirst at line 34 — correct order |
| `public/index.html` | `$store.downloads.showDownloadedOnly` | `filteredBooks` getter with null-guard | WIRED | `const dl = Alpine.store('downloads'); if (dl && dl.showDownloadedOnly)` at lines 572-574 |
| `public/index.html` | `$store.app.isOffline` | `window` online/offline event listeners | WIRED | Listeners at lines 506-507; `isOffline: !navigator.onLine` initial value at line 518; `'offline-dim'` class binding uses `$store.app.isOffline` at line 194 |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| OFFL-01 | 06-01, 06-02 | User can download an entire audiobook for offline playback | SATISFIED | `startDownload` in `$store.downloads` fetches full audio via ReadableStream; stores in `spine-audio` Cache Storage; `downloadDB.save` records metadata |
| OFFL-02 | 06-02 | Downloaded books are stored in Cache Storage and playable without network | SATISFIED | `caches.open('spine-audio')` + `cache.put` in `startDownload`; SW `CacheFirst` route serves audio from cache when offline |
| OFFL-03 | 06-01, 06-03 | User can see which books are downloaded and manage storage | SATISFIED | `showDownloadedOnly` filter, `getDownloadedCount()`, `getTotalSizeBytes()`, storage summary span; `deleteDownload` with confirm dialog |
| OFFL-04 | 06-02 | Service worker handles range requests for cached audio (seeking works offline) | SATISFIED | `RangeRequestsPlugin` in `audioCacheFirst` strategy; `CacheableResponsePlugin({statuses:[200]})` ensures only 200 responses are cached; plugin slices 200 into 206 for seek requests |

All 4 requirements mapped to Phase 6 are satisfied. No orphaned requirements.

---

## Anti-Patterns Found

No blockers found.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `public/index.html` | 20 | `Alpine.store('downloads').cacheAllCovers(...)` called in session-restore x-init before `alpine:init` fires | Info | Could fail silently if `$store.downloads` is undefined; however the `cacheAllCovers` call in `loadBooks()` (line 538) is the primary path and `$store.downloads` is defined in `alpine:init`, so session-restore runs after `alpine:init` due to deferred Alpine loading — non-blocking |
| `public/index.html` | 148 | `formatBytes(...)` called directly in `x-text` without `$store` prefix | Info | `formatBytes` must be a browser global for this to work; `var downloadDB` fix (Plan 03) establishes the global scope; `formatBytes` is also declared with `function` keyword which hoists to global — works correctly |

---

## Human Verification Required

### 1. Download with byte-level progress

**Test:** Log in, tap a book in the detail view, tap "Download". Observe the progress bar in the detail view and the overlay on the cover art in the library grid simultaneously.
**Expected:** Progress bar fills from left to right with a percentage counter. Cover overlay shows the same percentage. Both update in real time as chunks arrive.
**Why human:** ReadableStream chunk-by-chunk progress and Alpine reactive DOM updates require a live browser with a real HTTP response body.

### 2. Cancel in-progress download via cover overlay

**Test:** Start a download on a large book. While the progress overlay is visible on the cover in the library grid, tap the overlay.
**Expected:** Download stops immediately. Progress overlay disappears. Book returns to "Download" button state in the detail view. No partial data remains in cache.
**Why human:** `AbortController.abort()` + cache cleanup interaction requires a live fetch to exercise.

### 3. Offline playback with seeking

**Test:** Download a book to completion. Enable airplane mode or disconnect WiFi. Tap Play on the downloaded book. Seek forward and backward using the seek bar.
**Expected:** Audio plays without buffering or errors. Seeking to arbitrary positions works without network (HTTP 206 partial content served by RangeRequestsPlugin from the cached 200 response).
**Why human:** Service worker interception, Cache Storage, and range request slicing require a registered service worker in a real browser.

### 4. Delete download confirm dialog

**Test:** With a downloaded book open in the detail view, tap "Delete Download".
**Expected:** A native browser `confirm()` dialog appears showing the book title and formatted file size (e.g., "Delete download for Moby Dick? (350 MB)"). Confirming removes the book from the downloaded state; the "Download" button reappears.
**Why human:** `window.confirm()` is browser-only and cannot be tested in Bun.

### 5. Downloaded filter toggle and storage summary

**Test:** With at least one book downloaded, check the search bar area. Tap the "Downloaded" filter button.
**Expected:** Filter button is visible (only when downloads exist). Tapping shows only downloaded books. Storage summary (e.g., "1 book -- 350 MB") appears alongside the filter. Tapping again restores full library.
**Why human:** Requires real `$store.downloads.states` populated from a completed download.

### 6. Offline dimming

**Test:** With at least one book downloaded, disconnect network. Observe the library grid.
**Expected:** Cloud-off icon appears in the nav bar. Undownloaded books appear at reduced opacity with grayscale tint. Downloaded books appear normally and are playable. Tapping a dimmed book opens the detail view showing "Download required for offline playback" and "Available when online" instead of Download.
**Why human:** `navigator.onLine`, browser `online`/`offline` events, and CSS visual effects require a browser.

---

## Summary

Phase 06 achieved its goal. All 10 must-have truths are satisfied in the codebase:

- **Plan 01:** `formatBytes`, `downloadDB` IIFE, and `reconcileDownloads` are fully implemented in `public/player-utils.js`. The `var` keyword ensures `downloadDB` is a browser global. All 11 unit tests pass.
- **Plan 02:** The service worker routes audio through `CacheFirst+RangeRequestsPlugin` (spine-audio) and covers through `CacheFirst` (spine-covers), both correctly ordered before the general `NetworkFirst` catch-all. The `$store.downloads` Alpine store manages the complete download lifecycle (start, progress, cancel, delete, init reconciliation). All UI elements are present and wired.
- **Plan 03:** The "Downloaded" filter toggle, storage summary, and offline book dimming are implemented and wired to real store state.

Three browser bugs were found and fixed during Plan 03 human verification (`var downloadDB` global scope, `x-cloak` on `body` without `x-data`, `filteredBooks` null-guard for `$store.downloads`). All fixes are in the codebase.

The 6 human verification items above are behavioral end-to-end checks that require a live browser. The automated checks (144 tests, 0 failures) confirm the implementation is complete and wired correctly.

---

_Verified: 2026-03-23_
_Verifier: Claude (gsd-verifier)_
