# Milestones

## v1.1 Admin Tools & Library Improvements (Shipped: 2026-03-24)

**Phases completed:** 5 phases, 10 plans, 21 tasks

**Key accomplishments:**

- GET /api/users endpoint with last_login_at tracking, last-admin deletion guard, and schema migration for existing databases
- Alpine.js admin view with user table, accordion create form, inline delete confirm (3-second timeout), and inline password reset — all behind x-if guard to prevent Alpine evaluation errors
- Admin-triggered library rescan API with SSE progress streaming, scan lock singleton, and Audnexus metadata enrichment via ASIN lookup
- Admin Library tab with rescan trigger, live SSE progress bar, tab navigation, and Bun SSE compatibility fixes (raw ReadableStream + onopen flush)
- Alpine frontend wired for server-backed cross-device progress sync: fire-and-forget PUT on save/pause, offline flush on reconnect, furthest-position-wins on book open, and accent-colored progress bars on library tiles.
- Track sort utilities (parseTrackNumber, sortTracks, parseDiscNumber, DISC_FOLDER_RE) and chapters.file_path schema migration providing the ordering and typing foundation for the MP3 folder scanner
- MP3 audiobook folders fully recognized, scanned, and cataloged via ScanItem union type, scanFolder with disc-aware multi-track sorting, cumulative chapter timestamps, and grandparent-author fallback
- Per-track MP3 streaming endpoint (/audio/:chapterIdx) with HTTP 206 range support and format field in book detail API
- Format-aware MP3 player with track transitions, chapter jumping, cumulative progress tracking, per-track offline download, and CacheFirst service worker routing

---
