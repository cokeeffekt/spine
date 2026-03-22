---
phase: 5
slug: lock-screen-controls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none — `bun test` auto-discovers `tests/**/*.test.ts` |
| **Quick run command** | `bun test tests/lock-screen.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lock-screen.test.ts`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 0 | LOCK-01, LOCK-02, LOCK-03 | unit stubs | `bun test tests/lock-screen.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | LOCK-01 | unit | `bun test tests/lock-screen.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | LOCK-02 | unit | `bun test tests/lock-screen.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | LOCK-03 | unit | `bun test tests/lock-screen.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lock-screen.test.ts` — stubs for LOCK-01, LOCK-02, LOCK-03 calculation logic
- [ ] New pure functions in `public/player-utils.js`: `buildMediaMetadata(book, chapterIdx)`, `chapterPositionState(chapter, currentTime, playbackRate)`, `seektoAbsolute(chapter, seekTime)` — extracted for testability

*Existing `bun:test` infrastructure covers framework needs — no new install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lock screen shows title, author, cover art | LOCK-01 | Requires physical Android device — desktop DevTools cannot replicate lock screen | Play audiobook on Android, lock screen, verify metadata visible |
| Lock screen play/pause/skip buttons work | LOCK-02 | Requires physical Android device | Lock screen during playback, tap play/pause/skip, verify audio responds |
| Lock screen scrubber reflects position | LOCK-03 | Requires physical Android device | Lock screen during playback, drag scrubber, verify position updates in player |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
