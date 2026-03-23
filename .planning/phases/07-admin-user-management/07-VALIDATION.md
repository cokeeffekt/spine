---
phase: 7
slug: admin-user-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none — existing test infrastructure from Phase 2 |
| **Quick run command** | `bun test src/routes/users.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test src/routes/users.test.ts`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | ADMIN-01 | unit | `bun test src/routes/users.test.ts` | ✅ | ⬜ pending |
| 07-01-02 | 01 | 1 | ADMIN-02 | unit | `bun test src/routes/users.test.ts` | ✅ | ⬜ pending |
| 07-01-03 | 01 | 1 | ADMIN-03 | unit | `bun test src/routes/users.test.ts` | ✅ | ⬜ pending |
| 07-01-04 | 01 | 1 | ADMIN-04 | unit | `bun test src/routes/users.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin page visible only to admins | ADMIN-04 | UI visibility check | Login as non-admin, verify no "Users" link in nav. Login as admin, verify link appears. |
| Inline delete confirm UX | ADMIN-03 | UI interaction timing | Click delete, verify button changes to "Confirm delete?" with 3s timeout |
| Inline password reset expand | ADMIN-02 | UI interaction flow | Click reset icon, verify input appears inline with Save/Cancel |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
