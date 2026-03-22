---
phase: 6
slug: offline-download
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun built-in test runner (`bun:test`) |
| **Config file** | none — `bun test` auto-discovers `*.test.ts` and `*.test.js` |
| **Quick run command** | `bun test tests/downloads.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/downloads.test.ts`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-00-01 | 00 | 0 | OFFL-01 | unit | `bun test tests/downloads.test.ts` | Wave 0 | ⬜ pending |
| 06-00-02 | 00 | 0 | OFFL-03 | unit | `bun test tests/downloads.test.ts` | Wave 0 | ⬜ pending |
| 06-01-01 | 01 | 1 | OFFL-02 | manual | manual: DevTools > Cache Storage | N/A | ⬜ pending |
| 06-01-02 | 01 | 1 | OFFL-04 | manual | manual: Network tab, verify 206 offline | N/A | ⬜ pending |
| 06-02-01 | 02 | 2 | OFFL-01 | unit | `bun test tests/downloads.test.ts` | Wave 0 | ⬜ pending |
| 06-02-02 | 02 | 2 | OFFL-03 | unit | `bun test tests/downloads.test.ts` | Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/downloads.test.ts` — stubs for OFFL-01 (download progress logic, formatBytes), OFFL-03 (downloadDB CRUD, reconcileDownloads)
- [ ] `downloadDB` and `formatBytes` exported from `public/player-utils.js` using existing `module.exports` guard pattern

*Existing test infrastructure (`bun test`) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Audio plays from Cache Storage without network | OFFL-02 | Requires browser + service worker + Cache Storage API | 1. Download a book. 2. Enable airplane mode. 3. Play the downloaded book. 4. Verify audio plays and seeking works. |
| RangeRequestsPlugin serves 206 from cache | OFFL-04 | Requires live service worker intercepting range requests | 1. Download a book. 2. Go offline. 3. Open DevTools Network tab. 4. Play audio, verify 206 responses served from SW. |
| Cover art loads offline for all books | OFFL-02 | Requires browser cache and offline state | 1. Load library once online. 2. Go offline. 3. Verify all cover art images still display. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
