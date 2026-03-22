# Project Research Summary

**Project:** Spine
**Domain:** Self-hosted audiobook PWA (.m4b only, household multi-user)
**Researched:** 2026-03-22
**Confidence:** HIGH

## Executive Summary

Spine is a self-hosted audiobook player PWA targeting a household of 2-10 users who want to leave Audible without losing its core experience. The established pattern for this type of project is a thin Node/Bun HTTP server serving metadata from SQLite and audio bytes via HTTP range requests, paired with a no-build-step frontend using Alpine.js stores for state and Workbox for service worker offline support. The primary reference implementation (Audiobookshelf) confirms this architecture works at scale, but Spine deliberately narrows scope to .m4b files only and avoids the external metadata API dependencies that create maintenance burden for self-hosted operators.

The recommended approach is to build in strict dependency order: database schema and auth first, then the library scanner (the highest-risk foundational step because ffprobe quality gates every UX feature), then the streaming backend, then the frontend player, and finally offline download. This order reflects the architecture's natural dependency chain and front-loads the components with the most failure surface. The no-build-step constraint (Alpine.js via CDN, Workbox via CDN) is workable but requires disciplined use of Alpine Stores to avoid state sprawl in inline `x-data` attributes.

The two highest risks are (1) audio seeking being silently broken by missing HTTP 206 range responses on the backend or missing `RangeRequestsPlugin` in the service worker, and (2) iOS background audio being fundamentally unavailable in PWA context. The first risk is preventable by building range-request support correctly from day one and verifying it before writing any player UI. The second is a platform policy limitation, not a bug — Android Chrome is the correct primary mobile target, and iOS should be documented as best-effort from the start.

---

## Key Findings

### Recommended Stack

The stack is a clean, minimal set with no unnecessary dependencies. Hono replaces Express as the HTTP framework because it runs natively on both Bun and Node.js 22 LTS, has built-in TypeScript types, and includes JWT/cookie middleware. The preferred runtime is Bun 1.2.x (faster startup, built-in `Bun.password` for Argon2id hashing), with Node.js 22 LTS as a drop-in fallback using the same Hono code. `better-sqlite3` handles all structured data (books, chapters, users, progress) with a synchronous API that avoids async complexity in a single-container deployment. The frontend uses no build step: Alpine.js 3.15.x and Workbox 7.4.0 both load from CDN. `fluent-ffmpeg` was archived in May 2025 and must not be used; direct `child_process.spawn` calling `ffprobe` is ~20 lines and the correct approach.

**Core technologies:**
- **Hono 4.12.x**: HTTP framework — runtime-agnostic, runs on Bun and Node.js, replaces Express
- **Bun 1.2.x / Node.js 22 LTS**: Runtime — Bun preferred for speed and built-in password hashing; Node.js is the fallback
- **better-sqlite3 12.8.x**: Database — synchronous API, 448K ops/sec, zero external deps, perfect for single-container
- **Alpine.js 3.15.x (CDN)**: Frontend reactivity — no build step, x-data/x-store sufficient for library grid + player
- **Workbox 7.4.0 (CDN)**: Service worker / offline — CacheFirst + RangeRequestsPlugin for audio, NetworkFirst for API
- **ffprobe 7.x (system binary)**: Metadata extraction — the only reliable tool for .m4b chapter markers and cover art
- **jose 5.x**: JWT signing — pure JS, works on Node and Bun, peer dep of Hono JWT middleware
- **zod 3.x**: Request validation — TypeScript inference from schemas, used via `@hono/zod-validator`

### Expected Features

The Audible baseline sets the floor — missing any table-stakes feature makes Spine feel like a downgrade, not a replacement. The most critical is resume-from-position (users consider losing position unforgivable) followed by chapter navigation (expected because .m4b files embed chapters) and offline download (a primary motivation for leaving Audible). Multi-user household support with per-user progress isolation is a core requirement, not a nice-to-have. See `.planning/research/FEATURES.md` for the full prioritization matrix.

**Must have (table stakes — P1):**
- Library browse with cover art — how users identify books; cover extracted from .m4b at scan time
- Audio player with play/pause, +30s/-30s skip, chapter navigation, speed control (0.5x–3.0x)
- Resume from last position — local-first via IndexedDB; losing position is unforgivable
- Lock-screen / notification playback controls — Media Session API; required on Android
- Offline whole-book download — Cache Storage + service worker; primary motivation for the project
- Auth with per-user sessions — household multi-user is a core requirement
- PWA installability — Web App Manifest + service worker registration

**Should have (differentiators — P2):**
- Progress sync to backend — push local IndexedDB position to server; additive, not required for offline use
- Per-book speed memory — remember 1.0x for fiction, 1.8x for non-fiction
- Sleep timer — fixed presets + end-of-chapter variant
- Chapter scrubber with boundary markers
- Keyboard / media-key bindings on desktop

**Defer (v2+):**
- Progress conflict resolution UI — for the edge case of same user, two offline devices
- Search and filter enhancements (genre, series, narrator) — requires richer metadata extraction
- Admin library rescan trigger

**Anti-features (do not build):**
- Real-time progress sync via WebSocket — marginal gain for household scale, high complexity
- Transcoding / multi-format support — .m4b only is a scope constraint, not a limitation
- Native mobile apps — PWA with Media Session API closes the gap; parallel native codebase not justified
- Automatic metadata scraping from external APIs — .m4b embedded metadata is sufficient; external APIs add maintenance burden

### Architecture Approach

The system is three layers: a PWA client layer (Alpine.js stores + Workbox service worker + IndexedDB/Cache Storage), a Node/Bun server layer (Hono routes, library scanner, stream handler, progress API), and a data layer (SQLite DB, read-only .m4b filesystem mount, extracted cover cache on disk). The key architectural principle is normalize-once ingest: ffprobe runs at scan time and writes to SQLite; API endpoints never spawn ffprobe. Audio streaming uses byte-range responses (HTTP 206) throughout. Progress is local-first in IndexedDB during playback and pushed to the backend only on explicit sync. The service worker uses CacheFirst with RangeRequestsPlugin for cached audio and NetworkFirst for API responses.

**Major components:**
1. **Library Scanner** (`server/library/scanner.ts` + `probe.ts`) — fs.watch + ffprobe orchestration; runs at startup and on file changes; never at request time
2. **Stream Handler** (`server/stream/routes.ts`) — byte-range audio delivery; parses `Range:` header, responds 206; stateless once DB has file path
3. **Auth Module** (`server/auth/`) — JWT issuance + validation middleware; Argon2id password hashing via `Bun.password` or `@node-rs/argon2`
4. **Service Worker** (`public/sw.js`) — Workbox CacheFirst + RangeRequestsPlugin for audio; NetworkFirst for API; app shell cache
5. **Alpine Stores** (`public/js/stores/`) — auth, library, player, progress, downloads; single source of truth for cross-component state
6. **Download Manager** (`public/js/components/downloader.js`) — explicit fetch of full audio file into Cache Storage; progress tracked in IndexedDB
7. **SQLite DB** (`server/db/`) — books, chapters, users, progress; better-sqlite3 synchronous API; queries behind named functions, no raw SQL in routes

### Critical Pitfalls

1. **Service worker range requests require RangeRequestsPlugin** — Default CacheFirst returns 200 instead of 206; browser seeking breaks silently. Always attach `RangeRequestsPlugin` + `CacheableResponsePlugin({ statuses: [200] })` to any audio route. Also add `crossorigin` to `<audio>` even for same-origin URLs.

2. **Backend must implement HTTP 206 range responses** — Without `Accept-Ranges: bytes` and proper 206 handling, browser audio seeking is non-functional (full file must buffer before scrubbing). Never use `res.sendFile()` for audio; implement range parsing manually. Verify with `curl -r 0-1023` before building any player UI.

3. **Offline audio requires explicit download, not runtime caching** — The browser streams audio as range requests (partial chunks); a service worker runtime cache accumulates partial slices, not the full file. Offline playback requires a user-triggered "Download" action that fetches the complete file as a single 200 response into Cache Storage.

4. **iOS PWA audio stops on lock screen — it is a platform policy, not a bug** — Apple does not grant PWAs background audio privileges. Target Android Chrome as the primary mobile platform. Document iOS as best-effort before the player phase begins so no engineering time is wasted on iOS-specific workarounds.

5. **Media Session API requires manual position state updates** — `setPositionState()` is not wired to `<audio>` automatically. Lock-screen controls appear but are frozen without it. Wire `setPositionState()` to the `timeupdate` event and call it again immediately after every seek action handler.

6. **.m4b chapter metadata is inconsistent across ripping tools** — `ffprobe` may return zero chapters, empty titles, or `start_time` in timebase units rather than seconds. Normalize defensively at scan time: convert to float seconds, filter zero-duration chapters, fall back to `"Chapter N"` titles, treat zero-chapter books as a single implicit chapter.

---

## Implications for Roadmap

Based on the architecture's dependency chain and the pitfall phase mappings, the natural build order is:

### Phase 1: Project Foundation and Database

**Rationale:** Everything else — auth, scanner, streaming, frontend — depends on the database schema and Docker container being in place. Starting here avoids rework.
**Delivers:** SQLite schema (users, books, chapters, progress), named query functions, Docker container with Node/Bun + ffprobe installed, environment config.
**Addresses:** The "DB schema + queries first" build order from ARCHITECTURE.md.
**Avoids:** Path traversal risk — file-serving routes need the library index before they can be written safely.

### Phase 2: Auth and User Sessions

**Rationale:** Auth is a prerequisite for every protected route. Building it second means every subsequent phase can be developed against real session logic rather than stubbed out.
**Delivers:** POST /auth/login + /auth/logout, JWT issuance, Hono auth middleware, Argon2id password hashing, per-user session model.
**Uses:** `jose`, `Bun.password` / `@node-rs/argon2`, Hono cookie/JWT middleware.
**Avoids:** Cover art and metadata endpoints accidentally left unprotected (all routes require session validation from the start).

### Phase 3: Library Scanner and Metadata Extraction

**Rationale:** ffprobe extraction is the highest-risk foundational step — chapter navigation, cover art, and accurate duration all depend on it. Must be built and verified against a diverse set of real .m4b files before any frontend work begins.
**Delivers:** fs.watch + ffprobe orchestration, normalized book/chapter records in SQLite, cover art extracted to disk, GET /api/books + GET /api/books/:id endpoints.
**Implements:** Normalize-once ingest pattern; mtime-based dirty detection.
**Avoids:** .m4b chapter metadata inconsistency pitfall — defensive normalization (float second conversion, zero-duration filtering, fallback titles) must be in this phase.
**Research flag:** Needs validation against a real .m4b sample set (at least 5 files from different ripping tools) before declaring done.

### Phase 4: Audio Streaming Backend

**Rationale:** Range-request streaming is the most fundamental technical requirement and must be verified correct before any player UI is built. A broken streaming backend wastes all subsequent frontend work.
**Delivers:** GET /audio/:id with HTTP 206 range responses, Accept-Ranges header, Content-Range header, fs.createReadStream with byte offsets, request abort cleanup on client disconnect.
**Implements:** Byte-range streaming pattern from ARCHITECTURE.md.
**Avoids:** The two most critical pitfalls — missing range request support (Pitfall 1 & 2). Verification: `curl -r 0-1023 /audio/:id` must return 206 before this phase is closed.
**Research flag:** Standard, well-documented HTTP pattern — no additional research needed.

### Phase 5: Frontend App Shell and Auth UI

**Rationale:** Backend is now testable; frontend scaffolding can be laid with a working API to call. Auth UI is the entry gate to all other frontend work.
**Delivers:** HTML app shell, Alpine.js CDN + store registration, service worker skeleton (registration only), login/logout UI, JWT stored in localStorage, token included in all fetch calls.
**Implements:** Alpine Stores pattern (auth store first), public/js/stores/auth.js, public/sw.js stub.
**Avoids:** Inline x-data anti-pattern — stores are set up from the beginning so component state never sprawls into HTML.

### Phase 6: Library Browse UI

**Rationale:** With the library API and app shell in place, the browse grid is a straightforward Alpine component consuming existing data.
**Delivers:** Book grid with cover art, title, author, duration; search/filter (client-side); Alpine library store; NetworkFirst service worker route for /api/books.
**Addresses:** Library browse table-stakes feature.

### Phase 7: Audio Player and Progress Tracking

**Rationale:** Core playback feature; depends on working streaming backend (Phase 4) and app shell (Phase 5). Media Session API and progress persistence are built together because they share the `timeupdate` event handler.
**Delivers:** HTML `<audio>` element with crossorigin, play/pause/skip/speed controls, chapter list UI, chapter navigation, Media Session API (setActionHandler + setPositionState), progress write to IndexedDB every 5s (throttled), resume from last position.
**Implements:** Local-first progress pattern; Media Session position state pattern.
**Avoids:** Media Session desynced lock-screen controls (Pitfall 5); progress lost on tab close (UX pitfall).
**Research flag:** Media Session API physical device testing required — desktop DevTools does not replicate Android lock-screen behavior.

### Phase 8: Offline Download and Full PWA

**Rationale:** The most complex frontend piece; requires a working player (Phase 7) and the service worker skeleton (Phase 5). Offline is a primary project requirement but has clear prerequisites.
**Delivers:** Explicit "Download for offline" UI with byte-progress indicator, full-file fetch into Cache Storage, Workbox CacheFirst + RangeRequestsPlugin wired for /audio/ routes, navigator.storage.persist() call, offline/online status indicator, PWA Web App Manifest, installability.
**Implements:** Workbox CacheFirst + RangeRequestsPlugin pattern; explicit download vs. runtime caching pattern.
**Avoids:** Runtime caching fallacy (Pitfall 3); storage eviction without persistence grant; no download progress indicator (UX pitfall).
**Research flag:** Offline seeking on a physical device after airplane mode is the acceptance test — must verify before closing the phase.

### Phase 9: Progress Sync and Polish

**Rationale:** Progress sync is additive — local-first works correctly without it. Added last because it has no new architecture dependencies and benefits from a stable player implementation.
**Delivers:** GET/PUT /api/progress/:bookId, Alpine progress store sync() method, per-book speed memory, keyboard/media-key bindings, sleep timer (fixed presets + end-of-chapter).
**Addresses:** P2 features from FEATURES.md.

### Phase Ordering Rationale

- **DB before scanner before API before frontend**: The dependency chain from ARCHITECTURE.md's build order is strict — no layer can be meaningfully built without its foundation.
- **Auth in phase 2, not later**: All API routes need session validation. Building auth early means it is never retrofitted onto routes that shipped unprotected.
- **Streaming verified before player UI**: Pitfall 1 and 2 have HIGH recovery costs if discovered after the player is built. The curl verification test closes the phase before any frontend work begins.
- **Offline download last among core features**: Explicitly decoupled from streaming per Pitfall 3 — they are different code paths. The download manager only makes sense after the player proves the streaming backend works.
- **iOS documented before player phase**: Platform limitations set as known constraints before engineering time is allocated, not after time is spent.

### Research Flags

Phases likely needing deeper research or careful validation during planning:
- **Phase 3 (Library Scanner):** Real-world .m4b sample diversity is hard to anticipate from docs alone. The normalization logic needs to be designed against a concrete set of ffprobe output samples. Consider collecting sample ffprobe JSON output from 5+ files before writing normalization code.
- **Phase 7 (Audio Player / Media Session):** Media Session API behavior on physical Android devices with screen locked is notoriously hard to test in CI. Plan for manual device testing time in this phase's estimate.
- **Phase 8 (Offline Download):** Cache Storage quota behavior and navigator.storage.persist() permission UX varies by browser and OS. Plan manual testing on Android Chrome and desktop Chrome, including testing with storage quota artificially reduced.

Phases with standard, well-documented patterns (skip additional research):
- **Phase 1 (Foundation):** SQLite schema and Docker Alpine + ffmpeg are fully documented.
- **Phase 2 (Auth):** Hono JWT middleware + Argon2id is documented in official sources.
- **Phase 4 (Streaming):** HTTP 206 range request implementation is a documented Node.js pattern with working code examples in ARCHITECTURE.md.
- **Phase 6 (Library Browse):** Straightforward Alpine.js store + fetch pattern.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All critical choices verified against official docs or GitHub releases as of March 2026. fluent-ffmpeg deprecation confirmed. Bun range request bug confirmed fixed in 1.1.9. |
| Features | HIGH | Cross-verified against Audible baseline, Audiobookshelf feature set, and community self-hosting reports. Feature dependencies mapped explicitly. |
| Architecture | HIGH | Patterns verified against official Workbox docs, web.dev, and Audiobookshelf architecture analysis. Code examples provided for all critical patterns. |
| Pitfalls | HIGH (technical) / MEDIUM (iOS) | Range requests, service worker, Media Session pitfalls verified against official docs and production post-mortems. iOS limitations confirmed across multiple practitioner sources but Apple platform policy can change. |

**Overall confidence:** HIGH

### Gaps to Address

- **Alpine.js component organization at this project's scale**: Research found minimal domain-specific sources for Alpine-only (no-build-step) SPAs of this complexity. The store-based pattern is recommended but untested at Spine's exact scale. Validate the store structure early in Phase 5 before it propagates across all components.
- **.m4b sample diversity**: Research identified the category of chapter metadata inconsistency but cannot predict which edge cases the user's specific library will hit. Build normalization defensively and plan a scan-validation step against the actual audiobook collection before the Phase 3 milestone is closed.
- **Docker volume performance for large libraries**: Audio streaming performance from a Docker volume mount on different NAS/host configurations was not benchmarked. For most home server setups this will be fine; flag as a potential issue if the user reports playback stuttering.

---

## Sources

### Primary (HIGH confidence)
- https://hono.dev/docs/getting-started/nodejs — Hono Node.js adapter, verified March 2026
- https://github.com/WiseLibs/better-sqlite3 — v12.8.0 release, March 2026
- https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video — official Workbox audio caching documentation
- https://web.dev/articles/media-session — official Media Session API guide
- https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist — storage persistence API
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria — eviction behavior
- https://bun.com/docs/guides/util/hash-a-password — Bun.password built-in
- https://github.com/honojs/hono/releases — Hono version history

### Secondary (MEDIUM confidence)
- https://github.com/advplyr/audiobookshelf — leading self-hosted reference implementation, feature set analysis
- https://deepwiki.com/advplyr/audiobookshelf/3.2-api-architecture — Audiobookshelf architecture analysis
- https://philna.sh/blog/2018/10/23/service-workers-beware-safaris-range-request/ — Safari range request behavior
- https://blog.prototyp.digital/what-we-learned-about-pwas-and-audio-playback/ — PWA audio practitioner post-mortem
- https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide — iOS PWA limitations 2026 status
- https://nathangrigg.com/2025/03/self-hosted-audiobooks/ — household self-hosting motivations and use case
- https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/1324 — deprecation confirmation May 2025

### Tertiary (LOW confidence)
- Docker Alpine + ffmpeg pattern, multi-stage builds — general Docker documentation inference
- Alpine.js component organization at SPA scale — limited domain-specific sources found

---
*Research completed: 2026-03-22*
*Ready for roadmap: yes*
