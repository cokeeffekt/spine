# Phase 3: App Shell and Library UI - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can open the app in a browser, log in, browse their audiobook library, and install the app to their home screen. This phase delivers: login page, library grid view, book detail view with chapter list, search/filter, PWA manifest, and service worker for app shell caching.

</domain>

<decisions>
## Implementation Decisions

### Login page & auth flow
- **D-01:** Minimal centered login form — username, password, submit button. No branding beyond "Spine" as a heading. Dark background, light form card.
- **D-02:** On login failure, show inline error message below the form ("Invalid username or password"). No toast/snackbar.
- **D-03:** After successful login, redirect to the library grid. Store the user's role in Alpine.js `$store.auth` for conditional admin UI (e.g., showing user management link).
- **D-04:** Logout button in a simple top nav bar. Clicking it calls `POST /auth/logout` and redirects to the login page.

### Library grid layout
- **D-05:** Responsive CSS Grid of book cards. 2 columns on mobile, 3 on tablet, 4-5 on desktop. No infinite scroll — all books load at once (flat array from API, household-sized library).
- **D-06:** Each card shows: cover art image (or placeholder if no cover), title (truncated to 2 lines), author (1 line). No duration or narrator on the card — save that for detail view.
- **D-07:** Cover art uses a 2:3 aspect ratio container (like book covers). Object-fit cover. Placeholder is a neutral gray with a book icon or the first letter of the title.
- **D-08:** Cards have subtle rounded corners and a hover/tap state (slight elevation or border). Clicking navigates to the book detail view.

### Search & filter
- **D-09:** Search bar at the top of the library, full width. Live filtering as the user types — filters by title and author (case-insensitive substring match). Client-side only, no API call.
- **D-10:** When search has no results, show a simple "No books match" message centered in the grid area. Clear button (×) on the search input to reset.

### Book detail view
- **D-11:** Detail view shows: large cover art, title, author, narrator, duration (formatted as "Xh Ym"), description (if available), and a chapter list.
- **D-12:** Chapter list is a scrollable numbered list. Each row shows: chapter title and duration. Tapping a chapter does nothing in this phase — playback comes in Phase 4.
- **D-13:** Back button or breadcrumb to return to the library grid. No in-app routing library — use Alpine.js `x-show` to toggle between views (login, library, detail) based on `$store.app.view` state.
- **D-14:** A prominent "Play" button exists on the detail view but is disabled/grayed in this phase with a tooltip "Coming soon". Phase 4 wires it up.

### PWA & service worker
- **D-15:** Web App Manifest (`manifest.json`) with: `name: "Spine"`, `short_name: "Spine"`, `display: "standalone"`, `theme_color` and `background_color` matching the app's dark theme, icons at 192px and 512px (simple generated icons).
- **D-16:** Service worker (`sw.js`) using Workbox CDN (`importScripts`). Precaches the app shell (index.html, CSS, JS). NetworkFirst for API calls. No audio caching in this phase — that's Phase 6.
- **D-17:** Register the service worker from `index.html`. Browser will prompt "Add to Home Screen" once manifest and SW are in place.

### App structure
- **D-18:** Single `public/index.html` file with all HTML. Alpine.js loaded via CDN `<script defer>`. CSS in a single `public/style.css`. No build step.
- **D-19:** Dark theme by default — dark gray background (#1a1a2e or similar), light text. Clean, modern feel. No theme toggle in v1.
- **D-20:** Static files served via Hono's `serveStatic` middleware from the `public/` directory. Server.ts updated to serve `public/` at root path, with API routes taking precedence.

### Claude's Discretion
- Exact color palette and typography choices
- Icon generation approach (SVG placeholder vs simple PNG)
- Alpine.js store organization (`$store.auth`, `$store.library`, `$store.app`)
- CSS approach (vanilla CSS vs utility classes)
- Loading skeleton design while fetching books
- Exact responsive breakpoints
- How the login → library transition animates (if at all)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### API endpoints (Phase 2, ready to consume)
- `src/routes/auth.ts` — POST /auth/login, POST /auth/logout — login sets HttpOnly cookie automatically
- `src/routes/books.ts` — GET /api/books (D-11 shape: id, title, author, narrator, duration_sec, cover_url, has_chapters), GET /api/books/:id (full book + chapters array)
- `src/routes/cover.ts` — GET /api/books/:id/cover — cover art images

### Server setup
- `src/server.ts` — Current Hono app, needs serveStatic middleware added for public/ directory
- `CLAUDE.md` §Technology Stack — Alpine.js 3.15.x CDN, Workbox 7.4.0 CDN, no build step

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- API is fully functional — login, book listing, book detail, cover art all ready
- Session cookie is HttpOnly and sent automatically with same-origin requests — no manual token handling needed in frontend

### Established Patterns
- Hono serves API at `/api/*` and auth at `/auth/*` — static files should serve from `/` without conflicting
- Book listing returns `cover_url` as `/api/books/:id/cover` — use directly as `<img src>`

### Integration Points
- `POST /auth/login` with `{ username, password }` → sets cookie, returns `{ role }`
- `GET /api/books` → array of books for the grid
- `GET /api/books/:id` → book detail with chapters
- All `/api/*` calls return 401 if not authenticated — frontend redirects to login on 401

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

- Audio playback — Phase 4
- Progress tracking — Phase 4
- Lock screen controls — Phase 5
- Offline download — Phase 6
- Admin user management UI — could be a future phase (API exists, no frontend for it yet)
- Theme toggle (light/dark) — not in v1

</deferred>

---

*Phase: 03-app-shell-and-library-ui*
*Context gathered: 2026-03-22*
