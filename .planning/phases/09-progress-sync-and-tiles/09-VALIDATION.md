---
phase: 9
slug: progress-sync-and-tiles
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in, no install needed) |
| **Config file** | none — `bun test` auto-discovers `*.test.ts` files |
| **Quick run command** | `bun test src/routes/progress.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test src/routes/progress.test.ts`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | PROG-05 | unit | `bun test src/routes/progress.test.ts` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 1 | PROG-05 | unit | `bun test src/routes/progress.test.ts` | ❌ W0 | ⬜ pending |
| 09-01-03 | 01 | 1 | PROG-06 | unit | `bun test src/routes/progress.test.ts` | ❌ W0 | ⬜ pending |
| 09-01-04 | 01 | 1 | PROG-07 | unit | `bun test src/routes/progress.test.ts` | ❌ W0 | ⬜ pending |
| 09-02-01 | 02 | 2 | PROG-05 | manual | browser — verify PUT fires on 15s tick | N/A | ⬜ pending |
| 09-02-02 | 02 | 2 | PROG-06 | manual | browser — verify furthest-position-wins | N/A | ⬜ pending |
| 09-02-03 | 02 | 2 | PROG-07 | manual | browser — verify offline flush on reconnect | N/A | ⬜ pending |
| 09-03-01 | 03 | 2 | PROG-08 | manual | browser — verify progress bar on tiles | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/routes/progress.test.ts` — stubs for PROG-05, PROG-06, PROG-07 (server-side API tests)

*Test file follows the exact structure of `src/routes/books.test.ts` (tmpDbPath, _resetForTests, seeded users/sessions).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Progress bar renders on tiles with progress | PROG-08 | Browser DOM rendering, Alpine.js reactive binding | Load library, verify bar appears on books with progress, absent on unplayed books |
| Fire-and-forget push on 15s save tick | PROG-05 | Timer-based browser behavior | Open book, wait 15s, check Network tab for PUT request |
| Furthest-position-wins on book open | PROG-06 | Cross-device scenario, IndexedDB + API comparison | Set different positions on two devices, verify higher position used |
| Offline queue flush on reconnect | PROG-07 | Requires toggling offline mode in browser DevTools | Go offline, play, go online, verify PUT fires for queued books |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
