# Phase 7: Admin User Management - Research

**Researched:** 2026-03-23
**Domain:** Hono REST API extension, bun:sqlite schema migration, Alpine.js SPA view addition
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Admin Page Access**
- D-01: Add a "Users" text link to the nav bar, visible only when `$store.auth.role === 'admin'`. Regular users see no admin link.
- D-02: Admin page is a new view in `$store.app.view` (value: `'admin'`), consistent with existing `'login'`, `'library'`, `'detail'` views.
- D-03: Player bar remains visible on the admin view — admin can manage users while listening.

**User List Display**
- D-04: User list rendered as a simple HTML table with columns: Username, Role, Created, Last Login, Actions.
- D-05: The current admin's own row shows a "(You)" badge next to the username.
- D-06: Requires adding `created_at` (DEFAULT CURRENT_TIMESTAMP) and `last_login_at` columns to the `users` table. `last_login_at` updated on each successful login in `src/routes/auth.ts`.
- D-07: New `GET /api/users` endpoint (admin-only) returns all users with id, username, role, created_at, last_login_at.

**Action UX — Create User**
- D-08: Inline form above the user table: username + password + role dropdown (default: "user") + Create button.
- D-09: On success, the new user appears in the table immediately. Inline status message: "User {username} created". Message auto-clears after a few seconds.
- D-10: On error (e.g., duplicate username), inline error message below the form.

**Action UX — Delete User**
- D-11: Delete button on each user row (except the admin's own row and the last admin).
- D-12: Inline confirm: click delete -> button changes to "Confirm delete?" with a 3-second timeout before reverting to the normal delete button.
- D-13: On success, the row is removed from the table. Inline status message: "User {username} deleted".

**Action UX — Reset Password**
- D-14: Click reset icon -> a password input field appears inline in that user's row with Save/Cancel buttons.
- D-15: On success, the field collapses and inline status message shows: "Password reset for {username}". All of that user's sessions are invalidated (existing backend behavior).

**Last-Admin Guard**
- D-16: Backend: Before deleting an admin user, count admins in DB. If count === 1, return 400 with `{ "error": "Cannot delete the last admin" }`. This supplements the existing self-deletion guard.
- D-17: Frontend: If there is only one admin account, the delete button on that row is disabled/greyed out with tooltip: "Cannot delete the last admin".
- D-18: Self-deletion is always blocked (keep existing behavior). Admins cannot delete their own account regardless of admin count.

### Claude's Discretion
- CSS styling for the admin table and forms (follow existing style.css patterns)
- Whether the create form is always visible or toggled with a button
- Exact date formatting for created_at and last_login_at columns
- Whether to add a "Back to Library" link or rely on the nav bar

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMIN-01 | Admin can view a list of all user accounts in the browser | GET /api/users endpoint + admin view HTML table in index.html |
| ADMIN-02 | Admin can create a new user account from the admin UI | Existing POST /api/users endpoint + inline create form in admin view |
| ADMIN-03 | Admin can delete a user account (with last-admin guard preventing lockout) | Existing DELETE /api/users/:id + last-admin count guard addition + disabled button in frontend |
| ADMIN-04 | Admin can reset another user's password from the admin UI | Existing PATCH /api/users/:id/password + inline row expand UX |
</phase_requirements>

---

## Summary

Phase 7 is an additive phase with minimal risk: three of the four backend requirements (create, delete, reset password) are already implemented in `src/routes/users.ts`. The work is precisely scoped to: (1) a database schema addition of one column (`last_login_at`) to the users table, (2) one new API endpoint (`GET /api/users`), (3) one guard addition to `DELETE /api/users/:id`, (4) a `last_login_at` write in the login handler, and (5) a new `'admin'` view section in `public/index.html` with its Alpine.js store registration and CSS.

The `created_at` column already exists in the users table with `DEFAULT (datetime('now'))`. Only `last_login_at` is missing. The bun:sqlite approach for schema migration in this project is to add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — but bun:sqlite does not support `IF NOT EXISTS` on `ALTER TABLE`. The safe approach is to use `try/catch` around the ALTER, or check `PRAGMA table_info` first, which is the standard pattern for this stack.

The Alpine.js admin view follows the exact same pattern as `'library'` and `'detail'` views: an `x-show="$store.app.view === 'admin'"` div in `index.html`, nav bar extension for the admin link, and inline Alpine data objects for the create form and per-row state (password reset expand, delete confirm). The nav bar currently shows for `'library'` and `'detail'` — it must be extended to also show for `'admin'` so the admin can navigate back.

**Primary recommendation:** Add schema migration in `initializeDatabase()` via a try/catch ALTER TABLE, add GET /api/users behind existing `adminOnly` middleware, add last-admin guard to DELETE route, update login to write `last_login_at`, then add the admin view HTML + CSS following existing patterns.

---

## Standard Stack

All work uses the existing project stack. No new dependencies.

### Core (already in use)
| Library | Version | Purpose | Relevance to Phase 7 |
|---------|---------|---------|----------------------|
| Hono | 4.12.x | HTTP framework | Add GET route + guard to users router |
| bun:sqlite | Bun built-in | Database | ALTER TABLE migration for last_login_at |
| Alpine.js | 3.15.x CDN | Frontend reactivity | New admin view, store additions |
| Bun.password | Bun built-in | Password hashing | Already used in create/reset — no change |

### No new dependencies
The v1.1 constraint (STATE.md) explicitly states: "No new npm dependencies for v1.1 — all features use existing stack." Phase 7 requires no new packages.

---

## Architecture Patterns

### Backend: Existing Route Extension Pattern

The users router (`src/routes/users.ts`) already applies `adminOnly` middleware to all routes via `users.use('/*', adminOnly)`. Adding GET /api/users requires only a new `.get()` handler in the same file.

```typescript
// Source: src/routes/users.ts existing pattern
users.get('/users', (c) => {
  const db = getDatabase()
  const rows = db.query<{
    id: number; username: string; role: string;
    created_at: string; last_login_at: string | null
  }, []>(
    'SELECT id, username, role, created_at, last_login_at FROM users ORDER BY created_at ASC'
  ).all()
  return c.json(rows)
})
```

### Backend: Last-Admin Guard Pattern

The self-deletion guard in the existing DELETE handler uses an early return with `c.json({ error }, 400)`. The last-admin guard follows identical structure, inserted before the DELETE query:

```typescript
// Guard order: self-deletion first, then last-admin check
if (id === currentUserId) {
  return c.json({ error: 'Cannot delete yourself' }, 400)
}
// NEW: last-admin guard
const target = db.query<{ role: string }, [number]>(
  'SELECT role FROM users WHERE id = ?'
).get(id)
if (target?.role === 'admin') {
  const adminCount = db.query<{ n: number }, []>(
    'SELECT COUNT(*) AS n FROM users WHERE role = ?'
  ).get('admin') // Note: use parameterized query
  // actually: db.query('SELECT COUNT(*) AS n FROM users WHERE role = "admin"').get()
  if ((adminCount?.n ?? 0) <= 1) {
    return c.json({ error: 'Cannot delete the last admin' }, 400)
  }
}
```

### Backend: Schema Migration for last_login_at

`bun:sqlite` does not support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. The safe migration pattern for this project is a try/catch inside `initializeDatabase()`:

```typescript
// Source: bun:sqlite limitation — no IF NOT EXISTS for ALTER TABLE
// Pattern: try/catch on ALTER TABLE in initializeDatabase()
try {
  db.exec(`ALTER TABLE users ADD COLUMN last_login_at TEXT`)
} catch {
  // Column already exists — safe to ignore
}
```

This runs on every startup; existing databases gain the column on first run, new databases already have it from the CREATE TABLE statement.

The CREATE TABLE for users must also be updated to include `last_login_at TEXT` so new databases don't need the ALTER TABLE at all.

### Backend: Update Login to Write last_login_at

After the session INSERT in `src/routes/auth.ts`, add an UPDATE to set `last_login_at`:

```typescript
// After session is created, update last_login_at
db.query('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(user.id)
```

### Frontend: Admin View Registration Pattern

The existing view pattern uses Alpine stores set at `alpine:init` time. The admin view follows the identical structure:

1. Add `x-show="$store.app.view === 'admin'"` container div in index.html
2. Extend nav bar `x-show` to include `'admin'`: `x-show="... || $store.app.view === 'admin'"`
3. Add admin link in nav bar with `x-show="$store.auth.role === 'admin'"`
4. Register an Alpine store (or use inline `x-data`) for the admin page state

The admin page state is best handled as an inline `x-data` object on the admin container (rather than a global store), because admin state does not need to be shared with other views:

```html
<div x-show="$store.app.view === 'admin'"
     x-data="{
       users: [],
       loading: false,
       statusMsg: '',
       createForm: { username: '', password: '', role: 'user', error: '' },
       resetState: {},   // keyed by user id: { open: bool, password: '', saving: bool }
       deleteState: {},  // keyed by user id: { confirming: bool, timer: null }
       async loadUsers() { ... },
       async createUser() { ... },
       async deleteUser(user) { ... },
       async resetPassword(user) { ... }
     }"
     x-init="loadUsers()">
```

### Frontend: Inline Confirm Timeout Pattern (D-12)

The 3-second delete confirm timeout requires a timer per row. The `deleteState` object keyed by user id tracks this:

```javascript
// On first click: enter confirm state, start 3s timer
async startDelete(user) {
  this.deleteState[user.id] = { confirming: true, timer: null }
  const timer = setTimeout(() => {
    this.deleteState[user.id] = { confirming: false, timer: null }
  }, 3000)
  this.deleteState[user.id].timer = timer
},
// On confirm click: clear timer, call API
async confirmDelete(user) {
  if (this.deleteState[user.id]?.timer) clearTimeout(this.deleteState[user.id].timer)
  // ... DELETE fetch
}
```

### Frontend: Status Message Auto-Clear Pattern

The existing frontend has no global toast/notification system. The admin page uses a local `statusMsg` string that auto-clears via `setTimeout`:

```javascript
this.statusMsg = `User ${username} created`
setTimeout(() => { this.statusMsg = '' }, 3000)
```

### Frontend: Inline Password Reset Expand Pattern (D-14)

The `resetState` object tracks per-row open state. Using Alpine's `x-show` on a sub-element within the `<template x-for>` loop:

```html
<template x-for="user in users" :key="user.id">
  <tr>
    <!-- normal row content -->
    <td>
      <!-- actions: shown when NOT in reset mode -->
      <span x-show="!resetState[user.id]?.open">
        <button @click="resetState[user.id] = { open: true, password: '' }">Reset</button>
      </span>
      <!-- inline reset form: shown when in reset mode -->
      <span x-show="resetState[user.id]?.open">
        <input type="password" x-model="resetState[user.id].password">
        <button @click="saveReset(user)">Save</button>
        <button @click="resetState[user.id] = null">Cancel</button>
      </span>
    </td>
  </tr>
</template>
```

**Key gotcha:** Alpine's `x-for` with object-keyed state works correctly because Alpine tracks reactivity on the parent component's `x-data`. Mutations to `resetState[user.id]` trigger re-render via Alpine's reactivity proxy.

### Anti-Patterns to Avoid

- **Using a global Alpine store for admin page state:** Admin state (loading, users array, form fields) is view-local. A global store would pollute `Alpine.store` namespace unnecessarily. Use `x-data` on the admin container.
- **Calling `initializeDatabase()` changes without a migration guard:** Removing the old CREATE TABLE and only adding a new one would fail on existing deployments because CREATE TABLE IF NOT EXISTS won't add new columns. Always use ALTER TABLE for column additions.
- **Forgetting to parameterize the admin count query:** The admin count query must use the `?` placeholder, not string interpolation, even for a static string like `'admin'`, to stay consistent with project patterns.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom hash function | `Bun.password.hash()` — already used | Argon2id, already in users.ts |
| Session invalidation on password reset | Custom session cleanup | Existing `DELETE FROM sessions WHERE user_id = ?` — already in PATCH handler | Already implemented, tested |
| Role-based access control | Custom role check middleware | `adminOnly` middleware from `src/middleware/auth.js` | Already protects all /api/users routes |
| Toast notifications | Custom notification component | Inline `statusMsg` string with `setTimeout` clear | Sufficient for admin-only page; matches project simplicity principle |

---

## Common Pitfalls

### Pitfall 1: ALTER TABLE column addition on existing database
**What goes wrong:** Deploying schema.ts changes that add `last_login_at` to the CREATE TABLE statement works for fresh containers but fails silently for existing deployments — the column doesn't appear because CREATE TABLE IF NOT EXISTS does nothing when the table exists.
**Why it happens:** SQLite's CREATE TABLE IF NOT EXISTS skips the whole statement if the table exists, even if the schema changed.
**How to avoid:** Add BOTH (a) the column to the CREATE TABLE DDL (for new databases) AND (b) a try/catch ALTER TABLE ADD COLUMN in `initializeDatabase()` (for existing databases). The try/catch handles the "column already exists" error when the ALTER runs on a new database that already got the column from CREATE TABLE.
**Warning signs:** `last_login_at` returns null for all users despite logins — the column wasn't added.

### Pitfall 2: Alpine x-for reactivity with object-keyed state
**What goes wrong:** Assigning `this.deleteState[user.id] = { confirming: true }` inside an `x-for` loop may not trigger re-render if Alpine doesn't detect the new property on the object.
**Why it happens:** Alpine 3.x uses Proxy-based reactivity; direct property assignment on a plain object sometimes bypasses the proxy if the object was initialized as `{}` (empty).
**How to avoid:** Initialize `deleteState` with known keys in `loadUsers()` after the users array is populated, OR use Alpine's reactivity-safe pattern: `this.deleteState = { ...this.deleteState, [user.id]: { confirming: true } }` to trigger proxy detection via object replacement.
**Warning signs:** Delete confirm button doesn't change state visually on first click.

### Pitfall 3: Nav bar not showing on admin view
**What goes wrong:** The existing nav bar has `x-show="$store.app.view === 'library' || $store.app.view === 'detail'"`. If not updated to include `'admin'`, the nav bar disappears on the admin view and the user has no way to navigate back.
**Why it happens:** The admin view addition is a new case not covered by the existing condition.
**How to avoid:** Update the nav bar x-show condition to include `|| $store.app.view === 'admin'` before writing any other admin view HTML.
**Warning signs:** Nav bar missing on admin page; user is stuck with no navigation.

### Pitfall 4: last_login_at column type mismatch
**What goes wrong:** `last_login_at` stored as ISO 8601 text via `datetime('now')` in SQLite but displayed raw, showing the ugly SQLite format (`2026-03-23 14:22:01`) instead of something readable.
**Why it happens:** SQLite datetime strings are not ISO 8601 with 'T' separator — they use a space separator. JavaScript `new Date(str)` parses them correctly but the raw string display is ugly.
**How to avoid:** Format dates in the frontend using `new Date(dateStr).toLocaleDateString()` or similar, treating null `last_login_at` as "Never". This is a Claude's Discretion item per CONTEXT.md.
**Warning signs:** Date column shows raw SQLite datetime format or "Invalid Date".

### Pitfall 5: `$store.auth.username` comparison for "(You)" badge
**What goes wrong:** Comparing `user.username === $store.auth.username` to detect the current admin's row. This works for display but the CONTEXT.md decision is to disable the delete button on the admin's own row using the backend id comparison (`id === currentUserId`). The frontend should use `user.id` comparison where possible via the id returned in GET /api/users response.
**Why it happens:** The frontend stores `username` but not `userId` in `$store.auth`. The GET /api/users response includes `id`, and the login response includes `username` but not `id`.
**How to avoid:** Either (a) store `userId` in `$store.auth` from the login/me response, or (b) compare by username since usernames are unique. Option (b) is simpler given the existing `$store.auth.username` state. For the "(You)" badge and button disabling, `user.username === $store.auth.username` is correct and sufficient.
**Warning signs:** "(You)" badge appears on wrong row, or own-row delete button not disabled.

---

## Code Examples

### GET /api/users endpoint
```typescript
// Add to src/routes/users.ts (after existing POST handler)
// adminOnly middleware already applied via users.use('/*', adminOnly)
users.get('/users', (c) => {
  const db = getDatabase()
  const rows = db.query<{
    id: number
    username: string
    role: string
    created_at: string
    last_login_at: string | null
  }, []>(
    `SELECT id, username, role, created_at, last_login_at
     FROM users
     ORDER BY created_at ASC`
  ).all()
  return c.json(rows)
})
```

### Schema migration: add last_login_at to initializeDatabase()
```typescript
// In src/db/schema.ts — two changes:
// 1. Add column to CREATE TABLE users DDL:
//    last_login_at TEXT
// 2. Add ALTER TABLE after initializeDatabase exec block:
export function initializeDatabase(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );
    -- ... rest of schema unchanged
  `)

  // Migration: add last_login_at to existing databases
  // bun:sqlite has no "IF NOT EXISTS" for ALTER TABLE — use try/catch
  try {
    db.exec(`ALTER TABLE users ADD COLUMN last_login_at TEXT`)
  } catch {
    // Column already exists — this is expected for new DBs and after first migration
  }
}
```

### Login handler: write last_login_at
```typescript
// In src/routes/auth.ts — add after the session INSERT:
db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
  token, user.id, expiresAt.toISOString()
)
// NEW: record login time
db.query('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(user.id)
```

### Last-admin guard in DELETE handler
```typescript
// In src/routes/users.ts DELETE /users/:id handler:
users.delete('/users/:id', (c) => {
  const id = Number(c.req.param('id'))
  const currentUserId = c.get('userId')
  if (id === currentUserId) {
    return c.json({ error: 'Cannot delete yourself' }, 400)
  }

  const db = getDatabase()

  // NEW: last-admin guard
  const target = db.query<{ role: string }, [number]>(
    'SELECT role FROM users WHERE id = ?'
  ).get(id)
  if (target?.role === 'admin') {
    const adminCount = db.query<{ n: number }, []>(
      'SELECT COUNT(*) AS n FROM users WHERE role = "admin"'
    ).get()
    if ((adminCount?.n ?? 0) <= 1) {
      return c.json({ error: 'Cannot delete the last admin' }, 400)
    }
  }

  const result = db.query('DELETE FROM users WHERE id = ?').run(id)
  if (result.changes === 0) return c.json({ error: 'User not found' }, 404)
  return c.json({ success: true })
})
```

### Nav bar extension (index.html)
```html
<!-- Existing: -->
<nav class="nav-bar" x-show="$store.app.view === 'library' || $store.app.view === 'detail'">
<!-- Change to: -->
<nav class="nav-bar" x-show="$store.app.view === 'library' || $store.app.view === 'detail' || $store.app.view === 'admin'">
  <span class="nav-brand">Spine</span>
  <div class="nav-right">
    <!-- existing offline indicator, username, logout -->
    <!-- NEW: admin link, conditional on role -->
    <a class="nav-admin-link"
       x-show="$store.auth.role === 'admin'"
       @click.prevent="$store.app.view = 'admin'"
       href="#">Users</a>
  </div>
</nav>
```

### Admin view container skeleton (index.html)
```html
<div x-show="$store.app.view === 'admin'"
     class="admin-container"
     x-data="{
       users: [],
       loading: false,
       statusMsg: '',
       createForm: { username: '', password: '', role: 'user', error: '', submitting: false },
       resetState: {},
       deleteState: {},
       async loadUsers() {
         this.loading = true
         try {
           const res = await fetch('/api/users')
           if (res.ok) { this.users = await res.json() }
         } finally { this.loading = false }
       },
       isCurrentUser(user) { return user.username === $store.auth.username },
       isOnlyAdmin(user) {
         return user.role === 'admin' && this.users.filter(u => u.role === 'admin').length === 1
       }
     }"
     x-init="loadUsers()">
  <!-- status message -->
  <div class="admin-status" x-show="statusMsg" x-text="statusMsg"></div>
  <!-- create form (D-08) -->
  <!-- user table (D-04) -->
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `better-sqlite3` (CommonJS) | `bun:sqlite` (built-in) | v1.0 decision | No `IF NOT EXISTS` on ALTER TABLE; use try/catch migration pattern |
| `fluent-ffmpeg` | Direct `child_process.spawn` | May 2025 (deprecated) | N/A for this phase |

---

## Validation Architecture

nyquist_validation is enabled in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none — auto-discovered via `*.test.ts` naming |
| Quick run command | `bun test src/routes/users.test.ts src/db/schema.test.ts src/routes/auth.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMIN-01 | GET /api/users returns all users for admin | unit | `bun test src/routes/users.test.ts` | existing file — new tests needed |
| ADMIN-01 | GET /api/users returns 403 for non-admin | unit | `bun test src/routes/users.test.ts` | existing file — new tests needed |
| ADMIN-01 | last_login_at column present in schema | unit | `bun test src/db/schema.test.ts` | existing file — new test needed |
| ADMIN-02 | POST /api/users creates user (already tested) | unit | `bun test src/routes/users.test.ts` | ✅ existing passing tests |
| ADMIN-03 | DELETE /api/users/:id blocked when last admin | unit | `bun test src/routes/users.test.ts` | existing file — new test needed |
| ADMIN-03 | DELETE /api/users/:id allowed when 2+ admins | unit | `bun test src/routes/users.test.ts` | existing file — new test needed |
| ADMIN-04 | PATCH /api/users/:id/password resets + invalidates sessions (already tested) | unit | `bun test src/routes/users.test.ts` | ✅ existing passing tests |

**Frontend tests:** Alpine.js views are not covered by automated tests (no browser test runner in this project). Frontend behavior is verified manually per the existing project pattern.

**login last_login_at update:**

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMIN-01 | `last_login_at` set after successful login | unit | `bun test src/routes/auth.test.ts` | existing file — new test needed |

### Sampling Rate
- **Per task commit:** `bun test src/routes/users.test.ts src/db/schema.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
No new test files need to be created. All new tests are additions to existing test files:
- `src/routes/users.test.ts` — add GET /api/users describe block + last-admin guard tests
- `src/db/schema.test.ts` — add test asserting `last_login_at` column present in users table
- `src/routes/auth.test.ts` — add test asserting `last_login_at` updated after login

*(No new test infrastructure required — existing bun:test setup covers all additions)*

---

## Open Questions

1. **Date formatting for created_at and last_login_at (Claude's Discretion)**
   - What we know: SQLite datetime() returns `"2026-03-23 14:22:01"` (space separator, not ISO 8601 'T'). JavaScript `new Date("2026-03-23 14:22:01")` parses correctly in V8/Bun but may return Invalid Date in some strict parsers.
   - What's unclear: Whether the user wants relative times ("2 hours ago") or absolute dates ("Mar 23, 2026").
   - Recommendation: Use `new Date(str).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })` for created_at, and `last_login_at ? new Date(last_login_at).toLocaleString() : 'Never'` for last_login_at. Evaluates to locale-appropriate format with no extra library.

2. **Create form visibility (Claude's Discretion)**
   - What we know: D-08 specifies "inline form above the user table" but does not specify whether it is always visible or toggled.
   - Recommendation: Always-visible form is simpler to implement and consistent with the page purpose (admin creating users is a primary action). A toggle button would add complexity with minimal UX benefit given this is an admin-only page.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/routes/users.ts` — existing create/delete/reset-password handlers confirmed
- Direct code inspection: `src/middleware/auth.ts` — `authMiddleware` and `adminOnly` middleware confirmed
- Direct code inspection: `src/db/schema.ts` — users table DDL confirmed (created_at present, last_login_at absent)
- Direct code inspection: `src/routes/auth.ts` — login handler confirmed, no last_login_at write present
- Direct code inspection: `public/index.html` — view switching pattern, Alpine stores, nav bar line ~118
- Direct code inspection: `src/routes/users.test.ts` — existing test patterns confirmed (bun:test, makeUsersApp helper, beforeEach seed)
- Direct code inspection: `public/style.css` — existing CSS classes: `.form-group`, `.form-input`, `.btn-primary`, `.nav-bar`, `.nav-right`
- Project constraints: `CLAUDE.md` — bun:sqlite (not better-sqlite3), no new npm deps for v1.1, Alpine.js CDN

### Secondary (MEDIUM confidence)
- bun:sqlite ALTER TABLE behavior: confirmed no IF NOT EXISTS support via bun docs; try/catch migration is the documented workaround pattern for SQLite in general

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing, no new dependencies
- Architecture: HIGH — all patterns verified from live codebase
- Pitfalls: HIGH — derived from direct code inspection and known SQLite/Alpine constraints
- Test patterns: HIGH — verified from existing test files

**Research date:** 2026-03-23
**Valid until:** Stable — 90 days (no fast-moving dependencies involved in this phase)
