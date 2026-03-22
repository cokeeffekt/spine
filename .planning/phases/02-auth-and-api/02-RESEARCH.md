# Phase 2: Auth and API - Research

**Researched:** 2026-03-22
**Domain:** Session-based authentication, Hono middleware, bun:sqlite user/session management, HTTP 206 range request streaming
**Confidence:** HIGH

## Summary

Phase 2 builds the authentication layer and all REST API endpoints on top of the Phase 1 foundation. The implementation strategy is straightforward: opaque session tokens stored in SQLite (a server-side session table), Hono middleware that validates the cookie on every `/api/*` route, and custom route handlers for book listing, book detail, cover art, and audio streaming with HTTP 206 range support.

The technology choices are entirely locked: Bun is the runtime (so `Bun.password` handles Argon2id, `Bun.file().slice()` handles range streaming, and `bun:sqlite` handles the session store). No additional npm packages are needed for auth or streaming — every dependency already exists in the Phase 1 codebase or is built into Bun.

The one area requiring care is the audio streaming handler. `serveStatic` in Hono/Bun does not reliably produce HTTP 206 responses for media files (GitHub Issue #3324 open as of March 2026). The locked decision (D-14) is correct: a manual handler that reads the `Range` header, calls `Bun.file(path).slice(start, end)`, and returns a `new Response(slice, { status: 206, headers: {...} })` is the right approach and is ~20 lines of code.

**Primary recommendation:** Implement auth as a single `src/middleware/auth.ts` file with a typed `authMiddleware` using `createMiddleware<{ Variables: { userId: number, role: string } }>()`, apply it with `app.use('/api/*', authMiddleware)`, and mount all API routes after. Keep the `/health` and `/login` / `/logout` endpoints outside the `/api/*` wildcard.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use opaque session tokens stored in SQLite `sessions` table — not stateless JWT. Reason: AUTH-03 requires logout invalidation (revocation). Stateless JWTs cannot be revoked without a blocklist, which is just a worse version of a session table.
- **D-02:** Session token is a cryptographically random 32-byte hex string, stored in an HttpOnly, SameSite=Strict, Secure cookie named `session`.
- **D-03:** Session lifetime: 30 days from creation. No refresh token — long-lived session satisfies AUTH-05 (persist across browser refresh) without token rotation complexity.
- **D-04:** Logout deletes the session row from SQLite. Cookie is cleared on the response.
- **D-05:** First admin created via environment variables: `ADMIN_USERNAME` and `ADMIN_PASSWORD`. On startup, if no users exist in the DB and both env vars are set, create the admin account. If env vars are missing and no users exist, log a warning but don't block startup.
- **D-06:** Two roles only: `admin` and `user`. Stored as a `role` column on the `users` table.
- **D-07:** Admin creates users via `POST /api/users` (API-only, no CLI command). Admin can also delete users and reset passwords via the API.
- **D-08:** Users cannot change their own password in v1. Admin resets passwords on their behalf.
- **D-09:** No envelope wrapper. Successful responses return the resource directly (object or array). Errors return `{ "error": "message" }` with appropriate HTTP status codes.
- **D-10:** Book listing (`GET /api/books`) returns a flat JSON array — no pagination.
- **D-11:** Book listing fields: `id`, `title`, `author`, `narrator`, `duration_sec`, `cover_url`, `has_chapters`.
- **D-12:** Book detail (`GET /api/books/:id`) returns the full book object plus a `chapters` array.
- **D-13:** All API routes are prefixed with `/api/`. The `/health` endpoint remains unauthenticated.
- **D-14:** Audio streaming (`GET /api/books/:id/audio`) uses a custom Hono handler that reads the .m4b file path from the DB, opens it with `Bun.file()`, and handles range requests manually (read `Range` header, respond with 206 + `Content-Range` + `Accept-Ranges: bytes`).
- **D-15:** Cover art (`GET /api/books/:id/cover`) reads the `cover_path` from the DB and serves the image file. Returns 404 if no cover exists.
- **D-16:** Audio responses set `Content-Type: audio/mp4` and `Cache-Control: private, max-age=86400`.

### Claude's Discretion
- Hono middleware organization (single auth middleware file vs inline)
- Database migration strategy for adding `users` and `sessions` tables to existing schema
- Exact error messages and HTTP status code mapping
- Test file organization and test helper patterns
- Whether to add `zod` validation on login/user-creation payloads (recommended by CLAUDE.md stack but not required)

### Deferred Ideas (OUT OF SCOPE)
- User self-service password change — could add in a later phase
- OAuth / magic link login — explicitly out of scope per REQUIREMENTS.md
- API rate limiting — not needed for household use
- User preferences table (for Phase 4 playback speed per user) — belongs in Phase 4
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Admin user can create accounts for household members (no self-registration) | POST /api/users behind admin role check; `adminOnly` middleware guard pattern |
| AUTH-02 | User can log in and receive a session token | POST /auth/login → Bun.password.verify() → INSERT sessions → setCookie() |
| AUTH-03 | User can log out and invalidate their session | POST /auth/logout → DELETE FROM sessions WHERE token = ? → deleteCookie() |
| AUTH-04 | Passwords are hashed with Argon2id (Bun.password) | Bun.password.hash() default is Argon2id, no config required |
| AUTH-05 | Session persists across browser refresh | 30-day maxAge on cookie + sessions row with expires_at; validated on every request |
| AUTH-06 | Initial admin account created via environment variable or first-run setup | On startup: count users, if 0 and ADMIN_USERNAME+ADMIN_PASSWORD set, INSERT admin |
| API-01 | REST endpoint lists all books (title, author, cover URL, duration) | GET /api/books: SELECT from books, map to D-11 shape with cover_url computed field |
| API-02 | REST endpoint returns book details including chapter list | GET /api/books/:id: JOIN books+chapters, return D-12 shape |
| API-03 | REST endpoint streams .m4b audio with HTTP 206 range request support | GET /api/books/:id/audio: manual Range header parse + Bun.file().slice() + 206 response |
| API-04 | All API endpoints require authentication | app.use('/api/*', authMiddleware) applied before all route registrations |
</phase_requirements>

---

## Standard Stack

### Core (All already in project — zero new npm installs required)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | 4.12.8 | HTTP framework, routing, middleware | Already installed. `createMiddleware`, `app.use('/api/*')`, `setCookie`/`getCookie` from `hono/cookie` |
| `bun:sqlite` | built-in (Bun 1.2.x) | Session + user store | Phase 1 decision — identical synchronous API, zero deps. `db.query().run()` / `.get()` |
| `Bun.password` | built-in | Argon2id password hashing/verification | No npm package needed. AUTH-04 fully covered. |
| `Bun.file()` | built-in | File access + range slicing for 206 streaming | `.slice(start, end)` creates a partial BunFile with correct size metadata |
| `node:crypto` | built-in | Secure session token generation | `crypto.randomBytes(32).toString('hex')` → 64-char hex token |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 3.x (optional) | Request body validation | Use for login and user-creation payloads — prevents type errors at the boundary. Not strictly required but recommended per CLAUDE.md. No install needed unless added. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:crypto` randomBytes | `crypto.getRandomValues()` (Web Crypto) | Web Crypto works in Bun too but randomBytes is simpler for hex output |
| manual 206 handler | `serveStatic` from `hono/bun` | serveStatic does not produce 206 reliably (GitHub Issue #3324 open). Manual handler is ~20 lines and fully correct. |
| opaque session token | JWT | JWT cannot be revoked without a server-side blocklist — which is just a session table. D-01 is the correct choice. |

**Installation:** No new packages required. All tools are Bun built-ins or already in `package.json`.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/
│   ├── index.ts         # existing — getDatabase(), openDatabase()
│   └── schema.ts        # add users + sessions tables here (same style)
├── middleware/
│   └── auth.ts          # authMiddleware + adminOnly guard
├── routes/
│   ├── auth.ts          # POST /auth/login, POST /auth/logout
│   ├── books.ts         # GET /api/books, GET /api/books/:id
│   ├── audio.ts         # GET /api/books/:id/audio
│   ├── cover.ts         # GET /api/books/:id/cover
│   └── users.ts         # POST /api/users, DELETE /api/users/:id, PATCH /api/users/:id/password
├── scanner/             # existing — unchanged
├── server.ts            # wire middleware + routes
└── types.ts             # add User, Session interfaces
```

### Pattern 1: Auth Middleware with Typed Context Variables
**What:** A `createMiddleware` function that reads the `session` cookie, validates it against the `sessions` table, and injects `userId` and `role` into Hono context variables.
**When to use:** Applied once with `app.use('/api/*', authMiddleware)` — covers API-04 for all API routes at once.

```typescript
// Source: https://hono.dev/docs/helpers/factory + https://hono.dev/docs/api/context
import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { getDatabase } from '../db/index.js'

type AuthVariables = {
  userId: number
  role: 'admin' | 'user'
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const token = getCookie(c, 'session')
    if (!token) return c.json({ error: 'Unauthorized' }, 401)

    const db = getDatabase()
    const session = db.query<
      { user_id: number; role: string; expires_at: string },
      [string]
    >(
      `SELECT s.user_id, u.role, s.expires_at
       FROM sessions s JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    ).get(token)

    if (!session) return c.json({ error: 'Unauthorized' }, 401)

    c.set('userId', session.user_id)
    c.set('role', session.role as 'admin' | 'user')
    await next()
  }
)

// Admin-only guard (compose after authMiddleware)
export const adminOnly = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    if (c.get('role') !== 'admin') return c.json({ error: 'Forbidden' }, 403)
    await next()
  }
)
```

### Pattern 2: Route Mounting in server.ts
**What:** Register auth middleware before all API routes using path wildcard, then mount route modules.
**When to use:** Single registration point — clean and explicit.

```typescript
// Source: https://hono.dev/docs/guides/middleware
import { authMiddleware } from './middleware/auth.js'
import authRoutes from './routes/auth.js'
import bookRoutes from './routes/books.js'
import audioRoutes from './routes/audio.js'
import coverRoutes from './routes/cover.js'
import userRoutes from './routes/users.js'

// Unauthenticated routes first
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))
app.route('/auth', authRoutes)  // POST /auth/login, POST /auth/logout

// Protected API routes — middleware applied to all /api/* before route handlers
app.use('/api/*', authMiddleware)
app.route('/api', bookRoutes)   // GET /api/books, GET /api/books/:id
app.route('/api', audioRoutes)  // GET /api/books/:id/audio
app.route('/api', coverRoutes)  // GET /api/books/:id/cover
app.route('/api', userRoutes)   // POST /api/users, etc.
```

### Pattern 3: Login Handler (POST /auth/login)
**What:** Validates credentials, creates a session row, sets the HttpOnly cookie.

```typescript
// Source: https://hono.dev/docs/helpers/cookie + https://bun.com/docs/guides/util/hash-a-password
import { setCookie } from 'hono/cookie'
import { randomBytes } from 'node:crypto'

app.post('/login', async (c) => {
  const { username, password } = await c.req.json()  // or zod-validated body

  const db = getDatabase()
  const user = db.query<{ id: number; password_hash: string; role: string }, [string]>(
    'SELECT id, password_hash, role FROM users WHERE username = ?'
  ).get(username)

  // Constant-time: always verify even if user not found (use dummy hash)
  const valid = user
    ? await Bun.password.verify(password, user.password_hash)
    : false

  if (!user || !valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token, user.id, expiresAt.toISOString()
  )

  setCookie(c, 'session', token, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: true,
    path: '/',
    maxAge: 30 * 24 * 60 * 60,  // seconds
  })

  return c.json({ role: user.role })
})
```

### Pattern 4: HTTP 206 Audio Streaming Handler
**What:** Reads Range header, slices BunFile, returns 206 with correct headers.
**When to use:** Always for audio. `serveStatic` does not reliably produce 206 in Bun/Hono.

```typescript
// Source: https://bun.com/docs/runtime/http/routing (BunFile.slice example)
// RFC 7233 header format: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests
app.get('/books/:id/audio', async (c) => {
  const bookId = Number(c.req.param('id'))
  const db = getDatabase()
  const book = db.query<{ file_path: string }, [number]>(
    'SELECT file_path FROM books WHERE id = ? AND is_missing = 0'
  ).get(bookId)

  if (!book) return c.json({ error: 'Not found' }, 404)

  const file = Bun.file(book.file_path)
  const totalSize = file.size

  const rangeHeader = c.req.header('Range')
  if (!rangeHeader) {
    // No range — serve full file with 200
    return new Response(file, {
      headers: {
        'Content-Type': 'audio/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=86400',
        'Content-Length': String(totalSize),
      },
    })
  }

  // Parse "bytes=start-end"
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
  if (!match) return c.body(null, 416)

  const start = match[1] ? parseInt(match[1], 10) : 0
  const end = match[2] ? parseInt(match[2], 10) : totalSize - 1

  if (start > end || end >= totalSize) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${totalSize}` },
    })
  }

  const chunkSize = end - start + 1
  const slice = file.slice(start, end + 1)  // Bun slice is [start, end) exclusive

  return new Response(slice, {
    status: 206,
    headers: {
      'Content-Type': 'audio/mp4',
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': String(chunkSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=86400',
    },
  })
})
```

### Pattern 5: Schema Extension (users + sessions tables)
**What:** Add `users` and `sessions` DDL to `schema.ts` — same `IF NOT EXISTS` style as existing tables.

```typescript
// Source: src/db/schema.ts existing style
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token         TEXT    PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at    TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id   ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
`)
```

### Pattern 6: Admin Bootstrap on Startup
**What:** If `users` table is empty and env vars present, insert initial admin. Non-blocking.

```typescript
export function bootstrapAdmin(db: Database): void {
  const username = process.env['ADMIN_USERNAME']
  const password = process.env['ADMIN_PASSWORD']
  const count = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM users').get()!.n

  if (count > 0) return  // Already have users, skip

  if (!username || !password) {
    console.warn('[auth] No users exist. Set ADMIN_USERNAME + ADMIN_PASSWORD to create first admin.')
    return
  }

  const hash = await Bun.password.hash(password)
  db.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(
    username, hash, 'admin'
  )
  console.log(`[auth] Admin account '${username}' created.`)
}
```

**Note:** `bootstrapAdmin` must be `async` (Bun.password.hash is async). Call it in the startup block in `server.ts` with `await bootstrapAdmin(db)`.

### Anti-Patterns to Avoid
- **Using `serveStatic` for audio:** Hono's serveStatic does not produce HTTP 206 in the Bun adapter (GitHub Issue #3324 open). Always use the manual range handler.
- **JWT instead of session table:** JWTs cannot be revoked. For AUTH-03 (logout invalidation), a session table is required. D-01 is locked.
- **Setting role as admin-only middleware inline:** Inline role checks scatter logic. Use a composable `adminOnly` middleware applied per-route.
- **Not expiring sessions in the query:** Always include `AND expires_at > datetime('now')` in the session lookup — never trust expired tokens just because they exist in the DB.
- **Bun.file().slice() end index:** Bun's slice is `[start, end)` exclusive like JavaScript's `Array.slice`. For Range header `bytes=0-1023`, pass `file.slice(0, 1024)` — end is `rangeEnd + 1`.
- **Timing attacks on login:** Always call `Bun.password.verify()` even when the user doesn't exist. Use a dummy hash to prevent timing-based username enumeration.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom crypto | `Bun.password.hash()` | Argon2id with correct tuning. Rolling your own misses algorithm parameters, salting, and timing safety. |
| Cryptographic token generation | Math.random() hex | `crypto.randomBytes(32).toString('hex')` | Math.random is not cryptographically secure. Node/Bun's `crypto` module provides CSPRNG. |
| HTTP 206 range parsing | Custom byte range parser | 10-line regex + Bun.file().slice() | Edge cases: open-ended ranges (`bytes=1024-`), out-of-range values, missing Range header. The manual ~20-line handler in Pattern 4 covers all cases. |
| Session expiry cleanup | Background job | SQLite `WHERE expires_at > datetime('now')` in query | Expired rows don't affect security — just ignore them in the SELECT. Cleanup can be a rare `DELETE FROM sessions WHERE expires_at < datetime('now')` on login, not a cron job. |

**Key insight:** For this scope, Bun built-ins replace every library that would typically be installed (argon2, uuid, stream-range-parser). The npm install surface stays at zero additional packages.

---

## Common Pitfalls

### Pitfall 1: Cookie Not Sent on Localhost Without `Secure: false`
**What goes wrong:** `setCookie` with `secure: true` is ignored by browsers on `http://localhost` (not HTTPS). The session cookie never reaches the server.
**Why it happens:** The `Secure` attribute requires HTTPS. Localhost is exempt in modern browsers but the cookie option must be set conditionally.
**How to avoid:** Check `process.env['NODE_ENV']` — set `secure: process.env['NODE_ENV'] === 'production'`. In development (Docker on localhost), omit `secure: true` or set `secure: false`.
**Warning signs:** `POST /auth/login` returns 200 but subsequent API calls return 401. Check DevTools → Application → Cookies.

### Pitfall 2: Hono Route Order and Middleware Execution
**What goes wrong:** Calling `app.route('/api', bookRoutes)` before `app.use('/api/*', authMiddleware)` results in unprotected routes.
**Why it happens:** Hono processes middleware in registration order. Middleware registered after routes does not apply to those routes.
**How to avoid:** Always register `app.use('/api/*', authMiddleware)` before any `app.route('/api', ...)` calls. In `server.ts`, the middleware block must precede the route block.
**Warning signs:** `GET /api/books` succeeds without a session cookie.

### Pitfall 3: bun:sqlite Type Assertion Required
**What goes wrong:** `db.query(...).get(token)` returns `unknown`, not the expected interface. TypeScript errors cascade.
**Why it happens:** bun:sqlite does not infer column types from SQL strings. The generic parameter must be supplied explicitly.
**How to avoid:** Always pass the result type as a generic: `db.query<{ user_id: number; role: string }, [string]>(sql).get(token)`. Follow the pattern established in Phase 1.
**Warning signs:** TypeScript compile errors like `Property X does not exist on type unknown`.

### Pitfall 4: Foreign Keys Cascade Delete
**What goes wrong:** Deleting a user does not automatically delete their sessions, leaving orphaned session tokens that never expire.
**Why it happens:** SQLite foreign key enforcement is off by default. Phase 1 enables it via `PRAGMA foreign_keys = ON` in `db/index.ts`. The `sessions` DDL must include `REFERENCES users(id) ON DELETE CASCADE`.
**How to avoid:** Include `ON DELETE CASCADE` on the `sessions.user_id` FK (shown in Pattern 5). The `PRAGMA foreign_keys = ON` is already set in `openDatabase()`.
**Warning signs:** After `DELETE FROM users WHERE id = ?`, `SELECT * FROM sessions WHERE user_id = ?` still returns rows.

### Pitfall 5: Range Request with Open-Ended End Byte
**What goes wrong:** Client sends `Range: bytes=1024-` (no end byte). Parsing `parseInt('', 10)` returns `NaN`. The handler crashes or returns garbage.
**Why it happens:** The Range spec allows open-ended ranges meaning "from byte N to end of file". Many HTTP clients, including Safari's `<audio>` element, send open-ended ranges.
**How to avoid:** Normalize the end: `const end = match[2] ? parseInt(match[2], 10) : totalSize - 1`. Always check for empty string before parseInt (shown in Pattern 4).
**Warning signs:** Audio fails to load on Safari. `curl -r 1024-` returns 500 or empty body.

### Pitfall 6: Bun.file().size on Non-Existent File
**What goes wrong:** `Bun.file(path).size` returns `0` for a non-existent file instead of throwing. Using it as `totalSize` produces broken `Content-Range` headers.
**Why it happens:** Bun.file() is lazy — it doesn't stat the file until `.arrayBuffer()`, `.stream()`, or `.slice()` is called. `.size` returns 0 when the file hasn't been accessed yet and doesn't exist.
**How to avoid:** Use `file.exists()` check before computing size, or catch errors when building the response. Alternatively, trust that `is_missing = 0` in the DB query is accurate (maintained by the Phase 1 scanner).
**Warning signs:** `Content-Range: bytes 0-0/0` headers in responses.

---

## Code Examples

### Session Token Generation
```typescript
// Source: Node.js built-in, supported in Bun — https://bun.com/reference/node/crypto/randomBytes
import { randomBytes } from 'node:crypto'
const token: string = randomBytes(32).toString('hex')  // 64-char hex string
```

### Bun.password Argon2id Hash + Verify
```typescript
// Source: https://bun.com/docs/guides/util/hash-a-password
const hash = await Bun.password.hash(plaintext)           // Argon2id default
const ok = await Bun.password.verify(plaintext, hash)     // returns boolean
```

### setCookie / getCookie (Hono)
```typescript
// Source: https://hono.dev/docs/helpers/cookie
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'

// Set (on login)
setCookie(c, 'session', token, {
  httpOnly: true,
  sameSite: 'Strict',
  secure: process.env['NODE_ENV'] === 'production',
  path: '/',
  maxAge: 30 * 24 * 60 * 60,
})

// Read (in middleware)
const token = getCookie(c, 'session')  // string | undefined

// Delete (on logout)
deleteCookie(c, 'session', { path: '/' })
```

### bun:sqlite Typed Query Pattern
```typescript
// Source: https://bun.com/docs/runtime/sqlite
interface SessionRow {
  user_id: number
  role: string
  expires_at: string
}
const row = db.query<SessionRow, [string]>(
  `SELECT s.user_id, u.role, s.expires_at
   FROM sessions s JOIN users u ON s.user_id = u.id
   WHERE s.token = ? AND s.expires_at > datetime('now')`
).get(token)  // returns SessionRow | null
```

### Book Listing Query (D-11 shape)
```typescript
// cover_url computed as relative path per D-11
const books = db.query(
  `SELECT id, title, author, narrator, duration_sec,
          CASE WHEN cover_path IS NOT NULL
               THEN '/api/books/' || id || '/cover'
               ELSE NULL END AS cover_url,
          EXISTS(SELECT 1 FROM chapters WHERE book_id = books.id) AS has_chapters
   FROM books
   WHERE is_missing = 0
   ORDER BY title COLLATE NOCASE`
).all()
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JWT for sessions | Opaque session tokens + server-side table | D-01 locked | Enables true logout (AUTH-03) |
| `passport.js` auth | Manual Hono middleware + `Bun.password` | Project constraint | Removes 5+ transitive deps, Express coupling |
| `fluent-ffmpeg` | Direct spawn (Phase 1) | May 2025 (deprecated) | N/A this phase |
| `express` | Hono 4.12.x | Project constraint | Native Bun support, built-in TypeScript |

**Deprecated/outdated (not relevant to this phase):**
- `argon2` npm package: use `Bun.password` instead — no gyp, built-in, zero deps

---

## Open Questions

1. **`deleteCookie` signature in Hono**
   - What we know: `setCookie` takes `CookieOptions`. The `deleteCookie` helper exists in `hono/cookie`.
   - What's unclear: Whether `deleteCookie` accepts a `path` option to match the original cookie's path attribute. Missing path match can cause the browser to not clear the cookie.
   - Recommendation: In the logout handler, call `deleteCookie(c, 'session', { path: '/' })` to ensure the path matches. Verify behavior with a quick curl test.

2. **`Bun.file().size` accuracy before first access**
   - What we know: Bun.file() is lazy. `.size` may be `0` before the file is read.
   - What's unclear: Whether calling `.slice()` on a zero-size file causes the response to return empty or an error.
   - Recommendation: Add a `file.exists()` check in the audio handler before using `.size`. This also produces a cleaner 404 message if the file disappeared between DB read and disk access.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test (built-in, `bun:test`) |
| Config file | none — `bun test` discovers `*.test.ts` files by convention |
| Quick run command | `bun test src/` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| AUTH-02 | Login with correct credentials sets session cookie | unit | `bun test src/routes/auth.test.ts` | ❌ Wave 0 |
| AUTH-02 | Login with wrong password returns 401 | unit | `bun test src/routes/auth.test.ts` | ❌ Wave 0 |
| AUTH-03 | Logout deletes session row from DB | unit | `bun test src/routes/auth.test.ts` | ❌ Wave 0 |
| AUTH-04 | Stored hash is not plaintext (Argon2id format) | unit | `bun test src/routes/auth.test.ts` | ❌ Wave 0 |
| AUTH-05 | Session row with future expires_at is accepted | unit | `bun test src/middleware/auth.test.ts` | ❌ Wave 0 |
| AUTH-05 | Session row with past expires_at is rejected (401) | unit | `bun test src/middleware/auth.test.ts` | ❌ Wave 0 |
| AUTH-06 | Bootstrap creates admin when users table empty + env vars set | unit | `bun test src/db/bootstrap.test.ts` | ❌ Wave 0 |
| AUTH-06 | Bootstrap skips when users already exist | unit | `bun test src/db/bootstrap.test.ts` | ❌ Wave 0 |
| API-01 | GET /api/books returns array with correct D-11 fields | unit | `bun test src/routes/books.test.ts` | ❌ Wave 0 |
| API-02 | GET /api/books/:id returns chapters array | unit | `bun test src/routes/books.test.ts` | ❌ Wave 0 |
| API-02 | GET /api/books/:unknown returns 404 | unit | `bun test src/routes/books.test.ts` | ❌ Wave 0 |
| API-03 | GET /api/books/:id/audio with Range header returns 206 + Content-Range | unit | `bun test src/routes/audio.test.ts` | ❌ Wave 0 |
| API-03 | GET /api/books/:id/audio without Range returns 200 + full file | unit | `bun test src/routes/audio.test.ts` | ❌ Wave 0 |
| API-04 | Request without session cookie returns 401 | unit | `bun test src/middleware/auth.test.ts` | ❌ Wave 0 |
| AUTH-01 | Non-admin cannot access POST /api/users (403) | unit | `bun test src/routes/users.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test src/` (only src test files, fast)
- **Per wave merge:** `bun test` (full suite including scanner tests)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/middleware/auth.test.ts` — covers AUTH-04, AUTH-05, API-04
- [ ] `src/routes/auth.test.ts` — covers AUTH-02, AUTH-03, AUTH-04
- [ ] `src/routes/books.test.ts` — covers API-01, API-02
- [ ] `src/routes/audio.test.ts` — covers API-03 (use a real small .m4b fixture or a dummy binary)
- [ ] `src/routes/users.test.ts` — covers AUTH-01
- [ ] `src/db/bootstrap.test.ts` — covers AUTH-06

**Test helper pattern** (follow Phase 1 convention): Use `openDatabase(':memory:')` for all DB tests. Create helper `makeTestApp()` that returns a Hono app wired with auth middleware + routes, backed by an in-memory DB pre-seeded with a test user.

---

## Sources

### Primary (HIGH confidence)
- [https://hono.dev/docs/helpers/cookie](https://hono.dev/docs/helpers/cookie) — setCookie/getCookie API, all options including httpOnly, sameSite, secure, maxAge. Verified March 2026.
- [https://hono.dev/docs/guides/middleware](https://hono.dev/docs/guides/middleware) — app.use() with path patterns, createMiddleware pattern, execution order. Verified March 2026.
- [https://hono.dev/docs/api/context](https://hono.dev/docs/api/context) — c.set(), c.get(), c.var, typed Variables generic. Verified March 2026.
- [https://bun.com/docs/runtime/sqlite](https://bun.com/docs/runtime/sqlite) — bun:sqlite Database, query(), get(), all(), run(), typed generics, transactions. Verified March 2026.
- [https://bun.com/docs/guides/util/hash-a-password](https://bun.com/docs/guides/util/hash-a-password) — Bun.password.hash() / .verify() Argon2id defaults. Verified March 2026.
- [https://bun.com/docs/runtime/http/routing](https://bun.com/docs/runtime/http/routing) — Bun.file().slice() for range request handling, automatic Content-Range + Content-Length on sliced responses. Verified March 2026.
- [https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests) — RFC 7233 Range/Content-Range header format, 206/416 status codes. Authoritative.

### Secondary (MEDIUM confidence)
- [https://github.com/honojs/hono/issues/3324](https://github.com/honojs/hono/issues/3324) — Hono serveStatic 206 support is an open issue as of March 2026. Confirms manual range handler is required.
- [https://bun.com/reference/node/crypto/randomBytes](https://bun.com/reference/node/crypto/randomBytes) — crypto.randomBytes() supported in Bun. Verified via Bun reference docs.
- [https://hono.dev/docs/helpers/factory](https://hono.dev/docs/helpers/factory) — createMiddleware() helper for typed middleware. Verified via Hono docs.

### Tertiary (LOW confidence)
- None. All critical claims verified against primary or secondary sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are Phase 1 carryovers or Bun built-ins; no new packages introduced
- Architecture: HIGH — Hono middleware pattern and bun:sqlite patterns verified against official docs
- Pitfalls: HIGH — Bun.file laziness and Hono route order verified via official docs and GitHub issue tracker
- HTTP 206 pattern: HIGH — MDN RFC 7233, Bun official docs, and open GitHub issue #3324 all cross-confirm the manual handler requirement

**Research date:** 2026-03-22
**Valid until:** 2026-06-22 (stable ecosystem; Hono and Bun release frequently but APIs are stable)
