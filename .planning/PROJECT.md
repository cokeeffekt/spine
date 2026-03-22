# Spine

## What This Is

A self-hosted audiobook platform that turns a local folder of .m4b files into a browser-based, offline-capable listening experience. A Node/Bun backend scans and catalogs audiobooks, extracts metadata and chapters, and exposes a REST API. A lightweight Alpine + Workbox PWA lets household members browse, stream, download, and resume audiobooks across devices — replacing Audible with something you own and control.

## Core Value

A household can browse their audiobook library, listen with full player controls (chapters, speed, skip), and pick up exactly where they left off — on any device, even offline.

## Requirements

### Validated

- [x] Backend scans a configured directory of .m4b files and extracts metadata (title, author, cover, duration) — Validated in Phase 01: Foundation
- [x] Backend extracts chapter information from .m4b files — Validated in Phase 01: Foundation
- [x] Metadata and chapters normalized once at scan time, served from cache — Validated in Phase 01: Foundation
- [x] REST API exposes library listing, book details, chapter info, and audio streaming — Validated in Phase 02: Auth and API
- [x] Full auth system — username/password login with per-user sessions — Validated in Phase 02: Auth and API
- [x] PWA browse view — library grid/list with cover art, title, author — Validated in Phase 03: App Shell and Library UI
- [x] PWA installable on mobile and desktop — Validated in Phase 03: App Shell and Library UI

### Active
- [ ] Multiple household members with separate accounts and isolated progress
- [ ] In-browser audio player with chapter navigation, +30s/-30s skip, playback speed control
- [ ] Android lock-screen / notification controls via Media Session API
- [ ] Progress tracking — remembers position per book per user (chapter + timestamp)
- [ ] Progress is local-first (works offline, stored on-device)
- [ ] Optional manual progress sync to backend when online
- [ ] Whole-book offline download via Cache Storage + IndexedDB
- [ ] Downloaded books playable without network connection

### Out of Scope

- Multi-format support (mp3 folders, etc.) — all books are .m4b, keeps parsing simple
- Real-time / automatic progress sync — local-first by design, manual sync when wanted
- Per-chapter downloads — whole book download only
- Social features (ratings, reviews, recommendations) — personal household use
- Transcoding or format conversion — serve .m4b directly
- Mobile native apps — PWA covers the use case

## Context

- Motivated by leaving Audible — user wants ownership and control over their audiobook library
- Household of a few people, each needing their own progress tracking
- .m4b is the sole format — these are typically AAC audio with embedded chapters and metadata
- ffprobe (ffmpeg) is the standard tool for extracting .m4b metadata and chapter markers
- Self-contained Docker deployment — Dockerfile + docker-compose for the entire stack
- "Normalize once" philosophy: scan/extract at ingest time, not on every request
- Alpine.js chosen for lightweight reactivity without a build step
- Workbox for service worker / offline caching strategy
- The app needs to feel polished enough to fully replace Audible — not a prototype

## Constraints

- **Format**: .m4b only — simplifies parsing and streaming, no transcoding needed
- **Backend**: Node or Bun — JavaScript/TypeScript ecosystem
- **Frontend**: Alpine.js + Workbox PWA — no heavy framework, no build step required
- **Storage**: Filesystem-based library — no database required for media files
- **Auth**: Full username/password — household members need separate accounts
- **Deployment**: Fully self-hostable — single Docker container, no external dependencies
- **Environment**: Self-contained Dockerized setup — Dockerfile + docker-compose, everything runs in containers

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| .m4b only | All user's books are .m4b, simplifies metadata/chapter extraction | Validated — Phase 01 |
| bun:sqlite over better-sqlite3 | better-sqlite3 uses V8 C++ API incompatible with Bun runtime; bun:sqlite is built-in with same sync API | Phase 01 deviation |
| Alpine.js over React/Vue | Lightweight, no build step, inspectable | Validated — Phase 03 |
| Local-first progress | Works offline, user controls their data | — Pending |
| Whole-book downloads | Simpler than chapter-level granularity, matches user preference | — Pending |
| Full auth over simple profiles | Household needs real account separation | — Pending |

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
*Last updated: 2026-03-22 after Phase 04 completion — Player and Progress: full audio player with play/pause/skip/speed/chapters/seek, IndexedDB progress tracking, sleep timer, keyboard shortcuts, media keys*
