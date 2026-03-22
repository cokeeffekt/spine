# Phase 1: Foundation - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Docker container, SQLite schema, and .m4b library scanner with ffprobe metadata extraction. The project infrastructure is in place and the library scanner correctly extracts metadata from .m4b files. No API endpoints, no auth, no frontend — just the scannable, queryable foundation.

</domain>

<decisions>
## Implementation Decisions

### Scanner trigger and lifecycle
- **D-01:** Scanner runs on startup (initial full scan) plus periodic re-scan on a sane default interval (e.g. every 5 minutes or file watcher — Claude picks the best approach)
- **D-02:** Re-scans are incremental — detect new, changed, and removed files without re-processing unchanged books
- **D-03:** When an .m4b file disappears, keep all metadata in SQLite and flag the book as "missing content" — do not delete the row
- **D-04:** When a previously-missing .m4b file reappears at the same path, automatically unflag it — no manual action required

### Library folder structure
- **D-05:** Scanner recursively walks all subdirectories under the configured library root
- **D-06:** Expected structure: library root contains either .m4b files directly or folders (possibly nested) that contain .m4b files — no fixed convention like `Author/Title.m4b` required
- **D-07:** Folder structure can inform fallback metadata (folder name as title hint) but embedded metadata always wins

### Cover art extraction and storage
- **D-08:** Extracted cover art is written to the same directory as the .m4b file, named `cover.jpg`
- **D-09:** If a user-provided `cover.jpg` already exists in the folder, the scanner overwrites it with the embedded art — embedded art takes priority
- **D-10:** If the .m4b has no embedded cover art, an existing `cover.jpg` in the folder is used as fallback (per SCAN-05)
- **D-11:** Cover art path is stored in SQLite so the serving layer knows where to find it without re-scanning

### SQLite schema scope
- **D-12:** Store as much metadata as ffprobe provides — title, author, narrator, series name, series position, description/blurb, genre, publisher, year, language, duration, file size, codec info
- **D-13:** Schema should be generous with columns now; future phases may backfill from external APIs (Audible, OpenLibrary, etc.)
- **D-14:** Chapter table stores: book reference, chapter index, title, start time, end time, duration

### Claude's Discretion
- File watcher vs polling interval (pick what's most reliable in Docker)
- Exact SQLite table structure and indexes
- How to detect file changes for incremental scan (mtime, hash, size)
- ffprobe command flags and output parsing
- Error handling for corrupt/unreadable .m4b files
- Temp file handling during cover extraction
- Log output format and verbosity

</decisions>

<specifics>
## Specific Ideas

- Keep metadata rows even when files disappear — the database is the catalog, the filesystem is just the source
- Schema should be future-proofed for external API backfill (narrator, series, etc.) even if ffprobe doesn't always populate those fields
- Overwrite `cover.jpg` with embedded art; only use existing `cover.jpg` as fallback when no embedded art exists

</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements are fully captured in decisions above and in:

### Requirements
- `.planning/REQUIREMENTS.md` — INFRA-01..04 (Docker infrastructure), SCAN-01..05 (scanner behavior, metadata, fallback)

### Stack guidance
- `CLAUDE.md` §Technology Stack — Bun/Node runtime choice, better-sqlite3, ffprobe spawn pattern, Docker setup
- `CLAUDE.md` §What NOT to Use — fluent-ffmpeg is archived, use direct spawn

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — this phase establishes the foundational patterns

### Integration Points
- SQLite database created here is consumed by Phase 2 (API endpoints) and all subsequent phases
- Cover art files on disk are served by Phase 2's API layer
- Scanner's book/chapter data model shapes the entire downstream API contract

</code_context>

<deferred>
## Deferred Ideas

- External API metadata enrichment (Audible, OpenLibrary) — future enhancement, schema supports it now
- Admin-triggered rescan from UI — v2 requirement (LIBE-01)
- Search by genre/series/narrator — v2 requirement (LIBE-02), but schema captures these fields now

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-22*
