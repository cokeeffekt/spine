# Roadmap: Spine

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6, shipped 2026-03-23. [Archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Admin Tools & Library Improvements** — Phases 7-11 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-6) — SHIPPED 2026-03-23</summary>

6 phases, 15 plans, 44 requirements. Full details in [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md).

</details>

### 🚧 v1.1 Admin Tools & Library Improvements (In Progress)

**Milestone Goal:** Give the admin control over users and the library, show reading progress on grid tiles, sync progress across devices, and support MP3 audiobook folders.

- [x] **Phase 7: Admin User Management** - Admin can manage all user accounts from the browser (completed 2026-03-23)
- [x] **Phase 8: Library Rescan UI** - Admin can trigger and monitor a library rescan from the browser (completed 2026-03-24)
- [x] **Phase 9: Progress Sync and Tiles** - Progress syncs to the server and shows as percentage on grid tiles (completed 2026-03-24)
- [ ] **Phase 10: MP3 Folder Scanner** - MP3 folder collections are scanned and cataloged as audiobooks
- [ ] **Phase 11: MP3 Player Support** - MP3 books play correctly with track-boundary handling

## Phase Details

### Phase 7: Admin User Management
**Goal**: Admin can view, create, delete, and reset passwords for all user accounts without leaving the browser
**Depends on**: Phase 6 (v1.0 complete)
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Success Criteria** (what must be TRUE):
  1. Admin sees a list of all user accounts on an admin page
  2. Admin can create a new user account (username + password) from the admin page
  3. Admin can delete a user account; deleting the last admin account is blocked with an error
  4. Admin can reset another user's password from the admin page
  5. Non-admin users cannot access the admin page or any admin API endpoint
**Plans**: 2 plans
Plans:
- [x] 07-01-PLAN.md — Backend: schema migration, GET /api/users, last-admin guard, login timestamp
- [x] 07-02-PLAN.md — Frontend: admin view HTML, CSS, and user verification

### Phase 8: Library Rescan UI
**Goal**: Admin can trigger a library rescan from the browser with live progress and Audnexus metadata enrichment
**Depends on**: Phase 7
**Requirements**: LIBM-01, LIBM-02, LIBM-03, LIBM-08, LIBM-09
**Success Criteria** (what must be TRUE):
  1. Admin can click a button in the browser to start a library rescan
  2. A live progress indicator (files scanned / total) updates in the browser during the scan
  3. Triggering a second rescan while one is running returns an error; only one scan runs at a time
  4. After rescan completes, the library grid reflects any new or changed books
  5. Books with incomplete metadata are enriched from Audnexus (description, cover, narrator, series)
  6. Scan completes normally even if Audnexus is unreachable
**Plans**: 2 plans
Plans:
- [x] 08-01-PLAN.md — Backend: scanner progress callback, scan lock, SSE routes, Audnexus enrichment
- [x] 08-02-PLAN.md — Frontend: admin tab UI, Library tab with SSE progress bar, visual verification

### Phase 9: Progress Sync and Tiles
**Goal**: Playback progress syncs to the server so users resume at the right position on any device, and each grid tile shows a reading percentage
**Depends on**: Phase 7
**Requirements**: PROG-05, PROG-06, PROG-07, PROG-08
**Success Criteria** (what must be TRUE):
  1. When a user listens on device A and opens the same book on device B, they resume at the furthest position (not the earliest)
  2. Progress continues to work offline via IndexedDB; server sync does not break offline playback
  3. Each book tile in the library grid shows a percentage badge reflecting the user's current position
  4. A user who has never opened a book sees no percentage indicator on that tile
**Plans**: 2 plans
Plans:
- [x] 09-01-PLAN.md — Backend: progress table schema, PUT/GET progress API endpoints, unit tests
- [x] 09-02-PLAN.md — Frontend: server push, offline flush, furthest-position-wins, tile progress bars

### Phase 10: MP3 Folder Scanner
**Goal**: A folder of MP3 files is recognized as one audiobook, scanned with correct metadata and track order, and available in the library grid
**Depends on**: Phase 8
**Requirements**: LIBM-04, LIBM-05, LIBM-06, LIBM-07
**Success Criteria** (what must be TRUE):
  1. A folder of .mp3 files appears as a single book in the library after a rescan
  2. Tracks within the book play in correct order (track 1, 2, 3 — not lexicographic 1, 10, 2)
  3. Book title, author, and cover art are populated from ID3 tags when available, falling back to folder/file names
  4. A multi-disc folder layout (Disc 1/, Disc 2/ subfolders) is flattened into a single book in correct disc order
**Plans**: 2 plans
Plans:
- [x] 10-01-PLAN.md — Foundation: mp3-sort utilities (TDD), schema migration, type extensions
- [ ] 10-02-PLAN.md — Scanner: walkLibrary refactor, scanFolder, fallback metadata, integration tests

### Phase 11: MP3 Player Support
**Goal**: MP3 books play from start to finish with seamless track transitions and correct seeking across track boundaries
**Depends on**: Phase 10
**Requirements**: PLAY-09, PLAY-10
**Success Criteria** (what must be TRUE):
  1. An MP3 book plays continuously from the last track of one file through the first second of the next without requiring user interaction
  2. Seeking to a position in the middle of a different track loads and plays from the correct point in that track
  3. Chapter markers in the player reflect MP3 track boundaries
**Plans**: TBD

## Progress

**Execution Order:** 7 → 8 → 9 → 10 → 11

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-03-23 |
| 2. Auth and API | v1.0 | 2/2 | Complete | 2026-03-23 |
| 3. App Shell and Library UI | v1.0 | 2/2 | Complete | 2026-03-23 |
| 4. Player and Progress | v1.0 | 3/3 | Complete | 2026-03-23 |
| 5. Lock-Screen Controls | v1.0 | 2/2 | Complete | 2026-03-23 |
| 6. Offline Download | v1.0 | 3/3 | Complete | 2026-03-23 |
| 7. Admin User Management | v1.1 | 2/2 | Complete   | 2026-03-23 |
| 8. Library Rescan UI | v1.1 | 2/2 | Complete   | 2026-03-24 |
| 9. Progress Sync and Tiles | v1.1 | 2/2 | Complete   | 2026-03-24 |
| 10. MP3 Folder Scanner | v1.1 | 1/2 | In Progress|  |
| 11. MP3 Player Support | v1.1 | 0/? | Not started | - |
