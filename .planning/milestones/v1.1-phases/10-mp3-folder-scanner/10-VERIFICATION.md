---
phase: 10-mp3-folder-scanner
verified: 2026-03-24T10:30:00Z
status: passed
score: 16/16 must-haves verified
re_verification: false
---

# Phase 10: MP3 Folder Scanner Verification Report

**Phase Goal:** A folder of MP3 files is recognized as one audiobook, scanned with correct metadata and track order, and available in the library grid
**Verified:** 2026-03-24T10:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Plan 01)

| #  | Truth                                                                      | Status     | Evidence                                                                                   |
|----|----------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------|
| 1  | Tracks sort by TRCK tag numerically (1, 2, 10 not 1, 10, 2)               | VERIFIED   | `sortTracks` in mp3-sort.ts; test "sorts numerically, not lexicographically" passes        |
| 2  | Missing TRCK falls back to filename natural sort                           | VERIFIED   | `sortTracks` null-branch uses `localeCompare(..., {numeric:true})`; test passes            |
| 3  | Duplicate TRCK values are tiebroken by filename natural sort               | VERIFIED   | `sortTracks` tiebreak branch; test "tiebreaks duplicate TRCK [1, 1]" passes               |
| 4  | Disc subfolder names (Disc 1, CD2, Part 3, Disk 4) detected and parsed    | VERIFIED   | `DISC_FOLDER_RE` and `parseDiscNumber`; 11 disc-detection tests pass                       |
| 5  | Non-disc folder names return null from parseDiscNumber                     | VERIFIED   | Tests for "Chapter 1", "Random Folder", "Disc" (no number) all return null                 |
| 6  | chapters table has a nullable file_path column after schema init           | VERIFIED   | `ALTER TABLE chapters ADD COLUMN file_path TEXT` in try/catch at schema.ts:89-93           |
| 7  | NormalizedChapter type includes optional file_path field                   | VERIFIED   | `file_path?: string` on NormalizedChapter in types.ts:63; `file_path: string \| null` on Chapter:54 |

### Observable Truths (Plan 02)

| #  | Truth                                                                                     | Status     | Evidence                                                                                         |
|----|-------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------------|
| 8  | A folder of .mp3 files appears as a single book in the library after a rescan             | VERIFIED   | `scanFolder` upserts folderPath to books; scanLibrary branches on `item.kind === 'mp3folder'`    |
| 9  | Tracks are in correct order (track 1, 2, 3 not 1, 10, 2)                                 | VERIFIED   | scanFolder uses `sortTracks` per disc group; "TRCK sort order beats filename order" test passes  |
| 10 | Book title, author, cover art populated from ID3 tags when available                      | VERIFIED   | `mergeTrackMetadata` uses first-track-wins; `extractCoverArt` called when `has_cover_stream`     |
| 11 | When ID3 absent, title falls back to folder name and author to grandparent                | VERIFIED   | `applyFallbackMetadata(..., isFolder=true)`; test "fallback: null ID3 title falls back" passes   |
| 12 | Multi-disc folder layout flattened into one book in correct disc order                    | VERIFIED   | `resolveMp3Files` collects disc subdirs; sort by discNumber then sortTracks; test passes         |
| 13 | Mixed .m4b + .mp3 folder: .m4b wins, .mp3 ignored                                        | VERIFIED   | `walkLibrary` D-03 check: `if (m4bDirs.has(dir)) continue`; test "m4b wins (D-03)" passes       |
| 14 | Standalone .mp3 (not in folder with others) is not treated as a book                     | VERIFIED   | `walkLibrary` requires `mp3Files.length >= 2` for non-disc folders (line 81)                    |
| 15 | MP3 books appear alongside .m4b books in the library grid                                | VERIFIED   | books route uses `EXISTS(SELECT 1 FROM chapters WHERE book_id = books.id)`; both formats write chapters rows |
| 16 | Incremental scan skips unchanged MP3 folders                                              | VERIFIED   | mtime + sizeSum incremental check in `scanFolder:361`; test "incremental scan skips" passes      |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact                          | Expected                                                 | Status     | Details                                                                      |
|-----------------------------------|----------------------------------------------------------|------------|------------------------------------------------------------------------------|
| `src/scanner/mp3-sort.ts`         | parseTrackNumber, sortTracks, parseDiscNumber, DISC_FOLDER_RE | VERIFIED | All 4 exports present; 73 lines, substantive implementation                 |
| `src/scanner/mp3-sort.test.ts`    | Unit tests for all sort and disc detection functions     | VERIFIED   | 27 tests, 3 describe blocks, all pass                                       |
| `src/db/schema.ts`                | chapters.file_path migration                             | VERIFIED   | `ALTER TABLE chapters ADD COLUMN file_path TEXT` at lines 89-93, try/catch idempotent |
| `src/types.ts`                    | NormalizedChapter with optional file_path                | VERIFIED   | `file_path?: string` at line 63; `Chapter.file_path: string \| null` at line 54 |
| `src/scanner/walk.ts`             | ScanItem union type, walkLibrary returning ScanItem[]    | VERIFIED   | 167 lines, exports `ScanItem` and `walkLibrary`, full disc detection logic  |
| `src/scanner/index.ts`            | scanFolder function, updated scanLibrary                 | VERIFIED   | `scanFolder` at line 328, `resolveMp3Files` at 218, `mergeTrackMetadata` at 272, `scanLibrary` updated |
| `src/scanner/fallback.ts`         | applyFallbackMetadata with isFolder mode                 | VERIFIED   | `isFolder?: boolean` parameter at line 41, grandparent author at lines 91-96 |
| `src/scanner/index.test.ts`       | Tests for MP3 folder scanning, multi-disc, mixed, fallback | VERIFIED | 721 lines, 25 new test cases in scanFolder/walkLibrary describe blocks, all pass |

### Key Link Verification

| From                       | To                         | Via                                                     | Status  | Details                                                                  |
|----------------------------|----------------------------|---------------------------------------------------------|---------|--------------------------------------------------------------------------|
| `src/scanner/walk.ts`      | `src/scanner/index.ts`     | ScanItem union consumed by scanLibrary                  | WIRED   | `item.kind === 'mp3folder'` at index.ts:606; `import type { ScanItem }` at line 8 |
| `src/scanner/index.ts`     | `src/scanner/mp3-sort.ts`  | scanFolder imports sortTracks, parseDiscNumber, parseTrackNumber | WIRED | `import { parseTrackNumber, sortTracks, parseDiscNumber }` at line 11   |
| `src/scanner/index.ts`     | `src/db/schema.ts`         | chapter INSERT includes file_path column                | WIRED   | `INSERT INTO chapters (..., file_path) VALUES (...)` at lines 546-548   |
| `src/scanner/fallback.ts`  | `src/scanner/index.ts`     | applyFallbackMetadata called from scanFolder with folder path | WIRED | `applyFallbackMetadata(merged, folderPath, true)` at index.ts:433       |

### Requirements Coverage

| Requirement | Source Plans     | Description                                                                    | Status    | Evidence                                                                           |
|-------------|-----------------|--------------------------------------------------------------------------------|-----------|------------------------------------------------------------------------------------|
| LIBM-04     | 10-02           | Scanner supports MP3 folders — folder of .mp3 files treated as one audiobook   | SATISFIED | `walkLibrary` emits `kind='mp3folder'`; `scanFolder` creates one books row        |
| LIBM-05     | 10-01, 10-02    | MP3 files within a folder are naturally sorted (track ordering)                | SATISFIED | `sortTracks` numeric TRCK + localeCompare natural sort fallback; tests pass        |
| LIBM-06     | 10-02           | MP3 metadata derived from ffprobe ID3 tags with folder/file name fallback      | SATISFIED | `probeFn` extracts ID3 via ffprobe; `applyFallbackMetadata(isFolder=true)` fills gaps |
| LIBM-07     | 10-01, 10-02    | Multi-disc subfolders are flattened into a single book                         | SATISFIED | `resolveMp3Files` collects tracks from disc subfolders; sorted by discNumber      |

All 4 requirements in scope are satisfied. REQUIREMENTS.md marks all four as `[x]` complete under Phase 10.

### Anti-Patterns Found

No blockers or warnings found.

- No stub patterns detected in any phase 10 files
- All exported functions have substantive implementations (no `return null` stubs, no TODO comments)
- Chapter INSERT includes `file_path` column — not orphaned
- `scanFolder` is exported and wired into `scanLibrary`
- `walkLibrary` change is a breaking change that was properly handled: `cover.test.ts` was updated in the same commit (0b3b565) to use the new `ScanItem[]` API

### Human Verification Required

#### 1. MP3 book appears in browser library grid

**Test:** Place a folder of 3+ .mp3 files in the library volume and trigger a rescan via the admin UI. Navigate to the library grid.
**Expected:** The MP3 audiobook appears as a card in the grid alongside any .m4b books, with title and author populated.
**Why human:** Visual appearance of the library grid cannot be verified programmatically. The books API route has been confirmed to use `EXISTS(SELECT 1 FROM chapters WHERE book_id = books.id)` which correctly includes MP3 books (whose chapters carry `file_path`), but actual browser rendering requires human confirmation.

#### 2. Cover art from embedded MP3 tag or folder image

**Test:** Use an MP3 folder with an embedded album art tag OR a `cover.jpg` file in the folder.
**Expected:** The library card shows the cover image.
**Why human:** `extractCoverArt` and the inline folder image scan are wired correctly in code, but actual image display in the browser requires human confirmation.

### Gaps Summary

No gaps. All automated checks pass.

All 16 must-have truths are verified, all 8 required artifacts are substantive and wired, all 4 key links are active, and all 4 requirement IDs (LIBM-04, LIBM-05, LIBM-06, LIBM-07) are satisfied. The full test suite runs 220 tests with 0 failures. Phase 10 goal is achieved.

---

_Verified: 2026-03-24T10:30:00Z_
_Verifier: Claude (gsd-verifier)_
