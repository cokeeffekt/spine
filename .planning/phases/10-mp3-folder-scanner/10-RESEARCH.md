# Phase 10: MP3 Folder Scanner - Research

**Researched:** 2026-03-24
**Domain:** Node.js/Bun scanner extension — MP3 folder detection, natural sort, ID3 metadata, multi-disc handling, schema migration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Folder Detection**
- D-01: Any folder containing at least one .mp3 file is treated as an audiobook candidate.
- D-02: A single standalone .mp3 file (not inside a subfolder with other .mp3 files) is NOT a book. Only folders with .mp3 files become books.
- D-03: If a folder contains both .m4b and .mp3 files, the .m4b wins — .mp3 files in that folder are ignored.
- D-04: Only "leaf" folders become MP3 books — a folder with .mp3 files is a book only if it has no child folders that also contain .mp3 files. Exception: disc subfolders (D-12) merge into the parent.
- D-05: Folder path hierarchy as metadata fallback: grandparent folder = author, parent folder = title. ID3 tags always win.

**Book Identity & Schema**
- D-06: MP3 books use the folder path as `file_path` in the existing `books` table (e.g., `/library/Author/Title/`). One folder = one book.
- D-07: Individual MP3 tracks stored in the existing `chapters` table. A new nullable `file_path` column is added to `chapters` — NULL for m4b chapters, populated with the .mp3 file path for MP3 tracks.
- D-08: `duration_sec` for an MP3 book is the sum of all track durations. Each track probed individually with ffprobe.
- D-09: Incremental scan uses folder mtime + sum of all .mp3 file sizes. If either changes, entire folder is re-probed. Stored in existing `file_mtime` and `file_size` columns.
- D-10: ASIN derived from ID3 tags if available (comment/custom tags). If found, stored for Audnexus enrichment. If not, enrichment skips the book.

**Track Ordering**
- D-11: Primary sort key is ID3 track number tag (TRCK). If missing or duplicate, fall back to natural sort of filenames. Track number gaps ignored. Duplicate track numbers broken by natural filename sort. No warnings on edge cases.

**Multi-Disc Handling**
- D-12: Disc subfolders detected by pattern (case-insensitive): Disc, CD, Part, Disk + a number (e.g., "Disc 1", "Disc1", "CD 2", "CD2", "Part 1", "Disk 3"). Their .mp3 files merge into the parent as one book.
- D-13: Disc ordering uses the number extracted from the folder name. Within each disc, tracks sorted per D-11.
- D-14: If parent folder has both loose .mp3 files AND disc subfolders, loose files are ignored.

### Claude's Discretion

- Exact regex for disc subfolder pattern matching
- How to handle deeply nested disc structures (Disc 1/Part A/ etc.) — flatten or reject
- Whether to probe all tracks in parallel (like existing semaphore pattern) or sequentially
- Cover art extraction strategy for MP3 folders (embedded in first track, cover.jpg in folder, etc.)
- Error handling for unreadable/corrupt .mp3 files within a folder
- Whether `has_chapters` in the API response should reflect the track count for MP3 books

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. Phase 11 handles playback (source-swapping at track boundaries).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIBM-04 | Scanner supports MP3 folders — a folder of .mp3 files is treated as one audiobook | `walkLibrary()` return type refactor + new `scanFolder()` function mirrors existing `scanFile()` |
| LIBM-05 | MP3 files within a folder are naturally sorted (track ordering) | Natural sort algorithm: parse TRCK tag, fall back to filename natural sort (numeric segment comparison) |
| LIBM-06 | MP3 metadata derived from ffprobe ID3 tags with folder/file name fallback | `probeFile()` works for MP3 already; `normalizeMetadata()` reads ID3 tags via `format.tags`; `applyFallbackMetadata()` extends with grandparent=author path logic |
| LIBM-07 | Multi-disc subfolders are flattened into a single book | Regex disc-folder detection + disc number extraction + merge tracks into parent book |
</phase_requirements>

---

## Summary

Phase 10 extends the existing library scanner to recognize folders of .mp3 files as single audiobooks. The core ffprobe infrastructure (`probeFile`, `normalizeMetadata`) already handles MP3 format with no changes needed — it is audio-format-agnostic. The work is entirely in the scanner orchestration layer: detecting MP3 book folders in `walkLibrary()`, a new `scanFolder()` function that probes each track, merges metadata, and stores tracks as chapters with their individual file paths in a new `chapters.file_path` column.

The two most technically specific problems are: (1) natural sort for track ordering — JavaScript's `Array.sort` with `localeCompare` using `{ numeric: true }` collation handles this cleanly and is verified working in Bun; (2) the `chapters` schema migration — a nullable `file_path TEXT` column must be added via a try/catch `ALTER TABLE` following the established idempotent migration pattern already used for `asin` and `last_login_at`.

The existing semaphore pattern (max 4 concurrent ffprobe calls) applies directly to per-track probing within `scanFolder()`. Multi-disc handling requires no new libraries — pure path analysis with a regex match and integer extraction from folder names. Cover art resolution for MP3 folders reuses `resolveCoverPath()` (already scans a directory for image files) and `extractCoverArt()` (extracts embedded pic from the first track that has one).

**Primary recommendation:** Add `chapters.file_path` migration, refactor `walkLibrary()` return type to carry both m4b paths and MP3 folder descriptors, implement `scanFolder()` parallel to `scanFile()`, and extend `applyFallbackMetadata()` for the grandparent=author path convention. No new npm dependencies needed.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bun:sqlite` | built-in (Bun 1.2.x) | Database — chapters migration, UPSERT | Already used; `bun:sqlite` replaces `better-sqlite3` per project decision |
| ffprobe | 7.x (system) | ID3 tag extraction and track duration | Works for MP3 via `format.tags`; no changes to `probeFile()` needed |
| Node.js `fs` + `path` | built-in | Directory traversal, mtime/size stat | Already used in `walkLibrary()`, `cover.ts`, `fallback.ts` |

### No New Dependencies

This phase adds zero npm packages. All capabilities needed (directory walking, spawning ffprobe, SQLite migrations, path analysis) are already present in the codebase.

---

## Architecture Patterns

### Recommended Project Structure (new/changed files)

```
src/
├── scanner/
│   ├── walk.ts          # Extend: return type carries m4b paths + MP3 folder descriptors
│   ├── index.ts         # Extend: scanLibrary() handles new ScanItem union type; add scanFolder()
│   ├── probe.ts         # No changes — already works for MP3
│   ├── cover.ts         # No changes — resolveCoverPath() already scans dir for images
│   ├── fallback.ts      # Extend: grandparent=author path logic
│   └── mp3-sort.ts      # New: naturalSort() + resolveTrackOrder() utilities
├── db/
│   └── schema.ts        # Extend: chapters.file_path migration
└── types.ts             # Extend: NormalizedChapter gets optional file_path field
```

### Pattern 1: Walk Return Type as Union

`walkLibrary()` currently returns `string[]` (m4b file paths). With MP3 folders, it needs to return items that are either a file path (m4b) or a folder descriptor (mp3 book). The discriminated union approach keeps `scanLibrary()` straightforward:

```typescript
// src/scanner/walk.ts

export type ScanItem =
  | { kind: 'file'; path: string }             // .m4b single file
  | { kind: 'mp3folder'; folderPath: string }  // folder of .mp3 tracks

export function walkLibrary(root: string): ScanItem[] { ... }
```

`scanLibrary()` then branches: `item.kind === 'file'` → `scanFile()`, `item.kind === 'mp3folder'` → `scanFolder()`.

The `paths` variable used in the "mark missing" UPDATE query must be built from both kinds — m4b file paths AND mp3 folder paths — so the `NOT IN (...)` check covers both.

### Pattern 2: Natural Sort for Track Ordering (D-11)

JavaScript's `String.prototype.localeCompare` with `{ numeric: true }` collation handles the `01-chapter.mp3 < 02-chapter.mp3 < 10-chapter.mp3` problem correctly — it parses numeric segments and compares them as integers. This is built-in, no library needed.

```typescript
// src/scanner/mp3-sort.ts

/**
 * Parse TRCK ID3 tag (may be "3" or "3/12" disc-track format).
 * Returns the track number as integer, or null if absent/invalid.
 */
export function parseTrackNumber(trck: string | null | undefined): number | null {
  if (!trck) return null;
  const n = parseInt(trck.split('/')[0], 10);
  return isNaN(n) ? null : n;
}

/**
 * Sort an array of { filePath, trackNumber } by:
 *   1. trackNumber (ascending, nulls last)
 *   2. filePath basename natural sort (numeric collation) as tiebreaker
 */
export function sortTracks(
  tracks: Array<{ filePath: string; trackNumber: number | null }>
): Array<{ filePath: string; trackNumber: number | null }> {
  return [...tracks].sort((a, b) => {
    // Both have track numbers → compare numerically
    if (a.trackNumber !== null && b.trackNumber !== null) {
      if (a.trackNumber !== b.trackNumber) return a.trackNumber - b.trackNumber;
      // Same track number → tiebreak by filename natural sort
    }
    // One or both missing → nulls go last, tiebreak by filename
    if (a.trackNumber === null && b.trackNumber !== null) return 1;
    if (a.trackNumber !== null && b.trackNumber === null) return -1;
    // Both null or equal track number → natural sort by basename
    return path.basename(a.filePath).localeCompare(
      path.basename(b.filePath),
      undefined,
      { numeric: true, sensitivity: 'base' }
    );
  });
}
```

### Pattern 3: Disc Folder Detection and Merging (D-12, D-13, D-14)

```typescript
// Regex for disc subfolder names — Claude's discretion area
const DISC_FOLDER_RE = /^(?:disc|disk|cd|part)\s*(\d+)$/i;

/**
 * Given a folder path, check if it is a disc subfolder.
 * Returns the disc number (1-based) or null.
 */
export function parseDiscNumber(folderName: string): number | null {
  const m = folderName.match(DISC_FOLDER_RE);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Resolve all .mp3 files for an MP3 book folder, handling multi-disc layout.
 * Returns files grouped by disc (disc 0 = root/loose files when no disc folders).
 *
 * Per D-14: if disc subfolders exist, loose files in parent are ignored.
 */
export function resolveMp3Files(
  folderPath: string
): { filePath: string; discNumber: number }[] { ... }
```

For deeply nested disc structures (Disc 1/Part A/ — Claude's discretion): flatten all `.mp3` files found anywhere inside a disc subfolder, treating the disc subfolder as a flat container. This is the pragmatic choice — it handles edge cases without requiring users to restructure their libraries.

### Pattern 4: scanFolder() — Parallel to scanFile()

```typescript
export async function scanFolder(
  db: Database,
  folderPath: string,
  probeFn: ProbeFn = defaultProbeFn
): Promise<void> {
  // 1. Stat the folder for mtime
  // 2. Collect all .mp3 files (via resolveMp3Files, handles disc layout)
  // 3. Compute file_size = sum of individual .mp3 file sizes
  // 4. Incremental check: folder mtime + size_sum unchanged? Skip.
  // 5. Probe all tracks in parallel (semaphore: 4 concurrent, same pattern as scanLibrary)
  // 6. Sort tracks per D-11 (sortTracks)
  // 7. Merge metadata: use first track's tags, fill nulls from subsequent tracks
  // 8. Apply applyFallbackMetadata (with grandparent=author extension)
  // 9. UPSERT into books (folderPath as file_path)
  // 10. Extract/resolve cover art (embedded from first track, then folder images)
  // 11. Atomically replace chapters with file_path column populated
}
```

### Pattern 5: Chapter file_path — Schema Migration

The `chapters` table needs a nullable `file_path TEXT` column. Following the established idempotent migration pattern:

```typescript
// src/db/schema.ts — add after existing migrations

// Migration: add file_path column to chapters for MP3 track references
try {
  db.exec(`ALTER TABLE chapters ADD COLUMN file_path TEXT`)
} catch {
  // Column already exists — safe to ignore
}
```

The chapter INSERT statement in `scanFolder()` includes `file_path`:
```sql
INSERT INTO chapters (book_id, chapter_idx, title, start_sec, end_sec, duration_sec, file_path)
VALUES (?, ?, ?, ?, ?, ?, ?)
```

For m4b books, `scanFile()` does NOT change — existing inserts leave `file_path` as NULL (default), which is correct per D-07.

### Pattern 6: Metadata Merge Across Tracks

For an MP3 book, metadata is assembled from all track probes:
- Use the first track's tags as the primary source
- For each null field, scan subsequent tracks for a non-null value
- This handles cases where track 1 lacks an author tag but track 2 has it

```typescript
function mergeTrackMetadata(metas: NormalizedMetadata[]): NormalizedMetadata {
  if (metas.length === 0) throw new Error('No tracks to merge');
  const result = { ...metas[0] };
  for (const meta of metas.slice(1)) {
    if (result.title === null) result.title = meta.title;
    if (result.author === null) result.author = meta.author;
    if (result.narrator === null) result.narrator = meta.narrator;
    if (result.series_title === null) result.series_title = meta.series_title;
    if (result.series_position === null) result.series_position = meta.series_position;
    if (result.description === null) result.description = meta.description;
    if (result.genre === null) result.genre = meta.genre;
    if (result.publisher === null) result.publisher = meta.publisher;
    if (result.year === null) result.year = meta.year;
    if (result.language === null) result.language = meta.language;
    if (result.asin === null) result.asin = meta.asin;
    if (!result.has_cover_stream) result.has_cover_stream = meta.has_cover_stream;
  }
  // duration_sec = sum (not from tags)
  result.duration_sec = metas.reduce((sum, m) => sum + (m.duration_sec ?? 0), 0);
  // chapters = assembled track list (built separately in scanFolder)
  return result;
}
```

### Pattern 7: Cover Art for MP3 Folders (Claude's Discretion)

Strategy (in priority order):
1. Check each track (in order) for `has_cover_stream` — extract from first track that has one using existing `extractCoverArt(trackPath, true, bookId)`
2. If no embedded cover in any track: call `resolveCoverPath(folderPath, false, bookId)` — it already scans the directory for `cover.jpg`, `cover.jpeg`, `cover.png`, `folder.jpg`, `folder.png`

`cover.ts` currently takes an `m4bPath` parameter but only uses `path.dirname(m4bPath)` for the directory fallback scan. For MP3 folders, passing the folder path directly (which IS the directory) means `path.dirname(folderPath)` returns the parent — that's wrong. The planner should note that `resolveCoverPath` needs a small extension for the MP3 folder case: check for cover images in `folderPath` directly (not its parent).

### Pattern 8: applyFallbackMetadata Extension (D-05)

Current behavior: `path.basename(dir)` as title fallback when title is null, using `path.dirname(filePath)` as `dir`. For MP3 books, `filePath` IS the folder path, so `path.dirname(folderPath)` is the grandparent. The extension:

```typescript
// In applyFallbackMetadata, for MP3 folders (indicated by folderPath ending in '/')
// or by receiving the folder path directly:

// For MP3 books: folderPath = /library/Author/Title/
// path.basename(folderPath) = "" (trailing slash) or "Title"
// path.dirname(folderPath) = /library/Author

if (result.title === null) {
  result.title = path.basename(folderPath.replace(/\/$/, ''));
}
if (result.author === null) {
  const parent = path.dirname(folderPath.replace(/\/$/, ''));
  const grandparent = path.basename(parent);
  // Only use as author if it doesn't look like the library root
  if (grandparent && grandparent !== '.') {
    result.author = grandparent;
  }
}
```

The planner should decide whether to extend `applyFallbackMetadata` to accept an optional `bookType: 'file' | 'folder'` parameter, or create `applyMp3FallbackMetadata()` as a parallel function. The parallel function approach avoids changing the existing well-tested function's signature.

### Pattern 9: Missing-Book Tracking for Mixed Library

The "mark missing" query in `scanLibrary()` currently builds `NOT IN (${placeholders})` from `paths` (the string array of .m4b file paths). After the refactor, this array must include both m4b file paths AND mp3 folder paths:

```typescript
const allPaths = items.map(item =>
  item.kind === 'file' ? item.path : item.folderPath
);
```

The `NOT IN` query remains valid — `file_path` in the books table stores either format, so the comparison works correctly.

### Anti-Patterns to Avoid

- **Changing scanFile() to handle MP3:** `scanFile()` is well-tested and assumes one file = one book. Keep it untouched. MP3 folders get `scanFolder()`.
- **Rewriting walkLibrary() return type as `string[]` with heuristics:** The current callers assume string[]. A clean discriminated union avoids stringly-typed detection downstream.
- **Using `sort()` with numeric comparison on raw filenames:** `"10.mp3" < "2.mp3"` lexicographically. Always use `localeCompare({ numeric: true })` or explicit TRCK parsing.
- **Probing tracks sequentially:** An MP3 book may have 30+ tracks. The existing semaphore pattern (4 concurrent) must be applied to per-track probing within `scanFolder()`, not sequential awaits.
- **Using `path.dirname()` on a trailing-slash folder path:** `path.dirname('/library/Author/Title/')` returns `/library/Author/Title` (trims trailing slash but doesn't go up). Always normalize trailing slashes before dirname calls.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Natural sort | Custom regex-based numeric comparator | `String.localeCompare(b, undefined, { numeric: true })` | Built-in, handles Unicode, Bun-compatible, tested |
| Track number parsing | Complex TRCK tag normalization | `parseInt(trck.split('/')[0], 10)` | TRCK format is either "N" or "N/Total" — split on '/' suffices |
| ID3 tag reading | Custom MP3 binary parser | `probeFile()` + ffprobe — already reads `format.tags` for any audio format | ffprobe is the canonical metadata tool; it handles ID3v1, ID3v2, ID3v2.4 |
| Concurrent probing | Manual Promise queue | The existing semaphore pattern (Set of active promises + Promise.race) | Already in `scanLibrary()`, copy-paste to `scanFolder()` |
| Image detection in folder | Custom MIME detection | `resolveCoverPath()` already scans for cover.jpg/folder.jpg/any .jpg/.png | Existing code handles all common image names |

**Key insight:** This phase is entirely orchestration work on top of solid existing infrastructure. The hard problems (ffprobe, concurrency, DB upsert, cover art) are already solved. The new code is folder traversal logic, a natural sort utility, and a schema migration.

---

## Common Pitfalls

### Pitfall 1: Trailing Slash on Folder Paths
**What goes wrong:** `path.dirname('/library/Author/Title/')` returns `/library/Author/Title` instead of `/library/Author`. `path.basename('/library/Author/Title/')` returns `''` instead of `'Title'`.
**Why it happens:** `path.dirname` and `path.basename` treat trailing slashes as part of the path.
**How to avoid:** Normalize folder paths before all path operations: `folderPath.replace(/\/+$/, '')` or `path.normalize(folderPath)`. Store folder paths with a trailing slash for visual clarity (convention) but strip before path operations.
**Warning signs:** Author or title metadata falls back to empty string or the wrong directory level.

### Pitfall 2: Folder mtime Does Not Reflect Track Changes
**What goes wrong:** Adding or replacing an .mp3 file inside a subfolder (disc folder) may not update the parent folder's mtime on some Linux filesystems.
**Why it happens:** Linux mtime for a directory only updates when direct children are added/removed, not when nested descendants change.
**How to avoid:** Per D-09, use `folder mtime + sum of .mp3 file sizes`. The size sum catches file replacements even when mtime is not bumped. This is already the decided approach.
**Warning signs:** Updated tracks not re-scanned on incremental runs.

### Pitfall 3: D-04 Leaf Folder Rule with Disc Subfolders
**What goes wrong:** A folder like `/Author/Title/` has no direct .mp3 files — only in `Disc 1/` and `Disc 2/`. Without disc subfolder awareness, `walkLibrary()` might classify the disc folders as leaf MP3 books instead of the parent.
**Why it happens:** The leaf-folder rule (D-04) says "a folder with .mp3 files is a book only if it has no child folders with .mp3 files." Disc subfolders trigger this.
**How to avoid:** Check child folder names against the disc regex BEFORE applying the leaf rule. If all child folders match the disc pattern, the parent is the book (disc folders merge in). Only if children have non-disc-pattern .mp3 folders does the leaf rule exclude the parent.
**Warning signs:** Multi-disc books appear as 2–4 separate half-books in the library.

### Pitfall 4: chapters INSERT Missing file_path
**What goes wrong:** If `scanFile()` is modified to include `file_path` in its chapter INSERT but no value is provided, SQLite throws a NOT NULL constraint error (or inserts null if nullable, silently breaking Phase 11).
**Why it happens:** Schema change adds a column without updating INSERT statements.
**How to avoid:** Make `file_path` explicitly nullable (TEXT with no NOT NULL). `scanFile()` does NOT change its INSERT — the new column defaults to NULL. Only `scanFolder()` populates it.
**Warning signs:** Existing m4b chapter inserts fail after migration.

### Pitfall 5: normalizeMetadata() Uses 'track' Tag for series_position
**What goes wrong:** `normalizeTag(tags, 'track', 'series-part')` in `normalizeMetadata()` reads the TRCK tag as `series_position`. For MP3 tracks, TRCK is the track number (e.g., "3/12"), not series position.
**Why it happens:** The `normalizeMetadata()` function was written for m4b where `track` is rarely an ID3 track number and more often a custom tag.
**How to avoid:** In `scanFolder()`, after calling `normalizeMetadata()` per track, discard `series_position` derived from `track` tags when it looks like a track number (matches `/^\d+(?:\/\d+)?$/`). The track number is read separately via `normalizeTag(tags, 'TRCK', 'track')` in the sort step. The metadata merge should prefer non-numeric series_position values.
**Warning signs:** Books showing "3" or "3/12" as their series position.

### Pitfall 6: Missing Books Check Covers MP3 Folders
**What goes wrong:** After refactoring `walkLibrary()`, the "mark missing" query still uses the old `paths` string array — which may only contain m4b paths if the refactor is incomplete.
**Why it happens:** The missing-book logic is in `scanLibrary()` and must be updated alongside the walk refactor.
**How to avoid:** Build `allPaths` from the new `ScanItem[]` result, including both m4b `path` and mp3folder `folderPath` values. The SQL `NOT IN` comparison works correctly because `file_path` in the DB stores both formats.
**Warning signs:** MP3 books immediately marked `is_missing=1` on every incremental scan.

### Pitfall 7: Cover Art from Track vs. Folder
**What goes wrong:** `extractCoverArt()` is passed a folder path instead of a file path, causing ffmpeg to fail (it can't extract a picture stream from a directory).
**Why it happens:** The cover extraction step for MP3 books must target a specific track file, not the folder.
**How to avoid:** In `scanFolder()`, find the first track with `has_cover_stream === true` and pass that track's file path (not the folder path) to `extractCoverArt()`. Only fall back to `resolveCoverPath()` scanning the directory if no track has an embedded cover.
**Warning signs:** Cover art extraction failing silently for all MP3 books.

---

## Code Examples

### Natural Sort — Verified Pattern

```typescript
// localeCompare with numeric collation — built into V8/Bun
// Source: MDN Web Docs — String.prototype.localeCompare()
const files = ['10-epilogue.mp3', '2-chapter.mp3', '1-intro.mp3', '10b-extra.mp3'];
files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
// Result: ['1-intro.mp3', '2-chapter.mp3', '10-epilogue.mp3', '10b-extra.mp3']
```

### Disc Regex — Recommended Pattern

```typescript
// Covers: "Disc 1", "Disc1", "DISC 2", "CD 3", "CD3", "Part 4", "Disk 5"
// Capture group 1 is the disc number
const DISC_FOLDER_RE = /^(?:disc|disk|cd|part)\s*(\d+)$/i;

// Usage:
function parseDiscNumber(folderName: string): number | null {
  const m = folderName.match(DISC_FOLDER_RE);
  return m ? parseInt(m[1], 10) : null;
}
```

### Schema Migration — Established Pattern

```typescript
// Follows existing pattern in schema.ts (asin column, last_login_at column)
// Source: src/db/schema.ts lines 74-86
try {
  db.exec(`ALTER TABLE chapters ADD COLUMN file_path TEXT`)
} catch {
  // Column already exists — safe to ignore (bun:sqlite throws on duplicate ADD COLUMN)
}
```

### Incremental Check for Folder — mtime + size_sum

```typescript
// For MP3 folder, file_size stored as sum of all .mp3 sizes
// file_mtime stored as folder's own mtime (ms since epoch)
const folderStat = fs.statSync(folderPath);
const folderMtime = folderStat.mtimeMs;
const sizeSum = mp3Files.reduce((sum, f) => sum + fs.statSync(f).size, 0);

const existing = db.query(
  "SELECT file_mtime, file_size FROM books WHERE file_path = ?"
).get(folderPath) as { file_mtime: number; file_size: number } | null;

if (existing && existing.file_mtime === folderMtime && existing.file_size === sizeSum) {
  return; // unchanged — skip re-probe
}
```

### Chapter Timestamps for Ordered Tracks

MP3 tracks are stored as chapters with cumulative timestamps (start/end relative to the book start, not individual track start):

```typescript
let cumulativeSec = 0;
const chapters = sortedTracks.map((track, idx) => {
  const duration = track.metadata.duration_sec ?? 0;
  const chapter = {
    chapter_idx: idx,
    title: track.metadata.title ?? path.basename(track.filePath, '.mp3'),
    start_sec: cumulativeSec,
    end_sec: cumulativeSec + duration,
    duration_sec: duration,
    file_path: track.filePath,   // new column for Phase 11
  };
  cumulativeSec += duration;
  return chapter;
});
```

This is critical: Phase 11's player uses `start_sec`/`end_sec` relative to the book to drive seek and progress. If timestamps are stored per-track (always starting at 0), seeking across tracks breaks.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `better-sqlite3` as SQLite driver | `bun:sqlite` (built-in) — per project decision in STATE.md | All schema code uses `bun:sqlite`; CLAUDE.md stack table lists better-sqlite3 but project made this decision early. Confirmed in `src/db/schema.ts` and `src/scanner/index.ts` imports. |
| `fluent-ffmpeg` wrapper | Direct `child_process.spawn` + ffprobe — already implemented | Already in `probe.ts`; no change needed |
| Express | Hono 4.12.x — already in use | Already in `package.json` |

**Note on bun:sqlite vs better-sqlite3:** CLAUDE.md's technology stack table recommends better-sqlite3, but STATE.md records the actual project decision: "bun:sqlite (built-in) for database — better-sqlite3 incompatible with Bun runtime." The codebase uses `bun:sqlite` throughout. All schema and scanner code in this phase must use `bun:sqlite`.

---

## Open Questions

1. **normalizeMetadata() TRCK collision with series_position**
   - What we know: `normalizeTag(tags, 'track', 'series-part')` reads the TRCK tag as `series_position` in the existing function
   - What's unclear: Whether real-world MP3 files in the user's collection carry a `track` or `TRACK` tag that differs from TRCK, or whether TRCK = track = same field
   - Recommendation: In `scanFolder()`, after calling `normalizeMetadata()`, null out `series_position` if it matches the numeric-only track number pattern `/^\d+(?:\/\d+)?$/`. Read TRCK separately for sort ordering. Low risk: if series_position is something like "Book 1 of 5", the pattern won't match it.

2. **ProbeFn type signature for scanFolder()**
   - What we know: `ProbeFn` is `(filePath: string) => Promise<NormalizedMetadata>` — works for individual tracks
   - What's unclear: Whether tests need a `FolderProbeFn` type for injecting multiple fixture metadata objects at once
   - Recommendation: Keep `ProbeFn` as-is; in tests, inject a `probeFn` that returns different metadata based on which file path it receives (a Map-based factory). No type change needed.

3. **Deeply nested disc structures (Disc 1/Part A/)**
   - What we know: D-12 says disc subfolders merge into parent; no decision on deeper nesting
   - What's unclear: Whether the user's actual collection has this
   - Recommendation (Claude's discretion): Flatten recursively — collect all `.mp3` files anywhere inside a matched disc subfolder. One-level vs. recursive makes no difference in code complexity and handles the edge case without error.

---

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json` — section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bun test runner (built-in) |
| Config file | None — `bun test` auto-discovers `*.test.ts` |
| Quick run command | `bun test src/scanner/` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| LIBM-04 | MP3 folder detected and stored as single book | unit | `bun test src/scanner/index.test.ts` | ✅ (extend existing) |
| LIBM-04 | .m4b + .mp3 same folder → m4b wins, no duplicate book | unit | `bun test src/scanner/index.test.ts` | ❌ Wave 0 |
| LIBM-04 | Standalone .mp3 (not in folder) → not treated as book | unit | `bun test src/scanner/index.test.ts` | ❌ Wave 0 |
| LIBM-04 | chapters.file_path schema migration is idempotent | unit | `bun test src/db/schema.test.ts` | ❌ Wave 0 |
| LIBM-05 | Tracks sorted by TRCK tag numerically (1, 2, 10 not 1, 10, 2) | unit | `bun test src/scanner/mp3-sort.test.ts` | ❌ Wave 0 |
| LIBM-05 | TRCK missing → filename natural sort | unit | `bun test src/scanner/mp3-sort.test.ts` | ❌ Wave 0 |
| LIBM-05 | Duplicate TRCK → tiebreak by filename natural sort | unit | `bun test src/scanner/mp3-sort.test.ts` | ❌ Wave 0 |
| LIBM-06 | ID3 tags populate title, author from first track | unit | `bun test src/scanner/index.test.ts` | ❌ Wave 0 |
| LIBM-06 | Null ID3 title → folder name fallback | unit | `bun test src/scanner/index.test.ts` | ❌ Wave 0 |
| LIBM-06 | Null ID3 author → grandparent folder name fallback | unit | `bun test src/scanner/index.test.ts` | ❌ Wave 0 |
| LIBM-06 | Chapter timestamps are cumulative across tracks | unit | `bun test src/scanner/index.test.ts` | ❌ Wave 0 |
| LIBM-07 | Disc subfolders merged into parent as single book | unit | `bun test src/scanner/index.test.ts` | ❌ Wave 0 |
| LIBM-07 | Disc ordering: Disc 1 tracks before Disc 2 tracks | unit | `bun test src/scanner/index.test.ts` | ❌ Wave 0 |
| LIBM-07 | Parent loose files ignored when disc subfolders present | unit | `bun test src/scanner/index.test.ts` | ❌ Wave 0 |
| LIBM-07 | parseDiscNumber matches Disc1, Disc 2, CD3, Part 1, Disk 4 | unit | `bun test src/scanner/mp3-sort.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test src/scanner/`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/scanner/mp3-sort.test.ts` — covers LIBM-05 natural sort, LIBM-07 disc detection
- [ ] New test cases in `src/scanner/index.test.ts` — covers LIBM-04, LIBM-06, LIBM-07 integration
- [ ] New test cases in `src/db/schema.test.ts` — covers chapters.file_path migration idempotency

---

## Sources

### Primary (HIGH confidence)

- Codebase reading: `src/scanner/walk.ts`, `probe.ts`, `index.ts`, `cover.ts`, `fallback.ts`, `enrichment.ts` — current implementation patterns and integration points
- Codebase reading: `src/db/schema.ts` — current schema, migration pattern, bun:sqlite usage
- Codebase reading: `src/types.ts` — NormalizedMetadata, Chapter, FfprobeOutput interfaces
- Codebase reading: `src/scanner/index.test.ts` — established test patterns (bun:test, in-memory DB, fakeProbeFn, tmp dirs)
- Codebase reading: `package.json` — confirmed `bun test` as test runner, zero additional deps
- Codebase reading: `.planning/STATE.md` — confirmed bun:sqlite decision over better-sqlite3
- MDN: `String.prototype.localeCompare()` with `{ numeric: true }` — built-in natural sort

### Secondary (MEDIUM confidence)

- CONTEXT.md (project decisions document) — all D-01 through D-14 decisions are locked
- Bun documentation: `bun:sqlite` API — consistent with schema.ts usage patterns observed

### Tertiary (LOW confidence)

- None — all findings verified against codebase source code

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — confirmed by reading all source files; bun:sqlite usage confirmed in imports
- Architecture: HIGH — all patterns are extensions of existing verified code; no new libraries
- Pitfalls: HIGH for Pitfalls 1–4 (confirmed by reading code); MEDIUM for Pitfalls 5–7 (inferred from patterns)
- Validation: HIGH — test infrastructure confirmed, test commands verified against package.json

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable stack — no external dependency changes expected)
