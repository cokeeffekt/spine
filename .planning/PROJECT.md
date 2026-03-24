# Spine

## What This Is

A self-hosted audiobook platform that turns a local folder of .m4b files into a browser-based, offline-capable listening experience. A Node/Bun backend scans and catalogs audiobooks, extracts metadata and chapters, and exposes a REST API. A lightweight Alpine + Workbox PWA lets household members browse, stream, download, and resume audiobooks across devices — replacing Audible with something you own and control.

## Core Value

A household can browse their audiobook library, listen with full player controls (chapters, speed, skip), and pick up exactly where they left off — on any device, even offline.

## Current State

**Shipped: v1.0** (2026-03-23)

All core functionality delivered:
- .m4b library scanning with ffprobe metadata/chapter extraction
- Auth with Argon2id, session cookies, admin user management
- PWA with Alpine.js — library grid, search, detail view
- Full audio player — chapters, speed, skip, sleep timer, keyboard shortcuts
- Per-user progress tracking via IndexedDB (local-first)
- Lock-screen controls via Media Session API
- Offline download with Workbox CacheFirst + RangeRequestsPlugin
- Dockerized single-container deployment
- Admin user management with create/delete/password-reset
- Admin-triggered library rescan with live SSE progress bar and Audnexus metadata enrichment
- Cross-device progress sync — server-backed PUT/GET API, furthest-position-wins resume, offline queue flush, tile progress bars

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

## Out of Scope

- ~~Multi-format support~~ — MP3 folder scanning shipped in Phase 10 (v1.1)
- Real-time progress sync — local-first by design; manual sync planned for v2
- Per-chapter downloads — whole book download only
- Social features — personal household use
- Native mobile apps — PWA covers the use case
- Transcoding — serve .m4b directly

## Current Milestone: v1.1 Admin Tools & Library Improvements

**Goal:** Give the admin control over users and the library, show reading progress in the UI, sync progress across devices, and support MP3 audiobook folders.

**Target features:**
- Admin UI for user creation/management (create, delete, reset passwords)
- Admin-triggered library rescan from the browser
- Reading progress indicator (%) on library grid tiles
- Progress sync to backend (push local progress, fetch on resume, conflict handling)
- MP3 folder support — scan folders of .mp3 files as audiobooks, derive metadata from folder/file names

## Context

- Motivated by leaving Audible — user wants ownership and control
- Household of a few people, each needing their own progress tracking
- ffprobe is the standard tool for .m4b metadata and chapter markers
- "Normalize once" philosophy: scan/extract at ingest time, not on every request
- MP3 audiobook collections have inconsistent folder structures — scanner must handle multiple naming patterns

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
*Last updated: 2026-03-25 — Phase 11 (MP3 player support) complete — v1.1 milestone finished*
