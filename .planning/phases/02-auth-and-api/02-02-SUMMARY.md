---
phase: 02-auth-and-api
plan: "02"
subsystem: api-routes
tags: [api, auth, streaming, tdd, hono, bun-sqlite]
dependency_graph:
  requires: [02-01]
  provides: [user-management-api, book-listing-api, audio-streaming-api, cover-art-api]
  affects: [03-frontend-pwa]
tech_stack:
  added: []
  patterns: [hono-sub-app, tdd-red-green, http-206-range-streaming, argon2id-password-hashing]
key_files:
  created:
    - src/routes/users.ts
    - src/routes/books.ts
    - src/routes/audio.ts
    - src/routes/cover.ts
    - src/routes/users.test.ts
    - src/routes/books.test.ts
    - src/routes/audio.test.ts
  modified:
    - src/server.ts
decisions:
  - "Cover route kept in separate cover.ts file to keep routes.ts focused on book data"
  - "audio.ts uses Bun.file().slice() for zero-copy range slicing per RESEARCH Pitfall 5/6 guidance"
  - "adminOnly middleware applied at sub-router level (users.use('/*', adminOnly)) — covers all user management routes"
  - "Password change in PATCH /users/:id/password deletes ALL sessions for that user (security: invalidates stale auth)"
metrics:
  duration: "4 minutes"
  completed_date: "2026-03-22"
  tasks_completed: 3
  files_created: 7
  files_modified: 1
---

# Phase 02 Plan 02: Protected API Routes Summary

**One-liner:** Full REST API surface (user CRUD, book listing/detail, cover art, audio streaming with HTTP 206) wired behind auth middleware using Hono sub-apps and Bun native APIs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | User management routes (admin-only CRUD) | e3f969f | src/routes/users.ts, src/routes/users.test.ts |
| 2 | Book listing, book detail, and cover art routes | 2e33012 | src/routes/books.ts, src/routes/cover.ts, src/routes/books.test.ts |
| 3 | Audio streaming route (HTTP 206) and final server wiring | 798c10b | src/routes/audio.ts, src/routes/audio.test.ts, src/server.ts |

## What Was Built

### User Management (src/routes/users.ts)
- `POST /api/users` — creates user with Argon2id-hashed password (admin only), returns `{ id, username, role }` with 201
- `DELETE /api/users/:id` — deletes user with self-delete protection (admin only), returns 200 or 404
- `PATCH /api/users/:id/password` — resets password + invalidates ALL sessions for that user (admin only)
- All routes gated by `adminOnly` middleware applied at sub-router level

### Book API (src/routes/books.ts)
- `GET /api/books` — flat JSON array with D-11 fields: `id, title, author, narrator, duration_sec, cover_url, has_chapters`; excludes `is_missing=1` books; ordered by `title COLLATE NOCASE`; `cover_url` computed in SQL with CASE WHEN; `has_chapters` from EXISTS subquery
- `GET /api/books/:id` — full book object + `chapters` array per D-12; covers all metadata fields

### Cover Art (src/routes/cover.ts)
- `GET /api/books/:id/cover` — serves cover image via `Bun.file()` with MIME auto-detection; returns 404 if no cover_path or file missing on disk; includes `Cache-Control: private, max-age=86400`

### Audio Streaming (src/routes/audio.ts)
- `GET /api/books/:id/audio` — no Range header returns 200 with full `Content-Length`
- Range header returns 206 with `Content-Range: bytes start-end/total` and exact `Content-Length`
- Open-ended ranges (`bytes=N-`) correctly compute end as `totalSize - 1`
- Out-of-range or `start >= totalSize` returns 416 with `Content-Range: bytes */total`
- Uses `Bun.file().slice(start, end+1)` for zero-copy range slicing (end is exclusive in Bun)
- `file.exists()` check before `.size` access (Pitfall 6 from RESEARCH)

### Server Wiring (src/server.ts)
- All 4 route modules imported and mounted at `/api` after `authMiddleware`
- Auth middleware registered once at `app.use("/api/*", authMiddleware)` before route mounts

## Test Results

- **users.test.ts**: 17 tests — all pass
- **books.test.ts**: 16 tests — all pass
- **audio.test.ts**: 11 tests — all pass
- **Full suite (`bun test src/`)**: 103 tests — all pass

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all routes are fully functional with real DB queries and file I/O.

## Self-Check

### Files Exist
- src/routes/users.ts: FOUND
- src/routes/books.ts: FOUND
- src/routes/audio.ts: FOUND
- src/routes/cover.ts: FOUND
- src/routes/users.test.ts: FOUND
- src/routes/books.test.ts: FOUND
- src/routes/audio.test.ts: FOUND

### Commits Exist
- e3f969f: feat(02-02): admin user management routes with TDD
- 2e33012: feat(02-02): book listing, detail, and cover art routes with TDD
- 798c10b: feat(02-02): audio streaming route with HTTP 206 and server wiring

## Self-Check: PASSED
