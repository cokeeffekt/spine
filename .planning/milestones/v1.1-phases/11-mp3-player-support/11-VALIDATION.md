---
phase: 11
slug: mp3-player-support
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none — `bun test` auto-discovers `**/*.test.ts` and `tests/*.test.ts` |
| **Quick run command** | `bun test src/routes/audio.test.ts src/routes/books.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test src/routes/audio.test.ts src/routes/books.test.ts`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | PLAY-09 | unit | `bun test src/routes/audio.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | PLAY-09 | unit | `bun test src/routes/books.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 2 | PLAY-09, PLAY-10 | manual | n/a | n/a | ⬜ pending |
| 11-02-02 | 02 | 2 | PLAY-09 | manual | n/a | n/a | ⬜ pending |
| 11-02-03 | 02 | 2 | PLAY-10 | unit | `bun test tests/player.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/routes/audio.test.ts` — add describe block for `GET /api/books/:id/audio/:chapterIdx` (MP3 per-track route tests). Seed chapters with `file_path` pointing to a temp `.mp3` file.
- [ ] `src/routes/books.test.ts` — add tests verifying `format` field in `/api/books/:id` response for both m4b and MP3 books (seed chapters with null vs. non-null `file_path`).
- [ ] `tests/player.test.ts` — add test for `trackUrl()` helper if extracted to `player-utils.js`.

*Existing infrastructure covers framework install — no new test framework needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MP3 book plays continuously across tracks without user interaction | PLAY-09 | Requires real browser audio playback + `ended` event firing | Load MP3 book, play from near end of track N, verify track N+1 starts automatically |
| `jumpToChapter` swaps to correct MP3 track and plays | PLAY-10 | Requires browser audio element src-swap + canplay event | Open MP3 book, click chapter 3 in chapter list, verify audio plays from track 3 |
| Offline MP3 download caches all tracks and plays offline | PLAY-09 | Requires service worker + Cache Storage + offline toggle | Download MP3 book, toggle offline in DevTools, verify all tracks play |
| Resume from saved position in MP3 track | PLAY-09, PLAY-10 | Requires browser audio state + IndexedDB progress | Play MP3 book to middle of track 3, close tab, reopen, verify resumes at correct position in track 3 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
