# Phase 9: Progress Sync and Tiles - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 09-progress-sync-and-tiles
**Areas discussed:** Sync timing & triggers, Conflict resolution UX, Progress badge on tiles, API shape & auth

---

## Sync timing & triggers

### When should progress sync to the server?

| Option | Description | Selected |
|--------|-------------|----------|
| Piggyback on auto-save | Every 15s auto-save writes to IndexedDB AND pushes to server (when online). Offline saves queue and flush on reconnect. | ✓ |
| On pause/stop only | Only sync when user explicitly pauses, closes book, or backgrounds the app. | |
| Debounced (30-60s) | Separate sync interval from the 15s IndexedDB save. | |

**User's choice:** Piggyback on auto-save
**Notes:** None

### How should offline sync work when the device comes back online?

| Option | Description | Selected |
|--------|-------------|----------|
| Flush on reconnect | Listen for 'online' event, push latest position for each changed book. Only most recent position per book. | ✓ |
| Sync on next app open | Don't watch for reconnect; sync on next navigation. | |
| You decide | Claude picks. | |

**User's choice:** Flush on reconnect
**Notes:** None

### Should sync failures be visible to the user?

| Option | Description | Selected |
|--------|-------------|----------|
| Silent retry | Failed syncs retry on next 15s tick or reconnect. No user-visible error. | ✓ |
| Subtle indicator | Small icon showing sync status (synced/pending/failed). | |
| You decide | Claude picks. | |

**User's choice:** Silent retry
**Notes:** None

### Should progress also sync when the user initially opens a book (pull from server)?

| Option | Description | Selected |
|--------|-------------|----------|
| On book open | Fetch server progress and compare with local on book open. Use furthest-position-wins. | ✓ |
| On app load | Fetch all book progress on app startup and merge into IndexedDB. | |
| Both | Bulk fetch on load for badges + per-book on open for freshest position. | |

**User's choice:** On book open
**Notes:** None

---

## Conflict resolution UX

### When server position is ahead of local, what should happen visually?

| Option | Description | Selected |
|--------|-------------|----------|
| Silent jump | Playback starts at furthest position without notification. | ✓ |
| Brief toast | Show "Resuming from another device" for 2-3 seconds. | |
| You decide | Claude picks. | |

**User's choice:** Silent jump
**Notes:** None

### Should re-listening overwrite the 'furthest position' on the server?

| Option | Description | Selected |
|--------|-------------|----------|
| Never overwrite furthest | Server keeps MAX position. Re-listening doesn't push lower position. | |
| Allow overwrite | Whatever user is currently listening becomes synced position, even if earlier. | |
| Trust the client | Server accepts whatever client sends. Client handles merge on pull. | ✓ |

**User's choice:** Trust the client
**Notes:** "im thinking trust the client, if the user want to reread a chapter or scrub back we need to honor that"

### Tile badge can go backwards if user re-listens. Acceptable?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, that's fine | Badge shows current position, not peak. Honest representation. | ✓ |
| Track peak separately | Store both current_position and max_position. Badge shows peak. | |

**User's choice:** Yes, that's fine
**Notes:** None

---

## Progress badge on tiles

### How should progress percentage appear on book cards?

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom progress bar | Thin horizontal bar along bottom of cover image, filled proportionally. YouTube-style. | ✓ |
| Corner badge | Small rounded pill in corner showing '60%' text. | |
| Circular ring | Small circular progress indicator (donut chart) in corner. | |
| You decide | Claude picks. | |

**User's choice:** Bottom progress bar
**Notes:** Selected after viewing ASCII preview

### What should a 'finished' book (100%) look like?

| Option | Description | Selected |
|--------|-------------|----------|
| Full bar stays | Progress bar fills completely (100%). Same visual language. | ✓ |
| Checkmark overlay | Replace bar with checkmark icon. | |
| Full bar + checkmark | Both bar and checkmark. | |

**User's choice:** Full bar stays
**Notes:** None

### What color for the progress bar?

| Option | Description | Selected |
|--------|-------------|----------|
| Accent color | Use existing --color-accent (#e94560). Matches app accent. | ✓ |
| White/light | Semi-transparent white bar. Neutral. | |
| You decide | Claude picks. | |

**User's choice:** Accent color
**Notes:** None

### Where does the progress data for tile badges come from?

| Option | Description | Selected |
|--------|-------------|----------|
| Bulk fetch from server | On app load, GET all book progress for user. Populate tiles with server percentages. | ✓ |
| Local IndexedDB only | Read progress from IndexedDB for each tile. | |
| Merge both | Local first for instant display, overlay server data when arrives. | |

**User's choice:** Bulk fetch from server
**Notes:** None

---

## API shape & auth

### How should the progress sync API be structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Two endpoints | PUT /api/progress/:bookId + GET /api/progress. Simple REST. | ✓ |
| Single batch endpoint | POST /api/progress/sync with multiple positions. Fewer requests. | |
| You decide | Claude picks. | |

**User's choice:** Two endpoints
**Notes:** None

### What should the server store for each book's progress?

| Option | Description | Selected |
|--------|-------------|----------|
| Position + percentage | Store timestamp, chapter index, and pre-computed percentage. Ready for tile badges. | ✓ |
| Position only | Store just timestamp and chapter index. Compute percentage on the fly. | |
| You decide | Claude picks. | |

**User's choice:** Position + percentage
**Notes:** None

### Should the server enforce furthest-position-wins, or trust the client?

| Option | Description | Selected |
|--------|-------------|----------|
| Server enforces | PUT only updates if new position > stored position. | |
| Trust the client | Server accepts whatever client sends. Client handles merge on pull. | ✓ |
| You decide | Claude picks. | |

**User's choice:** Trust the client
**Notes:** "if the user want to reread a chapter or scrub back we need to honor that"

---

## Claude's Discretion

- Database migration approach for progress table
- Exact progress bar CSS (height, opacity, z-index)
- GET /api/progress response format (array vs map)
- How _saveProgress() is extended for server push
- Error handling for PUT endpoint
- Whether to add database index on progress table

## Deferred Ideas

None — discussion stayed within phase scope
