---
phase: 10
slug: mp3-folder-scanner
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test runner (built-in) |
| **Config file** | None — `bun test` auto-discovers `*.test.ts` |
| **Quick run command** | `bun test src/scanner/` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test src/scanner/`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | LIBM-04 | unit | `bun test src/db/schema.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | LIBM-04 | unit | `bun test src/scanner/index.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 1 | LIBM-05 | unit | `bun test src/scanner/mp3-sort.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 1 | LIBM-05 | unit | `bun test src/scanner/mp3-sort.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-03 | 02 | 1 | LIBM-05 | unit | `bun test src/scanner/mp3-sort.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 2 | LIBM-06 | unit | `bun test src/scanner/index.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-02 | 03 | 2 | LIBM-06 | unit | `bun test src/scanner/index.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-03 | 03 | 2 | LIBM-06 | unit | `bun test src/scanner/index.test.ts` | ❌ W0 | ⬜ pending |
| 10-04-01 | 04 | 2 | LIBM-07 | unit | `bun test src/scanner/index.test.ts` | ❌ W0 | ⬜ pending |
| 10-04-02 | 04 | 2 | LIBM-07 | unit | `bun test src/scanner/mp3-sort.test.ts` | ❌ W0 | ⬜ pending |
| 10-04-03 | 04 | 2 | LIBM-07 | unit | `bun test src/scanner/index.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/scanner/mp3-sort.test.ts` — stubs for LIBM-05 natural sort, LIBM-07 disc detection
- [ ] New test cases in `src/scanner/index.test.ts` — stubs for LIBM-04 folder detection, LIBM-06 metadata, LIBM-07 multi-disc integration
- [ ] New test cases in `src/db/schema.test.ts` — chapters.file_path migration idempotency

*Existing infrastructure covers test framework — no new install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MP3 book appears in library grid | LIBM-04 | End-to-end UI verification | Place MP3 folder in library, trigger rescan, check grid |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
