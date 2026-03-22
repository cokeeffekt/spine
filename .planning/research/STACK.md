# Stack Research

**Domain:** Self-hosted audiobook PWA (Node/Bun backend, Alpine.js frontend, .m4b only)
**Researched:** 2026-03-22
**Confidence:** HIGH (all critical choices verified against current docs or official sources)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Hono | 4.12.x | HTTP framework / REST API | Runs natively on both Node.js and Bun with zero-config adapter swap. Ultrafast RegExpRouter, built-in TypeScript types, JWT + cookie middleware included. Active release cadence (weekly patches in March 2026). Replaces Express with better DX and no performance penalty. |
| Bun | 1.2.x (or Node.js 22 LTS) | JavaScript runtime | Bun is the preferred runtime: faster startup, built-in password hashing (`Bun.password`), native TypeScript. Node.js 22 LTS is the drop-in fallback — same Hono code runs on both. Range-request bug (Issue #10440) was fixed in Bun v1.1.9. |
| better-sqlite3 | 12.8.x | Metadata + user/session store | Synchronous API avoids callback complexity. 448K ops/sec vs 224K for libsql. Zero external dependencies — perfect for a single-container deployment. Stores normalized book metadata, chapter lists, users, and session tokens. |
| Alpine.js | 3.15.x | Frontend reactivity | Loaded via CDN `<script defer>` — no build step. x-data/x-bind/x-on are sufficient for library grid, player controls, and settings. Stores handle cross-component state (playback, queue). Chosen over React/Vue because inspectable HTML is a project constraint. |
| Workbox (workbox-sw) | 7.4.0 | Service worker / offline caching | Loaded via `importScripts()` CDN — no build step required. CacheFirst for audio files, NetworkFirst for API responses. Handles whole-book offline download into Cache Storage. The `workbox-sw` module auto-loads sub-packages on first use. |
| ffprobe (system binary) | 7.x (via Docker) | .m4b metadata + chapter extraction | The only reliable tool for reading AAC/MP4 chapter markers, embedded cover art, and format tags. Called directly via `child_process.spawn` — no wrapper library needed (fluent-ffmpeg is deprecated/archived as of May 2025). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@hono/node-server` | latest | Node.js adapter for Hono | Required when running on Node.js 22 (not needed on Bun, which uses `Bun.serve`). Also provides `serveStatic` with range-request support for audio streaming. |
| `@node-rs/argon2` | 2.x | Password hashing (Node.js) | Use on Node.js. Precompiled Rust binary — no node-gyp. Faster than `argon2` npm package. Use `Bun.password` instead when running on Bun (built-in, zero deps). |
| `jose` | 5.x | JWT signing for session tokens | Pure JavaScript, works on Node and Bun. Used to sign/verify session JWTs stored in HttpOnly cookies. Ships with Hono's JWT middleware as a peer dep. |
| `zod` | 3.x | Request validation | Used in Hono route handlers via `@hono/zod-validator`. Validates login payloads, API query params. TypeScript inference from schemas means no duplicate type definitions. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript | Type safety across the entire backend | Run directly with `bun run` (Bun) or `tsx` (Node.js). No `tsc` compile step needed in development. |
| `tsx` | TypeScript executor for Node.js dev | Drop-in `ts-node` replacement; much faster. Only needed if not using Bun. |
| Docker + docker-compose | Single-container deployment | Multi-stage build: `node:22-alpine` (or `oven/bun:alpine`) as runtime, system `ffmpeg` package installed in the same image. No separate containers needed. |

---

## Installation

```bash
# Core backend (Bun)
bun add hono better-sqlite3 zod jose

# Core backend (Node.js)
npm install hono @hono/node-server better-sqlite3 zod jose @node-rs/argon2

# Hono validation middleware
bun add @hono/zod-validator
# or
npm install @hono/zod-validator

# Dev dependencies (Node.js path only)
npm install -D typescript tsx @types/better-sqlite3

# Frontend — no npm install. Load via CDN in HTML:
# Alpine.js:  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.15.8/dist/cdn.min.js"></script>
# Workbox sw: importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.4.0/workbox-sw.js')
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Hono | Express | Never for new projects. Express has no native Bun support, no built-in TypeScript types, slower router. Use Hono. |
| Hono | Fastify | If the team prefers plugin-based architecture and JSON schema validation. Fastify is excellent but has more setup overhead; overkill for this project scope. |
| better-sqlite3 | `node:sqlite` (built-in) | Once Node.js 24 ships as LTS (late 2025) and the module stabilizes. As of March 2026 it is still marked experimental in some contexts. better-sqlite3 12.x is production-proven. |
| better-sqlite3 | libsql | If you need remote SQLite (Turso) or async-first API. For local self-hosted use, libsql is half the performance with no benefit. |
| Direct `child_process.spawn` for ffprobe | fluent-ffmpeg | Never. fluent-ffmpeg was archived and deprecated in May 2025. Direct spawn is ~20 lines of code and avoids a dead dependency. |
| Alpine.js CDN | Vue / React | If the UI grows complex (lots of cross-component state, transitions, forms). For a library browser + audio player, Alpine's x-data/x-store is sufficient. |
| Workbox CDN (workbox-sw) | Vite PWA plugin | If a build step is ever introduced. For the no-build-step constraint, workbox-sw via CDN is the only option. |
| `@node-rs/argon2` (Node.js) | `bcrypt` npm | bcrypt is still acceptable but Argon2id is the 2025 standard per OWASP and the Password Hashing Competition. @node-rs/argon2 is faster and has no node-gyp build step. |
| `Bun.password` (Bun) | `argon2` npm | `argon2` npm is a native addon that had compatibility issues with Bun. `Bun.password` is built-in, zero-dependency, and uses Argon2id by default. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `fluent-ffmpeg` | Archived and deprecated May 2025. NPM package marked deprecated. No security patches. | Direct `child_process.spawn` calling `ffprobe -print_format json -show_format -show_streams -show_chapters` |
| `@ffmpeg/ffmpeg` (WASM) | Runs FFmpeg in WebAssembly — 10-100x slower than system binary, not suitable for server-side batch scanning | System `ffmpeg`/`ffprobe` binary via spawn |
| `sqlite3` (npm) | Callback-only API, significantly slower than better-sqlite3, requires node-gyp | `better-sqlite3` |
| `express` | No Bun support, deprecated ecosystem relative to Hono, no built-in TypeScript, slower router | `hono` |
| `passport.js` | Heavy, Express-coupled, overkill for simple username/password + session. Adds 5+ transitive deps. | Hono cookie middleware + `jose` JWT + manual credential check |
| `multer` / form-based uploads | Spine does not accept uploads — library is filesystem-only | N/A |
| `node:sqlite` as primary DB | Still experimental as of early 2026. API surface is incomplete versus better-sqlite3. | `better-sqlite3` |
| React / Vue for frontend | Requires build step. Project constraint is no build step. | Alpine.js |

---

## Stack Patterns by Variant

**If running on Bun:**
- Use `Bun.serve()` natively (Hono's Bun adapter is built-in, no separate package)
- Use `Bun.password.hash()` / `Bun.password.verify()` for password hashing — zero additional dependencies
- TypeScript runs directly via `bun run server.ts`

**If running on Node.js 22 LTS:**
- Add `@hono/node-server` adapter package
- Add `@node-rs/argon2` for password hashing
- Run TypeScript via `tsx server.ts` in development, compile for production
- HTTP range requests for audio streaming handled by `@hono/node-server`'s `serveStatic`

**If deploying to Docker (expected path):**
- Base image: `node:22-alpine` or `oven/bun:1-alpine`
- Install `ffmpeg` system package in Dockerfile (`apk add ffmpeg`) — this gives both `ffmpeg` and `ffprobe` binaries
- No multi-stage build needed: the Alpine image with ffmpeg is small enough (~120MB with Node, ~80MB with Bun)
- Mount audiobook directory as a volume — do not copy media into the image

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `better-sqlite3@12.x` | Node.js >=18, Bun >=1.0 | Prebuilt binaries for common platforms. Bun can run it via Node-API compatibility. |
| `hono@4.x` + `@hono/node-server` | Node.js >=18 | Hono core is runtime-agnostic; adapter handles Node.js specifics. |
| `@node-rs/argon2@2.x` | Node.js >=18 | Prebuilt Rust binary, no gyp. Not needed on Bun (use `Bun.password`). |
| `alpine.js@3.15.x` CDN | All modern browsers, iOS Safari 14+, Android Chrome | Media Session API (lock-screen controls) requires Chrome 57+ / Safari 15+. |
| `workbox-sw@7.4.0` CDN | All browsers supporting Service Workers | Service Worker requires HTTPS or localhost. Cache Storage for audio files works on all targets. |
| ffprobe 7.x | .m4b (AAC in MP4 container) | Reads `chapters`, `format.tags`, `streams[0]` (cover art as stream). Ensure `ffprobe` is in `PATH` inside the container. |

---

## Sources

- https://hono.dev/docs/getting-started/nodejs — Hono Node.js adapter, verified March 2026. Version 4.12.8 confirmed from GitHub releases.
- https://github.com/honojs/hono/releases — Hono version history, latest 4.12.8 as of March 14, 2026.
- https://github.com/WiseLibs/better-sqlite3 — better-sqlite3 v12.8.0, published ~8 days before research date.
- https://github.com/oven-sh/bun/issues/10440 — Bun range request bug confirmed fixed in v1.1.9, current Bun is 1.2.x+.
- https://bun.com/docs/guides/util/hash-a-password — Bun.password built-in, Bun-only, confirmed no npm package needed.
- https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/1324 — Deprecation/archival confirmed May 2025 by maintainer.
- https://github.com/GoogleChrome/workbox/releases — Workbox 7.4.0 is latest, November 2025.
- https://alpinejs.dev/essentials/installation — Alpine.js 3.15.8 CDN usage confirmed.
- https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/ — Argon2id recommended as 2025/2026 standard.
- https://www.npmjs.com/package/@node-rs/argon2 — @node-rs/argon2 confirmed no gyp, precompiled Rust binary.
- WebSearch (MEDIUM confidence): Docker Alpine + ffmpeg pattern, multi-stage builds, Hono session middleware options.

---
*Stack research for: Self-hosted audiobook PWA — Spine*
*Researched: 2026-03-22*
