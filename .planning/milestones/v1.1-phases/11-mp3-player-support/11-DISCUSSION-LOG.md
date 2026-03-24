# Phase 11: MP3 Player Support - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 11-mp3-player-support
**Areas discussed:** Track transition experience, Audio endpoint design, Seek bar & cross-track seeking, Offline download for MP3 books

---

## Track Transition Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Sequential load (Recommended) | Simple src swap on 'ended' event. Brief silence (~200-500ms) between tracks. | ✓ |
| Preload next track | Dual-element approach: preload upcoming track while current plays. Near-gapless. | |
| You decide | Claude picks based on existing architecture. | |

**User's choice:** Sequential load
**Notes:** None — straightforward pick.

| Option | Description | Selected |
|--------|-------------|----------|
| No indicator | Just swap and play. Brief silence speaks for itself. | ✓ |
| Brief loading state | Subtle spinner or 'Loading...' during gap. | |
| You decide | Claude picks based on existing UI. | |

**User's choice:** No indicator
**Notes:** None.

---

## Audio Endpoint Design

| Option | Description | Selected |
|--------|-------------|----------|
| New track endpoint (Recommended) | GET /api/books/:id/audio/:chapterIdx. Existing endpoint stays for m4b. | ✓ |
| Modify existing endpoint | Add ?chapter=N query param to existing route. | |
| You decide | Claude picks best fit. | |

**User's choice:** New track endpoint
**Notes:** Clean separation, no breaking changes.

| Option | Description | Selected |
|--------|-------------|----------|
| Add a format flag (Recommended) | Add 'format' field to book detail response ('m4b' or 'mp3'). | ✓ |
| Expose file_path on chapters | Include file_path in chapters JSON. Leaks server paths. | |
| You decide | Claude picks cleanest API contract. | |

**User's choice:** Format flag on book detail response
**Notes:** Keeps server paths private.

---

## Seek Bar & Cross-Track Seeking

| Option | Description | Selected |
|--------|-------------|----------|
| Keep chapter-scoped seek bar (Recommended) | Same as m4b. Navigate tracks via chapter list/skip buttons. | ✓ |
| Whole-book seek bar | Spans entire book duration. Dragging triggers track swaps. | |
| Both: chapter-scoped + global progress | Chapter seek bar + thin whole-book indicator. | |

**User's choice:** Keep chapter-scoped seek bar
**Notes:** Consistent with existing UX.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, same behavior (Recommended) | jumpToChapter swaps src to new track URL and plays from 0. | ✓ |
| You decide | Claude handles details. | |

**User's choice:** Same behavior as m4b chapter jump
**Notes:** Brief load delay acceptable per transition decision.

---

## Offline Download for MP3 Books

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, extend download (Recommended) | Cache all track URLs when downloading. Feature parity with m4b. | ✓ |
| Defer to separate phase | Disable download for MP3 books. Simpler but visible gap. | |
| You decide | Claude evaluates effort vs value. | |

**User's choice:** Extend download in this phase
**Notes:** Feature parity is important.

| Option | Description | Selected |
|--------|-------------|----------|
| Overall progress only (Recommended) | One bar showing tracks downloaded / total. | ✓ |
| You decide | Claude picks based on existing download UI. | |

**User's choice:** Overall progress only
**Notes:** Consistent with m4b download UX.

---

## Claude's Discretion

- MP3 vs m4b detection strategy in player store
- Track URL helper function design
- Edge case handling (last track, corrupt files)
- Progress save format compatibility
- Ended event handler format branching

## Deferred Ideas

None — discussion stayed within phase scope
