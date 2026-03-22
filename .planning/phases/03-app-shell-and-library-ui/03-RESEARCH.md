# Phase 03: App Shell and Library UI - Research

**Researched:** 2026-03-22
**Domain:** Alpine.js SPA patterns, Workbox service worker, PWA manifest, Hono serveStatic
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Minimal centered login form — username, password, submit button. No branding beyond "Spine" as a heading. Dark background, light form card.
- **D-02:** On login failure, show inline error message below the form ("Invalid username or password"). No toast/snackbar.
- **D-03:** After successful login, redirect to the library grid. Store the user's role in Alpine.js `$store.auth` for conditional admin UI.
- **D-04:** Logout button in a simple top nav bar. Clicking it calls `POST /auth/logout` and redirects to the login page.
- **D-05:** Responsive CSS Grid of book cards. 2 columns on mobile, 3 on tablet, 4-5 on desktop. No infinite scroll.
- **D-06:** Each card shows: cover art image (or placeholder if no cover), title (truncated to 2 lines), author (1 line). No duration or narrator on card.
- **D-07:** Cover art uses a 2:3 aspect ratio container. Object-fit cover. Placeholder is neutral gray with book icon or first letter.
- **D-08:** Cards have subtle rounded corners and a hover/tap state. Clicking navigates to book detail view.
- **D-09:** Search bar at top of library. Live filtering as user types — title and author, case-insensitive substring. Client-side only.
- **D-10:** When search has no results, show "No books match" message. Clear (×) button on search input to reset.
- **D-11:** Detail view shows: large cover art, title, author, narrator, duration ("Xh Ym"), description if available, chapter list.
- **D-12:** Chapter list is scrollable numbered list. Each row: chapter title and duration. No tap interaction in Phase 3.
- **D-13:** Back button returns to library grid. No in-app routing library — use Alpine.js `x-show` to toggle views based on `$store.app.view`.
- **D-14:** "Play" button on detail view exists but is disabled/grayed with tooltip "Coming soon".
- **D-15:** Web App Manifest with name "Spine", short_name "Spine", display "standalone", dark theme_color/background_color, 192px and 512px icons.
- **D-16:** Service worker using Workbox CDN (importScripts). Precaches app shell. NetworkFirst for API calls. No audio caching in Phase 3.
- **D-17:** Register service worker from index.html.
- **D-18:** Single `public/index.html`, CSS in `public/style.css`. Alpine.js via CDN `<script defer>`. No build step.
- **D-19:** Dark theme by default — dark gray background (~#1a1a2e), light text. No theme toggle in v1.
- **D-20:** Static files served via Hono's `serveStatic` from `public/` directory. API routes take precedence.

### Claude's Discretion
- Exact color palette and typography choices (already defined in UI-SPEC)
- Icon generation approach (SVG placeholder vs simple PNG)
- Alpine.js store organization (`$store.auth`, `$store.library`, `$store.app`)
- CSS approach (vanilla CSS vs utility classes)
- Loading skeleton design while fetching books
- Exact responsive breakpoints
- How the login → library transition animates (if at all)

### Deferred Ideas (OUT OF SCOPE)
- Audio playback — Phase 4
- Progress tracking — Phase 4
- Lock screen controls — Phase 5
- Offline download — Phase 6
- Admin user management UI — future phase
- Theme toggle (light/dark) — not in v1
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIB-01 | User sees a grid of audiobooks with cover art, title, and author | Alpine.js `x-for` over `$store.library.books`; CSS Grid with `aspect-ratio: 2/3`; `loading="lazy"` on `<img>`; cover placeholder via `x-show` on `onerror` or `cover_url` null check |
| LIB-02 | User can search/filter the library by title or author | Client-side Alpine computed property filtering `$store.library.books` by `$store.library.query`; case-insensitive `includes()` on `title` and `author` |
| LIB-03 | User can tap a book to see details (chapters, duration, description if available) | `GET /api/books/:id` fetch in detail view init; `$store.app.view = 'detail'` + `$store.library.selectedBook` assignment; `x-show` view toggle |
| PWA-01 | App is installable via Web App Manifest (Add to Home Screen) | `manifest.json` with `name`, `short_name`, `start_url`, `display: standalone`, `icons` at 192px and 512px; `<link rel="manifest">` in `<head>` |
| PWA-02 | Service worker is registered and caches app shell for offline access | `sw.js` using `workbox-sw.js` CDN; `precacheAndRoute` for index.html, style.css, manifest icons; `registerRoute` NetworkFirst for `/api/*`; `navigator.serviceWorker.register('/sw.js')` on window load |
| PWA-03 | App works as standalone window when installed (no browser chrome) | `display: standalone` in manifest; `theme_color` in manifest and `<meta name="theme-color">`; `start_url: /` in manifest |
</phase_requirements>

## Summary

Phase 3 builds a pure-frontend PWA on top of the completed backend API. There is no new backend logic — the work is entirely `public/` files and a one-line addition to `server.ts` for `serveStatic`. The stack is intentionally minimal: vanilla HTML/CSS, Alpine.js 3.15.x via CDN for reactivity, Workbox 7.4.0 via CDN for the service worker, and a `manifest.json` for PWA installability.

The UI-SPEC document (03-UI-SPEC.md) is already approved and contains pixel-precise color values, typography scales, component inventory, spacing tokens, and the Alpine.js store shape. The planner and implementer MUST read 03-UI-SPEC.md before creating tasks — all visual decisions are locked there. This research document focuses on the technical integration patterns that the UI-SPEC does not cover: how Alpine.js stores are initialized, how Workbox CDN is wired up without a build step, how Hono's serveStatic works on Bun, and common pitfalls.

The critical constraint is the no-build-step requirement: all JavaScript and CSS must be authored as plain files loaded directly by the browser. No transpilation, no bundling, no TypeScript on the frontend. This rules out Workbox CLI or workbox-build for generating precache manifests — the manifest must be hardcoded in `sw.js`.

**Primary recommendation:** Follow the exact Alpine.js store shape and component structure defined in 03-UI-SPEC.md. Use `alpine:init` to register stores before Alpine processes the DOM. Use `x-show` (not `x-if`) for the three views (login, library, detail) as decided in D-13 — all three views are always in the DOM, toggled by `$store.app.view`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Alpine.js | 3.15.8 | Frontend reactivity, store, view toggling | CDN-only, no build step. `x-data`, `x-show`, `x-for`, `$store`, `x-init` cover all Phase 3 needs |
| Workbox (workbox-sw) | 7.4.0 | Service worker precaching + runtime caching | CDN `importScripts()` usage — only no-build-step option. Handles precache manifest, NetworkFirst for API |
| hono/bun serveStatic | (built into Hono 4.12.x) | Serve `public/` at root path from Bun server | Native Bun adapter built into Hono — no additional package needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Native `fetch` | Browser built-in | API calls from Alpine.js x-init and event handlers | All HTTP calls from frontend — no wrapper needed |
| Native CSS Grid | Browser built-in | Responsive book card layout | `grid-template-columns: repeat(2, 1fr)` mobile → up to 5 at 1280px+ |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `x-show` for view switching | `x-if` | `x-if` removes DOM on hide (memory-efficient) but re-initializes Alpine on show (re-runs x-init, re-fetches). `x-show` keeps DOM alive — correct choice for views that should retain state |
| Hardcoded precache manifest | workbox-cli / workbox-build | CLI generates accurate revision hashes automatically but requires a build step — violates project constraint |
| Inline SVG icons | Heroicons CDN | Avoids external CDN dependency for the small icon set needed (search, book, magnifying glass, back arrow) |

**Installation:**
```bash
# No npm install for frontend — CDN only
# Alpine.js: <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.15.8/dist/cdn.min.js"></script>
# Workbox sw.js: importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.4.0/workbox-sw.js')
# manifest.json: <link rel="manifest" href="/manifest.json">
```

## Architecture Patterns

### Recommended Project Structure
```
public/
├── index.html        # Single-page app shell — all three views via x-show
├── style.css         # All styles, no preprocessor
├── manifest.json     # PWA manifest
├── sw.js             # Workbox service worker (app shell precache)
└── icons/
    ├── icon-192.png  # PWA icon 192px
    └── icon-512.png  # PWA icon 512px

src/
└── server.ts         # Add serveStatic for public/ AFTER existing routes
```

### Pattern 1: Alpine.js Store Initialization (CDN)

**What:** Stores must be registered inside an `alpine:init` event listener when Alpine is loaded via CDN script tag. The `defer` attribute on the script tag means Alpine initializes after DOM parsing — you cannot call `Alpine.store()` synchronously before that.

**When to use:** Always, when Alpine is loaded via CDN `<script defer>`.

**Example:**
```javascript
// Source: https://alpinejs.dev/globals/alpine-store
document.addEventListener('alpine:init', () => {
  Alpine.store('auth', {
    loggedIn: false,
    username: '',
    role: ''
  })

  Alpine.store('app', {
    view: 'login'  // 'login' | 'library' | 'detail'
  })

  Alpine.store('library', {
    books: [],
    query: '',
    selectedBook: null
  })
})
```

**Critical:** Store registration MUST happen inside `alpine:init`. If you call `Alpine.store()` after Alpine has already initialized (e.g., in a `DOMContentLoaded` listener that runs after Alpine), the stores won't be reactive.

### Pattern 2: x-show View Switching (SPA Without Router)

**What:** Three views (login, library, detail) always exist in the DOM, toggled by `display:none` via `x-show`. No in-app router, no `x-if`.

**Why `x-show` not `x-if`:** `x-if` destroys and recreates DOM on every toggle, which re-runs `x-init` (re-fetches data from API). `x-show` keeps all views in the DOM — correct for a small-screen SPA where all three views are lightweight.

**Example:**
```html
<!-- Source: D-13, https://alpinejs.dev/directives/show -->
<div x-show="$store.app.view === 'login'">
  <!-- login form -->
</div>

<div x-show="$store.app.view === 'library'">
  <!-- library grid + search -->
</div>

<div x-show="$store.app.view === 'detail'">
  <!-- book detail -->
</div>
```

### Pattern 3: Fetch with 401 Redirect

**What:** All `/api/*` calls return 401 if the session cookie is invalid or expired. Frontend must catch 401 and redirect to login view.

**Example:**
```javascript
// Source: Alpine.js x-init async pattern + fetch API
async function apiFetch(url) {
  const res = await fetch(url)
  if (res.status === 401) {
    Alpine.store('auth').loggedIn = false
    Alpine.store('app').view = 'login'
    return null
  }
  return res.json()
}
```

This pattern should be used in both the library load (`GET /api/books`) and book detail fetch (`GET /api/books/:id`).

### Pattern 4: Workbox Service Worker (CDN, No Build Step)

**What:** `sw.js` loaded via Workbox CDN. Precaches app shell files with hardcoded revision strings. NetworkFirst for API routes.

**Critical:** Since there's no build step, precache revisions must be manually incremented when files change. A simple date string or short hash works.

**Example:**
```javascript
// Source: https://web.dev/learn/pwa/workbox + Chrome for Developers workbox-precaching
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.4.0/workbox-sw.js')

// Precache app shell — update revision strings when files change
workbox.precaching.precacheAndRoute([
  { url: '/index.html', revision: '1' },
  { url: '/style.css', revision: '1' },
  { url: '/manifest.json', revision: '1' },
  { url: '/icons/icon-192.png', revision: '1' },
  { url: '/icons/icon-512.png', revision: '1' }
])

// NetworkFirst for API calls — fresh data when online, cached when offline
workbox.routing.registerRoute(
  ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/'),
  new workbox.strategies.NetworkFirst({ cacheName: 'api-cache' })
)
```

### Pattern 5: Hono serveStatic for Bun

**What:** Serve `public/` directory at root path `/`. API routes (`/api/*`, `/auth/*`, `/health`) are registered first so they take precedence over the static file wildcard.

**Import:** `serveStatic` from `'hono/bun'` — NOT from `'@hono/node-server/serve-static'`. Wrong import path is a common pitfall.

**Example:**
```typescript
// Source: https://hono.dev/docs/getting-started/bun
import { serveStatic } from 'hono/bun'

// All existing routes (/auth, /api, /health) are already registered ABOVE this line
// Static files catch-all — must come LAST
app.use('/*', serveStatic({ root: './public' }))

// SPA fallback — serve index.html for any path not matching a file
app.get('/*', serveStatic({ path: './public/index.html' }))
```

**Order is critical.** `serveStatic` must be registered AFTER all API routes. Hono routes match in registration order.

### Pattern 6: Service Worker Registration

**What:** Register `sw.js` from `index.html` on window load event. Scope defaults to `/` if sw.js is in the root of `public/`.

**Scope rule:** The service worker's scope is determined by where `sw.js` is located relative to the origin, NOT relative to `index.html`. Since `sw.js` will be served at `/sw.js` (from `public/sw.js`), its default scope covers the entire origin (`/`).

```javascript
// Source: https://web.dev/articles/service-workers-registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch(err => console.warn('SW registration failed:', err))
  })
}
```

### Pattern 7: Live Search Filtering (Computed Alpine Pattern)

**What:** No API call — filter `$store.library.books` client-side on every keystroke.

**Example:**
```html
<!-- Source: Alpine.js x-for computed filter pattern -->
<template x-for="book in $store.library.books.filter(b =>
  !$store.library.query ||
  b.title.toLowerCase().includes($store.library.query.toLowerCase()) ||
  (b.author && b.author.toLowerCase().includes($store.library.query.toLowerCase()))
)" :key="book.id">
  <!-- card HTML -->
</template>
```

This is the idiomatic Alpine pattern for live filtering — inline expression in `x-for`. For cleaner code, the filter function can be extracted to a store method.

### Pattern 8: Duration Formatting

**What:** `duration_sec` from the API is a float (e.g., `3661.5`). Format as "Xh Ym" per D-11 and the copywriting contract.

```javascript
function formatDuration(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m}m`
}
```

Define this as a utility function in a `<script>` block in `index.html` or inline in Alpine component data.

### Anti-Patterns to Avoid
- **Using `x-if` for top-level views:** Causes view data to re-initialize on every transition. Prefer `x-show`.
- **Calling `Alpine.store()` in `DOMContentLoaded` without `alpine:init`:** Registration timing is wrong — Alpine may already be initialized.
- **Registering `serveStatic` before API routes:** API routes will never match; everything hits the static handler first.
- **Putting `sw.js` in a subdirectory (e.g., `public/js/sw.js`):** Default scope will be `/js/` only, not `/`. Service worker scope cannot be broader than its location without a `Service-Worker-Allowed` response header.
- **Using `loading="lazy"` on images that are above the fold:** The first 4-8 book covers may be in the viewport immediately — mark those as `loading="eager"` (or omit the attribute). Apply `loading="lazy"` to the remainder.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| App shell caching + offline | Custom fetch event handler | Workbox `precacheAndRoute` | Cache-busting, cache versioning, and fetch interception are complex. Workbox handles stale cache cleanup on SW update automatically |
| Precache manifest generation | String concatenation of file URLs | Accept manual revisions for Phase 3 (no build step alternative) | In Phase 3, files change infrequently. Manual revision update on file change is acceptable. Phase 6 (offline) may warrant workbox-cli |
| Client-side routing | History API + custom router | Alpine.js `$store.app.view` with `x-show` | D-13 is explicit — no routing library. `x-show` toggle is 5 lines of HTML |
| Search debouncing | setTimeout/clearTimeout wrapper | Not needed for this phase | Client-side filter on a household library (< 500 books) runs in < 1ms. No debounce overhead justified |

**Key insight:** The no-build-step constraint is the governing rule for the entire frontend. Everything that would normally be solved by a bundler plugin (Workbox manifest injection, CSS minification, asset hashing) must be handled manually or accepted as a limitation. For Phase 3 scope, manual revision strings and unminified CSS are fully acceptable.

## Common Pitfalls

### Pitfall 1: Wrong serveStatic Import Path on Bun
**What goes wrong:** Importing `serveStatic` from `'@hono/node-server/serve-static'` instead of `'hono/bun'` causes a module not found error on Bun (or silently serves no files).
**Why it happens:** The Hono docs show two different import paths depending on runtime. Node.js uses `@hono/node-server/serve-static`. Bun uses `hono/bun`.
**How to avoid:** Always import `import { serveStatic } from 'hono/bun'` in `server.ts`. The package `@hono/node-server` is not installed in this project.
**Warning signs:** 404 on `GET /` for `index.html` despite file existing in `public/`.

### Pitfall 2: serveStatic Registered Before API Routes
**What goes wrong:** All requests hit the static handler first. API routes are never reached. `POST /auth/login` returns the static 404 response instead of JSON.
**Why it happens:** Hono matches routes in registration order. A wildcard `/*` catches everything if registered early.
**How to avoid:** In `server.ts`, add the `serveStatic` middleware at the very bottom, after all `app.route()` calls.
**Warning signs:** Login returns HTML instead of JSON; API calls return `index.html` content.

### Pitfall 3: Service Worker Scope Too Narrow
**What goes wrong:** Service worker only controls requests under a sub-path (e.g., `/js/`), so app shell caching doesn't work for `/` or `/api/*`.
**Why it happens:** SW scope defaults to the directory of the SW file. If `sw.js` is at `/js/sw.js`, scope is `/js/`.
**How to avoid:** Place `sw.js` in `public/` root so it's served at `/sw.js` and controls the entire origin.
**Warning signs:** DevTools Application tab shows SW scope as `/js/` instead of `/`; cached resources never served.

### Pitfall 4: Alpine.js Store Not Registered Before DOM Parsing
**What goes wrong:** `$store.auth` is undefined when Alpine processes the first template expression that references it. TypeError in console.
**Why it happens:** If `Alpine.store()` is called after Alpine has initialized (e.g., in a DOMContentLoaded handler that runs after Alpine's own initialization), the store doesn't exist yet.
**How to avoid:** Always register stores inside `document.addEventListener('alpine:init', () => { ... })`.
**Warning signs:** Alpine console errors referencing `$store.auth is undefined` or blank page on load.

### Pitfall 5: Precache Revision Not Updated After File Change
**What goes wrong:** Users get stale `index.html` or `style.css` from the precache after a deployment. New code not delivered to returning users.
**Why it happens:** Workbox only evicts and re-fetches precached files when the `revision` value changes. If you update `style.css` but don't change `{ url: '/style.css', revision: '1' }` in `sw.js`, the old file is served forever.
**How to avoid:** Treat revision strings as a manual version bump: increment them whenever the referenced file changes. A simple counter or date string (`'2026-03-22'`) works.
**Warning signs:** CSS changes not visible to users who previously installed the PWA; hard-refresh required.

### Pitfall 6: PWA Install Prompt Not Appearing
**What goes wrong:** Browser never shows "Add to Home Screen" prompt.
**Why it happens (2025 Chrome criteria):** Chrome requires: HTTPS (or localhost), a manifest with `name`/`short_name`, `start_url`, `display` (standalone/fullscreen/minimal-ui), icons at 192px and 512px, and `prefer_related_applications` not set to `true`. As of Chrome 2025, a service worker is no longer required for installability (but still required for offline capability per PWA-02).
**How to avoid:** Verify manifest with Chrome DevTools > Application > Manifest. All required fields must be present. Icons must actually exist and be valid PNGs.
**Warning signs:** DevTools Manifest tab shows "Installability: Not installable" with specific missing field listed.

### Pitfall 7: Cover Image Fetch Returns 401 After Session Expiry
**What goes wrong:** After a session expires, `<img src="/api/books/1/cover">` returns a broken image icon because the server returns 401 JSON (not an image).
**Why it happens:** `<img>` tags don't trigger Alpine's fetch wrapper — they make their own browser requests. A 401 JSON response renders as a broken image.
**How to avoid:** For Phase 3, this is acceptable behavior (session expiry is rare during active browsing). The `onerror` handler on cover `<img>` tags should show the placeholder instead. A truly robust solution would pre-check session validity on mount, but that's over-engineered for Phase 3.
**Warning signs:** Broken image icons in the grid even though files exist; check Network tab for 401 on cover requests.

## Code Examples

Verified patterns from official sources:

### Alpine.js Store Registration (CDN)
```javascript
// Source: https://alpinejs.dev/globals/alpine-store
document.addEventListener('alpine:init', () => {
  Alpine.store('auth', {
    loggedIn: false,
    username: '',
    role: ''
  })
  Alpine.store('app', {
    view: 'login'
  })
  Alpine.store('library', {
    books: [],
    query: '',
    selectedBook: null,
    // Format seconds as "Xh Ym"
    formatDuration(sec) {
      const h = Math.floor(sec / 3600)
      const m = Math.floor((sec % 3600) / 60)
      return `${h}h ${m}m`
    }
  })
})
```

### Hono serveStatic — Bun (add to bottom of server.ts)
```typescript
// Source: https://hono.dev/docs/getting-started/bun
import { serveStatic } from 'hono/bun'

// MUST be after all app.route() calls
app.use('/*', serveStatic({ root: './public' }))
app.get('/*', serveStatic({ path: './public/index.html' }))
```

### Workbox sw.js (complete Phase 3 service worker)
```javascript
// Source: https://web.dev/learn/pwa/workbox
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.4.0/workbox-sw.js')

workbox.precaching.precacheAndRoute([
  { url: '/index.html', revision: '1' },
  { url: '/style.css', revision: '1' },
  { url: '/manifest.json', revision: '1' },
  { url: '/icons/icon-192.png', revision: '1' },
  { url: '/icons/icon-512.png', revision: '1' }
])

// NetworkFirst for all API and auth calls
workbox.routing.registerRoute(
  ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/'),
  new workbox.strategies.NetworkFirst({ cacheName: 'api-cache' })
)
```

### manifest.json
```json
{
  "name": "Spine",
  "short_name": "Spine",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#1a1a2e",
  "background_color": "#16213e",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service Worker Registration (in index.html)
```javascript
// Source: https://web.dev/articles/service-workers-registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch(err => console.warn('[SW] Registration failed:', err))
  })
}
```

### CSS Grid — Responsive Book Cards
```css
/* Source: UI-SPEC breakpoints + D-05 */
.library-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
@media (min-width: 640px) {
  .library-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 1024px) {
  .library-grid { grid-template-columns: repeat(4, 1fr); }
}
@media (min-width: 1280px) {
  .library-grid { grid-template-columns: repeat(5, 1fr); }
}

/* Cover art container */
.cover-container {
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: 8px 8px 0 0;
}
.cover-container img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

### Login POST and Auth Flow
```javascript
// x-data component for login form
{
  username: '',
  password: '',
  error: '',
  async login() {
    this.error = ''
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username, password: this.password })
      })
      if (res.ok) {
        const data = await res.json()
        Alpine.store('auth').loggedIn = true
        Alpine.store('auth').username = this.username
        Alpine.store('auth').role = data.role
        Alpine.store('app').view = 'library'
        // Trigger library load
        await Alpine.store('library').loadBooks()
      } else if (res.status === 401) {
        this.error = 'Invalid username or password.'
      } else {
        this.error = 'Could not reach the server. Try again.'
      }
    } catch {
      this.error = 'Could not reach the server. Try again.'
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Service worker required for PWA install | Manifest-only sufficient for Chrome install prompt | Chrome 2025 | Service worker still needed for offline (PWA-02) but not for PWA-01 alone |
| Workbox CLI for manifest generation | Manual manifest in `sw.js` for CDN usage | N/A — CDN always required manual | Acceptable for no-build-step projects with infrequent deploys |
| `x-data` on `<body>` as root SPA pattern | `Alpine.store()` for global state | Alpine v3 | Stores are more composable, avoid scope shadowing |

**Deprecated/outdated:**
- `fluent-ffmpeg`: Archived May 2025 — not relevant to this phase but noted in CLAUDE.md
- Alpine v2 `$store` via plugin: In v3, `Alpine.store()` is built-in — no plugin needed

## Open Questions

1. **Icon generation approach**
   - What we know: Icons must be 192px and 512px PNG; dark background `#1a1a2e` with white book/spine icon
   - What's unclear: Whether to generate programmatically (Canvas API script), use a Node.js script (sharp/canvas), or embed as a static pre-generated binary
   - Recommendation: For Phase 3, create the icons as pre-generated PNG files committed to the repo. A simple Node.js script using `canvas` or `sharp` can generate them at `public/icons/`, run once. Or use a 1-line Bun script with the canvas API. Avoids runtime dependency.

2. **serveStatic and Docker working directory**
   - What we know: `serveStatic({ root: './public' })` resolves relative to the process cwd. In Docker, Bun runs from `/app` (or wherever WORKDIR is set).
   - What's unclear: Whether the Dockerfile WORKDIR is already set in Phase 1 work.
   - Recommendation: Verify Dockerfile WORKDIR is `/app` and that `public/` is copied into `/app/public/` in the Docker image. Confirm in Phase 3 plan.

3. **Session check on page load**
   - What we know: The frontend doesn't know if a session cookie is valid until it makes an API call. The cookie is HttpOnly so JavaScript can't inspect it.
   - What's unclear: Should the app optimistically show the library view and redirect on 401, or should it always start at login and have a session-check endpoint?
   - Recommendation: The API already has `GET /health` (unauthenticated) and `GET /api/books` (authenticated). On mount, immediately call `GET /api/books` — if 401, show login; if 200, show library with data. No separate session-check endpoint needed. This is a single roundtrip.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none — bun:test runs via `bun test` |
| Quick run command | `bun test src/` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIB-01 | Library grid renders books from API response | manual-only | N/A — requires browser rendering | ❌ |
| LIB-02 | Search filter reduces displayed books (client-side) | manual-only | N/A — requires browser DOM | ❌ |
| LIB-03 | Book detail view shows correct chapters and metadata | manual-only | N/A — requires browser | ❌ |
| PWA-01 | Manifest is valid and installability criteria met | manual | Chrome DevTools > Application > Manifest | ❌ |
| PWA-02 | Service worker registers and precaches shell | manual | Chrome DevTools > Application > Service Workers | ❌ |
| PWA-03 | App opens as standalone window | manual | Install to home screen, verify no browser chrome | ❌ |
| D-20 (server) | Hono serveStatic serves index.html at / | unit | `bun test src/server.test.ts` | ❌ Wave 0 |
| D-20 (server) | API routes still respond after serveStatic added | unit | `bun test src/` (existing tests cover /api/* and /auth/*) | ✅ existing |

**Note on manual-only tests:** The frontend is vanilla HTML/CSS/JS with no module system. There is no DOM available in bun:test (no jsdom). All frontend behavior is manual-browser verified. The only unit-testable addition in Phase 3 is the `serveStatic` middleware in `server.ts`.

### Sampling Rate
- **Per task commit:** `bun test src/` (existing backend tests, < 5 seconds)
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green + manual browser check of all 5 success criteria before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/server.test.ts` — Add test that `GET /` returns 200 with HTML content-type (serveStatic working). Existing server.test.ts may already exist from Phase 2 — check first.

## Sources

### Primary (HIGH confidence)
- https://alpinejs.dev/globals/alpine-store — Alpine.store() API, `alpine:init` registration pattern, CDN usage
- https://alpinejs.dev/directives/init — x-init async patterns
- https://alpinejs.dev/directives/show — x-show mechanics (keeps DOM, toggles display)
- https://hono.dev/docs/getting-started/bun — serveStatic import from `hono/bun`, root configuration
- https://web.dev/learn/pwa/workbox — Workbox CDN usage pattern, workbox.precaching, workbox.routing, workbox.strategies
- https://web.dev/articles/install-criteria — PWA installability criteria (manifest fields, icon sizes)
- https://developer.chrome.com/docs/workbox/modules/workbox-precaching — precacheAndRoute API and manifest format
- https://web.dev/articles/service-workers-registration — SW registration timing, scope rules

### Secondary (MEDIUM confidence)
- https://github.com/orgs/honojs/discussions/4390 — Community confirmation of serveStatic SPA pattern with two-call fallback
- https://github.com/alpinejs/alpine/discussions/1086 — Community discussion confirming x-show vs x-if tradeoffs
- WebSearch verification: Chrome 2025 PWA install no longer requires service worker (manifest only sufficient)

### Tertiary (LOW confidence)
- None — all critical claims verified with official sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Alpine 3.15.8, Workbox 7.4.0, hono/bun serveStatic all verified from official docs
- Architecture: HIGH — patterns verified from official Alpine and Workbox documentation
- Pitfalls: HIGH — serveStatic order, SW scope, store timing all verified from official sources or first-party GitHub issues
- PWA criteria: HIGH — verified from web.dev/install-criteria (updated September 2024)

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (Alpine.js and Workbox are stable; PWA installability criteria unlikely to change)
