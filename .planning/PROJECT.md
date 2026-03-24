# Spine

## What This Is

A self-hosted audiobook platform that turns a local folder of .m4b and MP3 files into a browser-based, offline-capable listening experience. A Bun backend scans and catalogs audiobooks (single-file .m4b and multi-file MP3 folders), extracts metadata and chapters, and exposes a REST API. A lightweight Alpine + Workbox PWA lets household members browse, stream, download, and resume audiobooks across devices — replacing Audible with something you own and control.

## Core Value

A household can browse their audiobook library, listen with full player controls (chapters, speed, skip), and pick up exactly where they left off — on any device, even offline.

## Current State

**Shipped: v1.1** (2026-03-25)

Everything from v1.0 plus:
- Admin UI — user management (create, delete, password reset) and library rescan with live progress
- Cross-device progress sync — server-backed with furthest-position-wins resume
- Library grid shows reading progress percentage on each tile
- MP3 folder scanning — multi-file audiobooks with disc-aware track ordering
- MP3 playback — seamless track transitions, cross-track seeking, per-track offline download
- Audnexus metadata enrichment (description, cover, narrator, series)
- Force rescan for re-probing all books

<details>
<summary>v1.0 (2026-03-23)</summary>

- .m4b library scanning with ffprobe metadata/chapter extraction
- Auth with Argon2id, session cookies, admin roles
- PWA with Alpine.js — library grid, search, detail view
- Full audio player — chapters, speed, skip, sleep timer, keyboard shortcuts
- Per-user progress tracking via IndexedDB (local-first)
- Lock-screen controls via Media Session API
- Offline download with Workbox CacheFirst + RangeRequestsPlugin
- Dockerized single-container deployment

</details>

**Outstanding:**
- Phase 05 lock-screen UAT (5 items, requires Android device testing)
- Two orphaned utility exports (sleepTimerMs, reconcileDownloads) — dead code, no impact

## Constraints

- **Format**: .m4b and MP3 folders — scanner handles both formats natively
- **Backend**: Bun (Node.js compatible) — JavaScript/TypeScript ecosystem
- **Frontend**: Alpine.js + Workbox PWA — no heavy framework, no build step required
- **Storage**: Filesystem-based library — no database required for media files
- **Auth**: Full username/password — household members need separate accounts
- **Deployment**: Fully self-hostable — single Docker container, no external dependencies

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| .m4b only | All user's books are .m4b, simplifies metadata/chapter extraction | Validated — Phase 01; extended to MP3 folders — Phase 10 |
| bun:sqlite over better-sqlite3 | better-sqlite3 uses V8 C++ API incompatible with Bun runtime | Phase 01 deviation |
| Alpine.js over React/Vue | Lightweight, no build step, inspectable | Validated — Phase 03 |
| Local-first progress + server sync | Works offline, syncs to server when online, furthest-position-wins | Validated — Phases 04, 09 |
| Whole-book downloads | Simpler than chapter-level granularity | Validated — Phase 06 |
| Full auth over simple profiles | Household needs real account separation | Validated — Phase 02 |
| Raw IndexedDB (no idb library) | Single-store schemas are simple enough | Validated — Phases 04, 06 |
| Covers written to /data/covers/ | Books volume mounted read-only in Docker | Post-v1.0 fix |
| Album tag → book title for MP3 | MP3 ID3 convention: title=track name, album=book name | Phase 11 fix |

## Out of Scope

- Real-time progress sync — local-first by design; push/pull is sufficient
- Per-chapter downloads — whole book download only
- Social features — personal household use
- Native mobile apps — PWA covers the use case
- Transcoding — serve files directly
- Multi-format beyond MP3 — FLAC, OGG not in user's collection

## Context

- Motivated by leaving Audible — user wants ownership and control
- Household of a few people, each needing their own progress tracking
- ffprobe is the standard tool for .m4b metadata and chapter markers
- "Normalize once" philosophy: scan/extract at ingest time, not on every request
- MP3 audiobook collections have inconsistent folder structures — scanner handles multiple naming patterns
- ~6,100 lines TypeScript + ~250 lines JS (player-utils, sw.js)

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-25 after v1.1 milestone*
