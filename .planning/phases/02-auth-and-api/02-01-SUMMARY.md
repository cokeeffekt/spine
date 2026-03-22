---
phase: 02-auth-and-api
plan: "01"
subsystem: authentication
tags: [auth, sqlite, sessions, middleware, hono, bun-password, argon2id]
dependency_graph:
  requires: []
  provides: [users-table, sessions-table, auth-middleware, admin-bootstrap, login-endpoint, logout-endpoint]
  affects: [src/server.ts, src/db/schema.ts, src/types.ts]
tech_stack:
  added: [Bun.password (built-in Argon2id hashing), hono/cookie, hono/factory createMiddleware]
  patterns: [session-token auth (opaque random bytes), HttpOnly+SameSite=Strict cookie, constant-time login to prevent user enumeration, test isolation via _resetForTests() singleton reset]
key_files:
  created:
    - src/db/bootstrap.ts
    - src/db/bootstrap.test.ts
    - src/middleware/auth.ts
    - src/middleware/auth.test.ts
    - src/routes/auth.ts
    - src/routes/auth.test.ts
  modified:
    - src/db/schema.ts
    - src/db/index.ts
    - src/types.ts
    - src/server.ts
decisions:
  - "Opaque session token (randomBytes(32)) stored in sessions table — no JWT needed for this scope"
  - "Constant-time dummy hash verify for missing users to prevent timing-based enumeration"
  - "_resetForTests() exported from db/index.ts for test isolation — avoids module mock complexity"
  - "bootstrapAdmin placed inside startup async IIFE (before scan) — runs once on empty DB"
metrics:
  duration_seconds: 185
  completed_date: "2026-03-22"
  tasks_completed: 3
  files_created: 6
  files_modified: 4
---

# Phase 02 Plan 01: Auth Foundation Summary

**One-liner:** Session-based auth with Argon2id passwords, HttpOnly cookies, authMiddleware blocking /api/*, and admin bootstrap from env vars on first startup.

## What Was Built

### Task 1: Schema + Types + Bootstrap (commit 3df5d8a)

Extended `initializeDatabase` with `users` and `sessions` DDL:
- `users`: `id`, `username UNIQUE`, `password_hash`, `role CHECK('admin'|'user')`, `created_at`
- `sessions`: `token PRIMARY KEY`, `user_id REFERENCES users(id) ON DELETE CASCADE`, `expires_at`, `created_at`
- Indexes on `sessions(user_id)` and `sessions(expires_at)`

Added `User` and `Session` TypeScript interfaces to `src/types.ts`.

Created `bootstrapAdmin`: reads `ADMIN_USERNAME` + `ADMIN_PASSWORD` env vars, skips if users exist, hashes with `Bun.password.hash()` (Argon2id), inserts admin row, warns if no users and vars missing.

### Task 2: Auth Middleware (commit aabd288)

`authMiddleware`: reads `session` cookie, queries sessions+users JOIN with `expires_at > datetime('now')`, sets `c.get('userId')` and `c.get('role')` on success, returns 401 otherwise.

`adminOnly`: checks `c.get('role') === 'admin'`, returns 403 if not.

Added `_resetForTests()` to `src/db/index.ts` to reset the singleton `_db` between tests.

### Task 3: Login/Logout Routes + Server Wiring (commit b7b7f1c)

`POST /auth/login`: validates body, queries user, constant-time Argon2id verify, generates `randomBytes(32)` token, inserts session with 30-day expiry, sets `HttpOnly; SameSite=Strict; Path=/` cookie.

`POST /auth/logout`: reads cookie, deletes session row, clears cookie, 401 if no cookie.

Updated `src/server.ts`:
- Mount `authRoutes` at `/auth` (unauthenticated)
- Apply `authMiddleware` to `/api/*`
- Call `bootstrapAdmin(db)` inside startup IIFE before scan

## Test Results

All 59 tests pass across the full `src/` suite:
- 4 schema tests (existing, still pass)
- 7 bootstrap tests
- 6 auth middleware tests
- 8 auth route tests
- 34 scanner tests (Phase 01, untouched)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no hardcoded empty values or placeholder data in this plan's deliverables.

## Self-Check: PASSED

Files exist:
- src/db/bootstrap.ts: FOUND
- src/db/bootstrap.test.ts: FOUND
- src/middleware/auth.ts: FOUND
- src/middleware/auth.test.ts: FOUND
- src/routes/auth.ts: FOUND
- src/routes/auth.test.ts: FOUND

Commits:
- 3df5d8a: FOUND (Task 1)
- aabd288: FOUND (Task 2)
- b7b7f1c: FOUND (Task 3)
