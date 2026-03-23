---
phase: 8
slug: library-rescan-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none — `bun test` discovers `*.test.ts` automatically |
| **Quick run command** | `bun test src/routes/scan.test.ts src/scanner/enrichment.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test src/routes/scan.test.ts src/scanner/enrichment.test.ts`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | LIBM-01 | unit | `bun test src/routes/scan.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | LIBM-02 | integration | `bun test src/routes/scan.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 1 | LIBM-03 | unit | `bun test src/routes/scan.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 1 | LIBM-08 | unit | `bun test src/scanner/enrichment.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 1 | LIBM-09 | unit | `bun test src/scanner/enrichment.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/routes/scan.test.ts` — stubs for LIBM-01, LIBM-02, LIBM-03
- [ ] `src/scanner/enrichment.test.ts` — stubs for LIBM-08, LIBM-09

*Existing test infrastructure (bun:test) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE progress bar updates live in browser | LIBM-02 | Visual rendering + real-time streaming | Open admin Library tab, trigger rescan, verify progress bar animates with file count |
| Library grid auto-refreshes after scan | LIBM-02 | Cross-component Alpine store interaction | Add new .m4b to library dir, trigger rescan, verify book appears in grid without page reload |
| Tab UI preserves Users form state | N/A | DOM state preservation | Switch between Users/Library tabs, verify unsaved form data persists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
