# Requirements: Spine

**Defined:** 2026-03-22
**Core Value:** A household can browse their audiobook library, listen with full player controls, and pick up exactly where they left off — on any device, even offline.

## v1 Requirements

### Scanning

- [x] **SCAN-01**: Backend scans a configured directory of .m4b files and extracts metadata (title, author, cover art, duration)
- [x] **SCAN-02**: Backend extracts chapter information (title, start time, end time) from .m4b files via ffprobe
- [x] **SCAN-03**: Metadata and chapters are normalized once at scan time and cached in SQLite
- [x] **SCAN-04**: Cover art extracted from .m4b and served as image endpoint
- [x] **SCAN-05**: If .m4b is missing embedded metadata, scanner checks the containing folder for helper files (cover.jpg/png, metadata.json, .cue files) and uses them as fallback

### API

- [ ] **API-01**: REST endpoint lists all books in the library (title, author, cover URL, duration)
- [ ] **API-02**: REST endpoint returns book details including chapter list
- [ ] **API-03**: REST endpoint streams .m4b audio with HTTP 206 range request support
- [ ] **API-04**: All API endpoints require authentication

### Auth

- [ ] **AUTH-01**: Admin user can create accounts for household members (no self-registration)
- [ ] **AUTH-02**: User can log in and receive a session token
- [ ] **AUTH-03**: User can log out and invalidate their session
- [ ] **AUTH-04**: Passwords are hashed with Argon2id (Bun.password or @node-rs/argon2)
- [ ] **AUTH-05**: Session persists across browser refresh
- [ ] **AUTH-06**: Initial admin account created via environment variable or first-run setup

### Player

- [ ] **PLAY-01**: User can play and pause audio in the browser
- [ ] **PLAY-02**: User can skip forward and backward 30 seconds
- [ ] **PLAY-03**: User can adjust playback speed from 1.0x to 2.0x in 0.2x intervals (1.0, 1.2, 1.4, 1.6, 1.8, 2.0)
- [ ] **PLAY-04**: User can view chapter list and jump to any chapter
- [ ] **PLAY-05**: Player shows current chapter title, elapsed time, and total duration
- [ ] **PLAY-06**: User's per-book playback speed preference is remembered across sessions
- [ ] **PLAY-07**: User can set a sleep timer (5, 10, 15, 30, 60 min presets + end of chapter)
- [ ] **PLAY-08**: Keyboard shortcuts work on desktop (spacebar pause, arrow seek, media keys)

### Progress

- [ ] **PROG-01**: User's playback position is saved per book (chapter + timestamp)
- [ ] **PROG-02**: Position is stored locally in IndexedDB (works offline)
- [ ] **PROG-03**: User resumes from last saved position when reopening a book
- [ ] **PROG-04**: Progress is isolated per user — each household member has their own position

### Lock Screen

- [ ] **LOCK-01**: Android lock-screen shows book title, author, and cover art
- [ ] **LOCK-02**: Lock-screen play/pause, skip forward/back controls work via Media Session API
- [ ] **LOCK-03**: Lock-screen scrubber reflects current position and responds to seek

### Library UI

- [ ] **LIB-01**: User sees a grid of audiobooks with cover art, title, and author
- [ ] **LIB-02**: User can search/filter the library by title or author
- [ ] **LIB-03**: User can tap a book to see details (chapters, duration, description if available)

### Offline

- [ ] **OFFL-01**: User can download an entire audiobook for offline playback
- [ ] **OFFL-02**: Downloaded books are stored in Cache Storage and playable without network
- [ ] **OFFL-03**: User can see which books are downloaded and manage storage
- [ ] **OFFL-04**: Service worker handles range requests for cached audio (seeking works offline)

### PWA

- [ ] **PWA-01**: App is installable via Web App Manifest (Add to Home Screen)
- [ ] **PWA-02**: Service worker is registered and caches app shell for offline access
- [ ] **PWA-03**: App works as standalone window when installed (no browser chrome)

### Infrastructure

- [x] **INFRA-01**: Entire stack runs in Docker (Dockerfile + docker-compose)
- [x] **INFRA-02**: Docker image includes ffmpeg/ffprobe for .m4b processing
- [x] **INFRA-03**: Audiobook directory is mounted as a Docker volume
- [x] **INFRA-04**: SQLite database persists via Docker volume

## v2 Requirements

### Sync

- **SYNC-01**: User can manually push local progress to backend when online
- **SYNC-02**: On resume, app fetches server position and merges with local
- **SYNC-03**: When local and server positions conflict, user can choose which to keep

### Library Enhancements

- **LIBE-01**: Admin can trigger a library rescan from the UI
- **LIBE-02**: Search by genre, series, or narrator (requires richer metadata)
- **LIBE-03**: Chapter scrubber with visual boundary markers on progress bar

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-format support (mp3, etc.) | All books are .m4b; single format keeps parsing simple |
| Real-time progress sync (WebSocket) | Local-first by design; manual sync in v2 |
| Per-chapter downloads | .m4b is a single file; whole-book download is simpler |
| External metadata scraping | ffprobe extracts embedded metadata; no external API dependencies |
| Native mobile apps | PWA with Media Session API closes the gap |
| Social features (ratings, reviews) | Household use only; no social graph needed |
| Transcoding / format conversion | Serve .m4b directly; no server-side processing |
| Self-registration | Admin creates accounts; prevents unauthorized access on home network |
| OAuth / magic link login | Username/password sufficient for household |
| iOS background audio continuity | Platform limitation; iOS stops audio on screen lock in PWAs |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Complete |
| SCAN-01 | Phase 1 | Complete |
| SCAN-02 | Phase 1 | Complete |
| SCAN-03 | Phase 1 | Complete |
| SCAN-04 | Phase 1 | Complete |
| SCAN-05 | Phase 1 | Complete |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 2 | Pending |
| AUTH-06 | Phase 2 | Pending |
| API-01 | Phase 2 | Pending |
| API-02 | Phase 2 | Pending |
| API-03 | Phase 2 | Pending |
| API-04 | Phase 2 | Pending |
| LIB-01 | Phase 3 | Pending |
| LIB-02 | Phase 3 | Pending |
| LIB-03 | Phase 3 | Pending |
| PWA-01 | Phase 3 | Pending |
| PWA-02 | Phase 3 | Pending |
| PWA-03 | Phase 3 | Pending |
| PLAY-01 | Phase 4 | Pending |
| PLAY-02 | Phase 4 | Pending |
| PLAY-03 | Phase 4 | Pending |
| PLAY-04 | Phase 4 | Pending |
| PLAY-05 | Phase 4 | Pending |
| PLAY-06 | Phase 4 | Pending |
| PLAY-07 | Phase 4 | Pending |
| PLAY-08 | Phase 4 | Pending |
| PROG-01 | Phase 4 | Pending |
| PROG-02 | Phase 4 | Pending |
| PROG-03 | Phase 4 | Pending |
| PROG-04 | Phase 4 | Pending |
| LOCK-01 | Phase 5 | Pending |
| LOCK-02 | Phase 5 | Pending |
| LOCK-03 | Phase 5 | Pending |
| OFFL-01 | Phase 6 | Pending |
| OFFL-02 | Phase 6 | Pending |
| OFFL-03 | Phase 6 | Pending |
| OFFL-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0

**Note:** The previous count of 40 was recorded before all requirements were finalized. Actual count confirmed at 44 (INFRA-01..04 added 4 requirements that were present in the file but missing from the prior coverage count).

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after roadmap creation — all requirements mapped to phases*
