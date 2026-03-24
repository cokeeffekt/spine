# Requirements: Spine

**Defined:** 2026-03-23
**Milestone:** v1.1 — Admin Tools & Library Improvements
**Core Value:** A household can browse their audiobook library, listen with full player controls, and pick up exactly where they left off — on any device, even offline.

## v1.1 Requirements

### Admin

- [x] **ADMIN-01**: Admin can view a list of all user accounts in the browser
- [x] **ADMIN-02**: Admin can create a new user account from the admin UI
- [x] **ADMIN-03**: Admin can delete a user account (with last-admin guard preventing lockout)
- [x] **ADMIN-04**: Admin can reset another user's password from the admin UI

### Library Management

- [x] **LIBM-01**: Admin can trigger a library rescan from the browser UI
- [x] **LIBM-02**: Rescan shows live progress (files scanned / total) via SSE
- [x] **LIBM-03**: Concurrent rescans are prevented (scan-in-progress guard)
- [x] **LIBM-04**: Scanner supports MP3 folders — a folder of .mp3 files is treated as one audiobook
- [x] **LIBM-05**: MP3 files within a folder are naturally sorted (track ordering)
- [x] **LIBM-06**: MP3 metadata derived from ffprobe ID3 tags with folder/file name fallback
- [x] **LIBM-07**: Multi-disc subfolders are flattened into a single book
- [x] **LIBM-08**: Scanner enriches book metadata (description, cover, narrator, series) from Audnexus API when local data is incomplete
- [x] **LIBM-09**: Enrichment is non-blocking — scan completes even if Audnexus is unreachable

### Progress

- [x] **PROG-05**: User's playback progress is synced to the backend when online
- [x] **PROG-06**: On book open, app pulls server progress and uses furthest position (no data loss)
- [x] **PROG-07**: Progress sync works seamlessly with existing offline-first IndexedDB storage
- [x] **PROG-08**: Library grid tiles show reading progress percentage on book covers

### Player

- [x] **PLAY-09**: Player handles multi-file MP3 books — swaps audio source at track boundaries
- [x] **PLAY-10**: Seeking across MP3 track boundaries works correctly

## Future Requirements

- **SYNC-03**: When local and server positions conflict, user can choose which to keep (deferred — furthest-position-wins handles this automatically for v1.1)
- **LIBE-02**: Search by genre, series, or narrator
- **LIBE-03**: Chapter scrubber with visual boundary markers on progress bar

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-format beyond MP3 | FLAC, OGG, etc. not in user's collection |
| Real-time WebSocket sync | Furthest-position-wins on push/pull is sufficient |
| Per-chapter downloads for MP3 | Whole-folder download; individual track downloads add complexity |
| Transcoding MP3 to m4b | Serve MP3 files directly; no server-side conversion |
| Self-registration | Admin creates accounts; prevents unauthorized access |
| User conflict resolution UI | Furthest-position-wins is automatic; no manual merge needed |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ADMIN-01 | Phase 7 | Complete |
| ADMIN-02 | Phase 7 | Complete |
| ADMIN-03 | Phase 7 | Complete |
| ADMIN-04 | Phase 7 | Complete |
| LIBM-01 | Phase 8 | Complete |
| LIBM-02 | Phase 8 | Complete |
| LIBM-03 | Phase 8 | Complete |
| LIBM-04 | Phase 10 | Complete |
| LIBM-05 | Phase 10 | Complete |
| LIBM-06 | Phase 10 | Complete |
| LIBM-07 | Phase 10 | Complete |
| PROG-05 | Phase 9 | Complete |
| PROG-06 | Phase 9 | Complete |
| PROG-07 | Phase 9 | Complete |
| PROG-08 | Phase 9 | Complete |
| PLAY-09 | Phase 11 | Complete |
| PLAY-10 | Phase 11 | Complete |
| LIBM-08 | Phase 8 | Complete |
| LIBM-09 | Phase 8 | Complete |

**Coverage:**
- v1.1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
