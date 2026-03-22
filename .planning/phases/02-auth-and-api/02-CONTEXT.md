# Phase 2: Auth and API - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Household members can log in and access the library API with their own sessions. This phase delivers: user account management (admin-created), password-based authentication with persistent sessions, and all protected REST API endpoints (library listing, book details, audio streaming with HTTP 206, cover art).

</domain>

<decisions>
## Implementation Decisions

### Session & token strategy
- **D-01:** Use opaque session tokens stored in SQLite `sessions` table — not stateless JWT. Reason: AUTH-03 requires logout invalidation (revocation). Stateless JWTs cannot be revoked without a blocklist, which is just a worse version of a session table.
- **D-02:** Session token is a cryptographically random 32-byte hex string, stored in an HttpOnly, SameSite=Strict, Secure cookie named `session`.
- **D-03:** Session lifetime: 30 days from creation. No refresh token — long-lived session satisfies AUTH-05 (persist across browser refresh) without token rotation complexity.
- **D-04:** Logout deletes the session row from SQLite. Cookie is cleared on the response.

### Admin bootstrap & user management
- **D-05:** First admin created via environment variables: `ADMIN_USERNAME` and `ADMIN_PASSWORD`. On startup, if no users exist in the DB and both env vars are set, create the admin account. If env vars are missing and no users exist, log a warning but don't block startup.
- **D-06:** Two roles only: `admin` and `user`. Stored as a `role` column on the `users` table.
- **D-07:** Admin creates users via `POST /api/users` (API-only, no CLI command). Admin can also delete users and reset passwords via the API.
- **D-08:** Users cannot change their own password in v1. Admin resets passwords on their behalf.

### API response conventions
- **D-09:** No envelope wrapper. Successful responses return the resource directly (object or array). Errors return `{ "error": "message" }` with appropriate HTTP status codes.
- **D-10:** Book listing (`GET /api/books`) returns a flat JSON array — no pagination. A household library is small enough (tens to low hundreds of books) that pagination adds complexity without benefit.
- **D-11:** Book listing fields: `id`, `title`, `author`, `narrator`, `duration_sec`, `cover_url` (relative path like `/api/books/:id/cover`), `has_chapters`.
- **D-12:** Book detail (`GET /api/books/:id`) returns the full book object plus a `chapters` array.
- **D-13:** All API routes are prefixed with `/api/`. The `/health` endpoint remains unauthenticated.

### Audio streaming & cover art
- **D-14:** Audio streaming (`GET /api/books/:id/audio`) uses a custom Hono handler that reads the .m4b file path from the DB, opens it with `Bun.file()`, and handles range requests manually (read `Range` header, respond with 206 + `Content-Range` + `Accept-Ranges: bytes`).
- **D-15:** Cover art (`GET /api/books/:id/cover`) reads the `cover_path` from the DB and serves the image file. Returns 404 if no cover exists.
- **D-16:** Audio responses set `Content-Type: audio/mp4` and `Cache-Control: private, max-age=86400`.

### Claude's Discretion
- Hono middleware organization (single auth middleware file vs inline)
- Database migration strategy for adding `users` and `sessions` tables to existing schema
- Exact error messages and HTTP status code mapping
- Test file organization and test helper patterns
- Whether to add `zod` validation on login/user-creation payloads (recommended by CLAUDE.md stack but not required)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing codebase (Phase 1 patterns)
- `src/server.ts` — Current Hono app setup, Bun.serve() pattern, existing `/health` endpoint
- `src/db/index.ts` — Database singleton pattern (`getDatabase()`), bun:sqlite initialization, WAL mode
- `src/db/schema.ts` — Existing `books` and `chapters` table DDL — new `users` and `sessions` tables must follow same style
- `src/types.ts` — Existing TypeScript interfaces for Book, Chapter — add User and Session types here

### Stack guidance
- `CLAUDE.md` §Technology Stack — Hono 4.12.x, Bun.password for Argon2id, jose for JWT (but D-01 overrides: using opaque tokens instead of JWT)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/index.ts:getDatabase()` — Singleton DB access, reuse for session/user queries
- `src/db/schema.ts` — Add `users` and `sessions` table creation alongside existing `books`/`chapters`
- `src/server.ts` — Hono app instance, add routes and middleware here

### Established Patterns
- Database uses `bun:sqlite` with synchronous API — all new DB operations should follow this
- Schema creation via `db.run()` with IF NOT EXISTS DDL in `schema.ts`
- Server uses `Bun.serve()` with Hono's `fetch` handler

### Integration Points
- Auth middleware wraps all `/api/*` routes
- Book listing/detail endpoints query existing `books` and `chapters` tables
- Audio streaming reads `file_path` from `books` table to locate .m4b on disk
- Cover art reads `cover_path` from `books` table

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

- User self-service password change — could add in a later phase
- OAuth / magic link login — explicitly out of scope per REQUIREMENTS.md
- API rate limiting — not needed for household use
- User preferences table (for Phase 4 playback speed per user) — belongs in Phase 4

</deferred>

---

*Phase: 02-auth-and-api*
*Context gathered: 2026-03-22*
