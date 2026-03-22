---
phase: 3
slug: app-shell-and-library-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test (built-in) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `bun test` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | LIB-01 | integration | `bun test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIB-02 | integration | `bun test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIB-03 | integration | `bun test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PWA-01 | manual | N/A | N/A | ⬜ pending |
| TBD | TBD | TBD | PWA-02 | manual | N/A | N/A | ⬜ pending |
| TBD | TBD | TBD | PWA-03 | manual | N/A | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test framework confirmed (Bun test built-in)
- [ ] `tests/` directory exists with at least one passing test
- [ ] API integration test stubs for LIB-01, LIB-02, LIB-03

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PWA install prompt appears | PWA-01 | Browser-specific install UX cannot be automated | Open in Chrome, verify "Add to Home Screen" prompt appears |
| Standalone mode works | PWA-02 | Requires installed PWA context | Install via Chrome, open standalone — verify no browser chrome |
| App shell caches offline | PWA-03 | Requires service worker + cache inspection | Install, go offline, reload — verify app shell loads |
| Cover art displays correctly | LIB-02 | Visual rendering verification | Browse library, verify cover images render at 2:3 aspect ratio |
| Search filters live | LIB-03 | UI interaction verification | Type in search bar, verify grid updates without page reload |

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
