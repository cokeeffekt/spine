# Phase 8: Library Rescan UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 08-library-rescan-ui
**Areas discussed:** Scan trigger & progress UX, Audnexus enrichment, Admin page integration, Post-scan behavior

---

## Admin Page Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Same admin page | Add a 'Library' section below the Users table on the existing admin page | |
| Tabbed admin page | Add tabs to the admin page: 'Users' \| 'Library'. Each tab shows its own content | ✓ |
| Separate admin view | New nav link 'Library' next to 'Users'. Completely separate page | |

**User's choice:** Tabbed admin page
**Notes:** Scales better for future admin tools

---

## Scan Progress UX

| Option | Description | Selected |
|--------|-------------|----------|
| Progress bar with file count | Horizontal progress bar showing 'Scanning... 42/128 files'. Updates via SSE | ✓ |
| Spinner with status text | Simple spinner with 'Scanning library...' text. No file count | |
| Log-style output | Scrolling text area showing each file as scanned | |

**User's choice:** Progress bar with file count
**Notes:** None

---

## Scan-in-Progress Guard

| Option | Description | Selected |
|--------|-------------|----------|
| Disabled button + live progress | Button disabled/greyed out, progress bar shows current scan | ✓ |
| Error toast on second click | Button stays enabled, error message if clicked during scan | |
| Button hidden during scan | Replace button with progress display while running | |

**User's choice:** Disabled button + live progress
**Notes:** None

---

## Audnexus Enrichment Timing

| Option | Description | Selected |
|--------|-------------|----------|
| During scan, per book | After each probe, check if incomplete and query Audnexus inline | ✓ |
| After scan completes | Two-phase: scan all files, then enrichment pass | |
| On-demand only | Separate 'Enrich metadata' button for manual trigger | |

**User's choice:** During scan, per book
**Notes:** None

---

## Audnexus Failure Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Silent skip + summary count | Skip silently, show count in post-scan summary | ✓ |
| Per-book warning in progress | Brief warning in progress area for each failure | |
| Detailed log | Scrollable log of all enrichment attempts | |

**User's choice:** Silent skip + summary count
**Notes:** None

---

## Post-Scan Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Summary + auto-refresh grid | Show summary, auto-refresh library grid via SSE done event | ✓ |
| Summary only, manual refresh | Show summary, admin must manually reload library | |
| Toast notification + summary | Toast if admin navigated away, summary on return | |

**User's choice:** Summary + auto-refresh grid
**Notes:** None

---

## Claude's Discretion

- SSE event format and field names
- Sub-status display during enrichment
- Tab styling approach
- Whether periodic watcher emits progress events

## Deferred Ideas

None
