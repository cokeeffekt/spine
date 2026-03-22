---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `bun test` |
| **Full suite command** | `bun test --coverage` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test`
- **After every plan wave:** Run `bun test --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | INFRA-01 | integration | `docker compose up -d && curl localhost` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-02 | integration | `docker exec spine which ffprobe` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-03 | integration | `docker compose config \| grep volumes` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-04 | integration | `test -f data/spine.db` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SCAN-01 | unit | `bun test src/scanner` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SCAN-02 | unit | `bun test src/scanner` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SCAN-03 | unit | `bun test src/db` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SCAN-04 | unit | `bun test src/scanner` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SCAN-05 | unit | `bun test src/scanner` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/scanner.test.ts` — stubs for SCAN-01..05
- [ ] `tests/db.test.ts` — stubs for INFRA-04, SCAN-03
- [ ] `tests/fixtures/` — sample .m4b files or mocks for ffprobe output

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker compose starts stack | INFRA-01 | Requires Docker daemon | Run `docker compose up -d`, verify server responds at localhost |
| Volume mount works | INFRA-03 | Requires Docker daemon | Check audiobook dir is accessible inside container |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
