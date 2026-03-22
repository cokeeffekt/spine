---
phase: 4
slug: player-and-progress
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test (built-in) |
| **Config file** | none — `bun test` auto-discovers `*.test.ts` files |
| **Quick run command** | `bun test --test-name-pattern player` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test`
- **After every plan wave:** Run `bun test` + manual browser smoke (play/pause, chapter jump, speed change, keyboard shortcuts)
- **Before `/gsd:verify-work`:** Full suite must be green + manual smoke checklist passed
- **Max feedback latency:** 2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | PLAY-01 | manual smoke | n/a — browser-only | N/A | ⬜ pending |
| 04-01-02 | 01 | 1 | PLAY-02 | unit (skip logic) | `bun test --test-name-pattern skip` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | PLAY-03 | manual smoke | n/a — browser-only | N/A | ⬜ pending |
| 04-01-04 | 01 | 1 | PLAY-04 | manual smoke | n/a — browser-only | N/A | ⬜ pending |
| 04-01-05 | 01 | 1 | PLAY-05 | unit (getCurrentChapterIdx) | `bun test --test-name-pattern chapter` | ❌ W0 | ⬜ pending |
| 04-01-06 | 01 | 1 | PLAY-06 | unit (progressDB key) | `bun test --test-name-pattern progressDB` | ❌ W0 | ⬜ pending |
| 04-01-07 | 01 | 1 | PLAY-07 | unit (timer logic) | `bun test --test-name-pattern sleep` | ❌ W0 | ⬜ pending |
| 04-01-08 | 01 | 1 | PLAY-08 | manual smoke | n/a — requires DOM | N/A | ⬜ pending |
| 04-02-01 | 02 | 1 | PROG-01 | unit (save interval) | `bun test --test-name-pattern autosave` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 1 | PROG-02 | manual smoke | n/a — browser-only | N/A | ⬜ pending |
| 04-02-03 | 02 | 1 | PROG-03 | manual smoke | n/a — browser-only | N/A | ⬜ pending |
| 04-02-04 | 02 | 1 | PROG-04 | unit (key format) | `bun test --test-name-pattern progressDB` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/player.test.ts` — stubs for getCurrentChapterIdx, skip clamp, progressDB key format, sleep timer arithmetic
- No framework install needed — `bun test` is built-in

*Existing infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Play/pause toggle | PLAY-01 | Requires browser HTMLMediaElement | Click play → audio plays; click pause → audio stops |
| Speed adjustment UI | PLAY-03 | Requires browser playbackRate + DOM | Select 1.4x → verify audio pitch/speed changes |
| Chapter jump via click | PLAY-04 | Requires browser audio seeking + DOM | Click chapter 3 → audio seeks to chapter 3 start time |
| Keyboard shortcuts | PLAY-08 | Requires browser DOM event handling | Press spacebar → toggles play/pause; arrow keys → seek |
| IndexedDB local-only | PROG-02 | Requires browser IndexedDB | Open DevTools → Application → IndexedDB → verify store exists |
| Resume from saved | PROG-03 | Requires browser + page reload | Close book → reopen → verify resumes at saved position |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 2s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
