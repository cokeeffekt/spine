---
phase: 2
slug: auth-and-api
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test (built-in, `bun:test`) |
| **Config file** | none — `bun test` discovers `*.test.ts` files by convention |
| **Quick run command** | `bun test src/` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test src/`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | AUTH-04, AUTH-06 | unit | `bun test src/db/bootstrap.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | AUTH-02, AUTH-03, AUTH-04, AUTH-05 | unit | `bun test src/routes/auth.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | API-04 | unit | `bun test src/middleware/auth.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | AUTH-01 | unit | `bun test src/routes/users.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | API-01, API-02 | unit | `bun test src/routes/books.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | API-03 | unit | `bun test src/routes/audio.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/middleware/auth.test.ts` — covers AUTH-05, API-04
- [ ] `src/routes/auth.test.ts` — covers AUTH-02, AUTH-03, AUTH-04
- [ ] `src/routes/books.test.ts` — covers API-01, API-02
- [ ] `src/routes/audio.test.ts` — covers API-03
- [ ] `src/routes/users.test.ts` — covers AUTH-01
- [ ] `src/db/bootstrap.test.ts` — covers AUTH-06

*Test helper: `makeTestApp()` returns Hono app with auth middleware + routes, backed by in-memory bun:sqlite DB pre-seeded with a test user.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cookie persists across browser refresh | AUTH-05 | Browser cookie persistence cannot be tested in unit tests | Open browser, log in, refresh page, verify no re-login required |
| Audio plays in browser with seek | API-03 | Full browser audio element interaction | Open book, click play, seek to middle, verify playback continues |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
