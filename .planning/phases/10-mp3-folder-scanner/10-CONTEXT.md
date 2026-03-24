# Phase 10: MP3 Folder Scanner - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the library scanner to recognize folders of .mp3 files as single audiobooks, probe each track for metadata and duration, store tracks as chapters in the existing chapters table, and make MP3 books appear in the library grid alongside .m4b books. Correct track ordering (natural sort), ID3 metadata extraction with folder-path fallback, and multi-disc folder flattening are all in scope. Playback of MP3 books (source-swapping at track boundaries, cross-track seeking) belongs to Phase 11.

</domain>

<decisions>
## Implementation Decisions

### Folder Detection
- **D-01:** Any folder containing at least one .mp3 file is treated as an audiobook candidate. The scanner walks the library root recursively (existing behavior) and identifies MP3 book folders.
- **D-02:** A single standalone .mp3 file (not inside a subfolder with other .mp3 files) is NOT treated as a book. Only folders with .mp3 files become books.
- **D-03:** If a folder contains both .m4b and .mp3 files, the .m4b wins — the .mp3 files in that folder are ignored. Prevents duplicate books.
- **D-04:** Only "leaf" folders become MP3 books — a folder with .mp3 files is a book only if it has no child folders that also contain .mp3 files. Exception: disc subfolders (see D-12) merge into the parent.
- **D-05:** The folder path hierarchy serves as metadata fallback: grandparent folder = author, parent folder = title (e.g., `/library/Stephen King/The Shining/track1.mp3` → author="Stephen King", title="The Shining"). ID3 tags always win over path-derived metadata.

### Book Identity & Schema
- **D-06:** MP3 books use the folder path as `file_path` in the existing `books` table (e.g., `/library/Author/Title/`). This reuses the existing `file_path UNIQUE` column — one folder = one book, one .m4b file = one book.
- **D-07:** Individual MP3 tracks are stored in the existing `chapters` table. Each track becomes a chapter entry. A new nullable `file_path` column is added to the `chapters` table — NULL for m4b chapters (audio is in the book's file_path), populated with the .mp3 file path for MP3 tracks. This lets Phase 11's player know when to swap audio source.
- **D-08:** `duration_sec` for an MP3 book is the sum of all track durations. Each track is probed individually with ffprobe.
- **D-09:** For incremental scan (skip unchanged books), MP3 folder books use the folder's mtime plus the sum of all .mp3 file sizes. If either changes, the entire folder is re-probed. Stored in existing `file_mtime` and `file_size` columns.
- **D-10:** ASIN is derived from ID3 tags if available (check comment/custom tags). If found, stored for Audnexus enrichment. If not, enrichment skips the book (existing behavior).

### Track Ordering
- **D-11:** Primary sort key is ID3 track number tag (TRCK). If missing or duplicate, fall back to natural sort of filenames (01-chapter.mp3 < 02-chapter.mp3 < 10-chapter.mp3). Track number gaps are ignored. Duplicate track numbers are broken by natural filename sort. No warnings or errors on edge cases.

### Multi-Disc Handling
- **D-12:** Disc subfolders are detected by pattern matching (case-insensitive): Disc, CD, Part, Disk + a number (e.g., "Disc 1", "Disc1", "CD 2", "CD2", "Part 1", "Disk 3"). When detected, their .mp3 files merge into the parent folder as a single book.
- **D-13:** Disc ordering uses the number extracted from the folder name (Disc 1 = 1, CD 2 = 2). Within each disc, tracks are sorted using D-11 rules (ID3 track number, then filename natural sort).
- **D-14:** If a parent folder has both loose .mp3 files AND disc subfolders, the loose files are ignored. Only files from disc subfolders are included.

### Claude's Discretion
- Exact regex for disc subfolder pattern matching
- How to handle deeply nested disc structures (Disc 1/Part A/ etc.) — flatten or reject
- Whether to probe all tracks in parallel (like existing semaphore pattern) or sequentially
- Cover art extraction strategy for MP3 folders (embedded in first track, cover.jpg in folder, etc.)
- Error handling for unreadable/corrupt .mp3 files within a folder
- Whether `has_chapters` in the API response should reflect the track count for MP3 books

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scanner
- `src/scanner/walk.ts` — Current `.m4b`-only file walker that needs extending for MP3 folder detection
- `src/scanner/index.ts` — `scanFile()` and `scanLibrary()` functions; scanFile assumes one file = one book
- `src/scanner/probe.ts` — `probeFile()` and `normalizeMetadata()` — ffprobe integration, works on any audio format
- `src/scanner/cover.ts` — Cover art extraction logic (embedded + fallback)
- `src/scanner/fallback.ts` — `applyFallbackMetadata()` for folder-name-based metadata fallback
- `src/scanner/enrichment.ts` — Audnexus enrichment logic (ASIN-based)

### Schema & Types
- `src/db/schema.ts` — Database schema; chapters table needs `file_path` column added
- `src/types.ts` — `Book`, `Chapter`, `NormalizedMetadata`, `FfprobeOutput` interfaces

### Prior Phase Context
- `.planning/phases/01-foundation/1-CONTEXT.md` — Original scanner decisions (D-01 through D-14)
- `.planning/phases/08-library-rescan-ui/08-CONTEXT.md` — Rescan UI and enrichment decisions

### API & Frontend
- `src/routes/books.ts` — Books API endpoint (may need adjustments for MP3 book responses)
- `src/routes/audio.ts` — Audio streaming route (Phase 11 concern, but worth understanding current state)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `probeFile()` in `src/scanner/probe.ts` — Already works with any audio format ffprobe supports, including MP3. No changes needed for probing individual .mp3 files.
- `normalizeTag()` in `src/scanner/probe.ts` — Handles case-insensitive tag lookup (key, KEY, Key variants). Works with ID3 tags.
- `applyFallbackMetadata()` in `src/scanner/fallback.ts` — Existing folder-name fallback logic. Needs extending for Author/Title path structure.
- `extractCoverArt()` / `resolveCoverPath()` in `src/scanner/cover.ts` — Cover extraction pipeline, reusable for MP3 books.
- Semaphore pattern in `scanLibrary()` — Limits concurrent ffprobe calls to 4. Reuse for parallel track probing.

### Established Patterns
- Scanner uses `db.transaction()` for atomic chapter replacement (delete + insert)
- UPSERT with `ON CONFLICT(file_path)` for idempotent book insertion
- Progress events via `ProgressCallback` type and `scanEmitter` EventEmitter
- Incremental scan via mtime + size comparison (D-02)

### Integration Points
- `walkLibrary()` return type changes from `string[]` (file paths) to something that includes folder-based books
- `scanLibrary()` currently iterates `walkLibrary()` results and calls `scanFile()` per path — needs a new `scanFolder()` equivalent
- `books` API response includes `has_chapters` boolean — MP3 books should report true (tracks are chapters)
- Frontend library grid, player, and progress all key on `book.id` — no changes needed if MP3 books are just books in the DB

</code_context>

<specifics>
## Specific Ideas

- User's audiobook collection includes folders structured as `/Author/Title/trackN.mp3` — the scanner should extract author and title from this path when ID3 tags are absent
- Multi-disc layouts are real in the user's collection — e.g., `/Author/Title/Disc 1/`, `/Author/Title/Disc 2/`
- The existing fallback.ts already does folder-name-based metadata; extending it for the grandparent=author pattern should build on that existing logic

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-mp3-folder-scanner*
*Context gathered: 2026-03-24*
