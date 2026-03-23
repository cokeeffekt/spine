# Requirements: Spine

**Defined:** 2026-03-23
**Milestone:** v1.1 — Admin Tools & Library Improvements
**Core Value:** A household can browse their audiobook library, listen with full player controls, and pick up exactly where they left off — on any device, even offline.

## v1.1 Requirements

### Admin

- [ ] **ADMIN-01**: Admin can view a list of all user accounts in the browser
- [ ] **ADMIN-02**: Admin can create a new user account from the admin UI
- [ ] **ADMIN-03**: Admin can delete a user account (with last-admin guard preventing lockout)
- [ ] **ADMIN-04**: Admin can reset another user's password from the admin UI

### Library Management

- [ ] **LIBM-01**: Admin can trigger a library rescan from the browser UI
- [ ] **LIBM-02**: Rescan shows live progress (files scanned / total) via SSE
- [ ] **LIBM-03**: Concurrent rescans are prevented (scan-in-progress guard)
- [ ] **LIBM-04**: Scanner supports MP3 folders — a folder of .mp3 files is treated as one audiobook
- [ ] **LIBM-05**: MP3 files within a folder are naturally sorted (track ordering)
- [ ] **LIBM-06**: MP3 metadata derived from ffprobe ID3 tags with folder/file name fallback
- [ ] **LIBM-07**: Multi-disc subfolders are flattened into a single book
- [ ] **LIBM-08**: Scanner enriches book metadata (description, cover, narrator, series) from Audnexus API when local data is incomplete
- [ ] **LIBM-09**: Enrichment is non-blocking — scan completes even if Audnexus is unreachable

### Progress

- [ ] **PROG-05**: User's playback progress is synced to the backend when online
- [ ] **PROG-06**: On book open, app pulls server progress and uses furthest position (no data loss)
- [ ] **PROG-07**: Progress sync works seamlessly with existing offline-first IndexedDB storage
- [ ] **PROG-08**: Library grid tiles show reading progress percentage on book covers

### Player

- [ ] **PLAY-09**: Player handles multi-file MP3 books — swaps audio source at track boundaries
- [ ] **PLAY-10**: Seeking across MP3 track boundaries works correctly

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
| ADMIN-01 | Phase 7 | Pending |
| ADMIN-02 | Phase 7 | Pending |
| ADMIN-03 | Phase 7 | Pending |
| ADMIN-04 | Phase 7 | Pending |
| LIBM-01 | Phase 8 | Pending |
| LIBM-02 | Phase 8 | Pending |
| LIBM-03 | Phase 8 | Pending |
| LIBM-04 | Phase 10 | Pending |
| LIBM-05 | Phase 10 | Pending |
| LIBM-06 | Phase 10 | Pending |
| LIBM-07 | Phase 10 | Pending |
| PROG-05 | Phase 9 | Pending |
| PROG-06 | Phase 9 | Pending |
| PROG-07 | Phase 9 | Pending |
| PROG-08 | Phase 9 | Pending |
| PLAY-09 | Phase 11 | Pending |
| PLAY-10 | Phase 11 | Pending |
| LIBM-08 | Phase 8 | Pending |
| LIBM-09 | Phase 8 | Pending |

**Coverage:**
- v1.1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
