# Phase 7: Admin User Management - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can view, create, delete, and reset passwords for all user accounts from a browser-based admin page. This phase delivers: a GET users API endpoint, a last-admin deletion guard on the backend, a new "admin" view in the frontend with a user management table, and all CRUD interactions (create, delete, reset password) with inline UX patterns.

</domain>

<decisions>
## Implementation Decisions

### Admin Page Access
- **D-01:** Add a "Users" text link to the nav bar, visible only when `$store.auth.role === 'admin'`. Regular users see no admin link.
- **D-02:** Admin page is a new view in `$store.app.view` (value: `'admin'`), consistent with existing `'login'`, `'library'`, `'detail'` views.
- **D-03:** Player bar remains visible on the admin view — admin can manage users while listening.

### User List Display
- **D-04:** User list rendered as a simple HTML table with columns: Username, Role, Created, Last Login, Actions.
- **D-05:** The current admin's own row shows a "(You)" badge next to the username.
- **D-06:** Requires adding `created_at` (DEFAULT CURRENT_TIMESTAMP) and `last_login_at` columns to the `users` table. `last_login_at` updated on each successful login in `src/routes/auth.ts`.
- **D-07:** New `GET /api/users` endpoint (admin-only) returns all users with id, username, role, created_at, last_login_at.

### Action UX — Create User
- **D-08:** Inline form above the user table: username + password + role dropdown (default: "user") + Create button.
- **D-09:** On success, the new user appears in the table immediately. Inline status message: "User {username} created". Message auto-clears after a few seconds.
- **D-10:** On error (e.g., duplicate username), inline error message below the form.

### Action UX — Delete User
- **D-11:** Delete button on each user row (except the admin's own row and the last admin).
- **D-12:** Inline confirm: click delete -> button changes to "Confirm delete?" with a 3-second timeout before reverting to the normal delete button.
- **D-13:** On success, the row is removed from the table. Inline status message: "User {username} deleted".

### Action UX — Reset Password
- **D-14:** Click reset icon -> a password input field appears inline in that user's row with Save/Cancel buttons.
- **D-15:** On success, the field collapses and inline status message shows: "Password reset for {username}". All of that user's sessions are invalidated (existing backend behavior).

### Last-Admin Guard
- **D-16:** Backend: Before deleting an admin user, count admins in DB. If count === 1, return 400 with `{ "error": "Cannot delete the last admin" }`. This supplements the existing self-deletion guard.
- **D-17:** Frontend: If there is only one admin account, the delete button on that row is disabled/greyed out with tooltip: "Cannot delete the last admin".
- **D-18:** Self-deletion is always blocked (keep existing behavior). Admins cannot delete their own account regardless of admin count.

### Claude's Discretion
- CSS styling for the admin table and forms (follow existing style.css patterns)
- Whether the create form is always visible or toggled with a button
- Exact date formatting for created_at and last_login_at columns
- Whether to add a "Back to Library" link or rely on the nav bar

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Backend (Phase 2 patterns)
- `src/routes/users.ts` — Existing admin-only user CRUD (create, delete, reset password). Add GET /api/users here.
- `src/middleware/auth.ts` — `authMiddleware` and `adminOnly` middleware. Both needed for admin routes.
- `src/routes/auth.ts` — Login handler. Update to set `last_login_at` on successful authentication.
- `src/db/schema.ts` — Existing table DDL. Add `created_at` and `last_login_at` columns to users table.

### Existing Frontend
- `public/index.html` — Single-page app. Alpine.js stores (`auth`, `app`, `library`, `player`, `downloads`). Add `'admin'` view and admin section HTML.
- `public/style.css` — All CSS. Add admin table and form styles here.

### Stack Guidance
- `CLAUDE.md` §Technology Stack — Alpine.js 3.15.x (CDN), Hono 4.12.x, Bun.password for Argon2id

### Requirements
- `.planning/REQUIREMENTS.md` — ADMIN-01 through ADMIN-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/routes/users.ts` — Already has create/delete/reset-password endpoints with `adminOnly` middleware. Only needs GET endpoint added.
- `src/middleware/auth.ts:adminOnly` — Reuse for the new GET /api/users endpoint.
- `$store.auth.role` — Already tracks user role in the frontend. Use for conditional nav link visibility.

### Established Patterns
- Views are controlled via `$store.app.view` — set to 'login', 'library', or 'detail'. Admin page follows the same pattern.
- API calls use plain `fetch()` with session cookie (HttpOnly, auto-sent).
- Error responses are `{ "error": "message" }` with appropriate HTTP status codes (D-09 from Phase 2).
- User table DDL uses `db.run()` with IF NOT EXISTS in `schema.ts`.

### Integration Points
- Nav bar in `public/index.html` (line ~118) — add admin link conditionally
- `$store.app.view` — add `'admin'` case
- `src/routes/users.ts` — add GET route, add last-admin guard to DELETE route
- `src/routes/auth.ts` — update login to write `last_login_at`
- `src/db/schema.ts` — ALTER TABLE or migration for new columns

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-admin-user-management*
*Context gathered: 2026-03-23*
