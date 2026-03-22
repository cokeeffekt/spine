# Roadmap: Spine

## Overview

Spine is built in strict dependency order. The foundation (Docker, SQLite, scanner) comes first because every other layer depends on it. Auth and the API layer follow because every frontend route needs session validation from the start. The frontend then builds on a working authenticated API: app shell and library browse, then the full player with progress tracking, then lock-screen controls, and finally offline download. This order front-loads the highest-risk components (ffprobe metadata extraction, HTTP 206 range streaming) so that problems are discovered before dependent frontend work is written.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Docker container, SQLite schema, and .m4b library scanner with ffprobe metadata extraction (completed 2026-03-22)
- [x] **Phase 2: Auth and API** - Username/password auth with sessions and all protected REST API endpoints (completed 2026-03-22)
- [x] **Phase 3: App Shell and Library UI** - Frontend entry point, PWA installability, and library browse grid (completed 2026-03-22)
- [ ] **Phase 4: Player and Progress** - In-browser audio player with full controls and local-first progress tracking
- [ ] **Phase 5: Lock Screen Controls** - Media Session API integration for Android lock-screen playback controls
- [ ] **Phase 6: Offline Download** - Whole-book offline download with Workbox CacheFirst and range-request service worker

## Phase Details

### Phase 1: Foundation
**Goal**: The project infrastructure is in place and the library scanner correctly extracts metadata from .m4b files
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, SCAN-01, SCAN-02, SCAN-03, SCAN-04, SCAN-05
**Success Criteria** (what must be TRUE):
  1. `docker compose up` starts the stack and the server is reachable at localhost
  2. Pointing the scanner at a directory of .m4b files populates a SQLite database with books, chapters, cover art paths, and duration
  3. A book with missing embedded metadata falls back to folder-level helper files (cover.jpg, metadata.json) and is still cataloged
  4. A chapter-less .m4b is cataloged as a single implicit chapter without error
  5. Cover art extracted from a .m4b is accessible as a file on disk
**Plans:** 3/3 plans complete

Plans:
- [x] 01-01-PLAN.md — Project skeleton, Docker infrastructure, SQLite schema, and types
- [x] 01-02-PLAN.md — ffprobe metadata extraction, cover art extraction, and directory walker
- [x] 01-03-PLAN.md — Scanner orchestrator, fallback metadata, file watcher, and server integration

### Phase 2: Auth and API
**Goal**: Household members can log in and access the library API with their own sessions
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, API-01, API-02, API-03, API-04
**Success Criteria** (what must be TRUE):
  1. An admin account exists after first-run setup (env var or interactive prompt)
  2. Admin can create a new user account; that user can log in and receive a session token
  3. A logged-in user stays authenticated across browser refresh
  4. A logged-out user cannot access any API endpoint (receives 401)
  5. The library listing endpoint returns books with title, author, cover URL, and duration
  6. The audio streaming endpoint responds with HTTP 206 and correct Content-Range header for a byte-range request (`curl -r 0-1023` returns 206)
**Plans:** 2/2 plans complete

Plans:
- [x] 02-01-PLAN.md — Schema extension, auth middleware, admin bootstrap, and login/logout routes
- [x] 02-02-PLAN.md — User management, book/cover API routes, and audio streaming with HTTP 206

### Phase 3: App Shell and Library UI
**Goal**: Users can open the app in a browser, log in, browse their audiobook library, and install the app to their home screen
**Depends on**: Phase 2
**Requirements**: LIB-01, LIB-02, LIB-03, PWA-01, PWA-02, PWA-03
**Success Criteria** (what must be TRUE):
  1. User can log in via the browser UI and is redirected to the library grid
  2. Library grid shows cover art, title, and author for every scanned book
  3. User can search or filter the library by title or author and results update live
  4. User can tap a book to see its detail view (chapter list, duration, description if available)
  5. Browser prompts "Add to Home Screen"; installed app opens as a standalone window with no browser chrome
**Plans:** 2/2 plans complete

Plans:
- [x] 03-01-PLAN.md — PWA infrastructure: serveStatic middleware, manifest, service worker, and icons
- [x] 03-02-PLAN.md — Frontend UI: login form, library grid with search, and book detail view

### Phase 4: Player and Progress
**Goal**: Users can listen to audiobooks with full player controls and resume from exactly where they left off
**Depends on**: Phase 3
**Requirements**: PLAY-01, PLAY-02, PLAY-03, PLAY-04, PLAY-05, PLAY-06, PLAY-07, PLAY-08, PROG-01, PROG-02, PROG-03, PROG-04
**Success Criteria** (what must be TRUE):
  1. User can play and pause audio, skip +30s/-30s, and adjust speed from 1.0x to 2.0x in 0.2x steps
  2. Player shows current chapter title, elapsed time, and total duration; user can jump to any chapter from the chapter list
  3. Closing and reopening a book resumes from the last saved chapter and timestamp
  4. Two household members listening to the same book each resume from their own independent position
  5. A sleep timer set to any preset (5/10/15/30/60 min or end of chapter) stops playback at the correct time
  6. Spacebar pauses/resumes, arrow keys seek, and media keys work on desktop
**Plans:** 1/3 plans executed

Plans:
- [x] 04-00-PLAN.md — Wave 0: Extract pure player utility functions and create unit tests
- [ ] 04-01-PLAN.md — Core player: $store.player, IndexedDB progress, audio element, player bar UI, chapter navigation, speed control
- [ ] 04-02-PLAN.md — Sleep timer, keyboard shortcuts, media keys, book-switch confirmation, go-to-title button

### Phase 5: Lock Screen Controls
**Goal**: Users listening on Android can control playback from the lock screen without unlocking the device
**Depends on**: Phase 4
**Requirements**: LOCK-01, LOCK-02, LOCK-03
**Success Criteria** (what must be TRUE):
  1. Android lock screen shows the current book's title, author, and cover art while audio plays
  2. Lock-screen play/pause and skip forward/back buttons control playback correctly
  3. Lock-screen scrubber reflects current position and a seek on the scrubber updates the player position
**Plans**: TBD

### Phase 6: Offline Download
**Goal**: Users can download audiobooks and play them without a network connection, including seeking
**Depends on**: Phase 4
**Requirements**: OFFL-01, OFFL-02, OFFL-03, OFFL-04
**Success Criteria** (what must be TRUE):
  1. Tapping "Download" on a book fetches the complete audio file and shows byte-level progress during the download
  2. With the device in airplane mode, a downloaded book plays from start and seeking works (no spinner, no error)
  3. Downloaded books are listed with their storage size; user can delete a download to free space
  4. The app shell and library UI load without a network connection after first use
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete   | 2026-03-22 |
| 2. Auth and API | 2/2 | Complete   | 2026-03-22 |
| 3. App Shell and Library UI | 2/2 | Complete   | 2026-03-22 |
| 4. Player and Progress | 1/3 | In Progress|  |
| 5. Lock Screen Controls | 0/TBD | Not started | - |
| 6. Offline Download | 0/TBD | Not started | - |
